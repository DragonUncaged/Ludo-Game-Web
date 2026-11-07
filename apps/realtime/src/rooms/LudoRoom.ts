import { randomInt } from 'node:crypto';
import { Room, ServerError } from '@colyseus/core';
import type { Client } from '@colyseus/core';
import {
  DynamicDice,
  FairDice,
  TURN_ORDER,
  applyMove,
  applyRoll,
  chooseBotMove,
  createGame,
  pickBestMove,
} from '@ludo/engine';
import type { DiceRoller, GameState, Move, PlayerColor } from '@ludo/engine';
import { serializeGame } from '@ludo/engine';
import { JOIN_ERROR, computeSettlement, generateJoinCode } from '@ludo/shared';
import type { JoinOptions, MoveIntent, SetOptionsIntent, TimeIntent } from '@ludo/shared';
import {
  abandonMatch,
  awardCoins,
  completeMatch,
  dbEnabled,
  getCoinBalance,
  getPlayerCosmeticsEquipped,
  insertMatch,
  safeWrite,
  updateSnapshot,
  upsertGuestUser,
} from '@ludo/db';
import { LudoState, PlayerSchema } from './schema/LudoState.js';

const BOT_NAMES = ['Clay', 'Doughy', 'Squish', 'Bloop'];

const FAST = process.env.LUDO_FAST === '1';
const T = {
  botRoll: FAST ? 15 : 900,
  botMove: FAST ? 15 : 800,
  autoMove: FAST ? 15 : 1200,
  passDelay: FAST ? 30 : 1200,
  animBase: FAST ? 10 : 200,
  animPerStep: FAST ? 2 : 120,
  animCapture: FAST ? 10 : 900,
  reconnectSec: 120,
};

function pickColors(seats: number): PlayerColor[] {
  if (seats === 2) return ['red', 'yellow'];
  if (seats === 3) return ['red', 'green', 'yellow'];
  return [...TURN_ORDER];
}

export class LudoRoom extends Room<{ state: LudoState; metadata: { joinCode: string } }> {
  maxClients = 4;
  state = new LudoState();

  // Server-private authority — never synced.
  private game!: GameState;
  private dice!: DiceRoller;
  private pendingMoves: Move[] = [];
  private rollsSinceSix: number[] = [];
  private capturesBySeat: number[] = [];
  private turnNonce = 0;
  private deviceTokens = new Map<string, string>(); // sessionId → deviceToken
  private nicknames = new Map<string, string>(); // sessionId → nickname as given at join
  private matchId: number | null = null;
  /** monotonic broadcast counter — lets clients drop duplicate/stale event deliveries */
  private seq = 0;
  private fixedRolls: number[] = (process.env.FIXED_ROLLS ?? '')
    .split(',')
    .map((s) => parseInt(s, 10))
    .filter((n) => n >= 1 && n <= 6);
  private botRng = () => Math.random();

  async onCreate(options: JoinOptions) {
    const code = generateJoinCode((lo, hi) => randomInt(lo, hi));
    this.state.joinCode = code;
    if (options.create) {
      this.state.diceMode = options.create.diceMode === 'fair' ? 'fair' : 'dynamic';
      this.state.turnSeconds = Math.min(60, Math.max(5, options.create.turnSeconds || 20));
      this.maxClients = Math.min(4, Math.max(2, options.create.seats || 4));
    }
    this.onMessage('roll', (client) => {
      const seat = this.seatOf(client.sessionId);
      if (!this.isCurrentHuman(seat) || this.state.turnPhase !== 'awaitRoll') return;
      this.doRoll();
      // A manual roll earns a fresh, full window to CHOOSE the token — otherwise
      // rolling late in the turn timer means the auto-move steals the decision.
      if (this.phase() === 'awaitMove') this.grantMoveWindow();
    });

    this.onMessage('move', (client, msg: MoveIntent) => {
      const seat = this.seatOf(client.sessionId);
      if (!this.isCurrentHuman(seat) || this.state.turnPhase !== 'awaitMove') return;
      this.doMove(msg?.tokenIndex);
    });

    this.onMessage('startGame', (client) => {
      if (client.sessionId !== this.state.hostSessionId) return;
      if (this.state.roomPhase !== 'waiting') return;
      this.startGame();
    });

    this.onMessage('setOptions', (client, msg: SetOptionsIntent) => {
      if (client.sessionId !== this.state.hostSessionId) return;
      if (this.state.roomPhase !== 'waiting') return;
      if (msg?.diceMode === 'fair' || msg?.diceMode === 'dynamic') this.state.diceMode = msg.diceMode;
      if (msg?.turnSeconds) this.state.turnSeconds = Math.min(60, Math.max(5, msg.turnSeconds));
      if (msg?.seats && msg.seats >= 2 && msg.seats <= 4 && msg.seats >= this.state.players.length) {
        this.maxClients = msg.seats;
      }
    });

    this.onMessage('setBetAmount', (client, msg: { betAmount: number }) => {
      if (client.sessionId !== this.state.hostSessionId) return;
      if (this.state.roomPhase !== 'waiting') return;
      const betAmount = Math.max(0, msg?.betAmount ?? 0);
      this.state.betAmount = betAmount;
      this.state.bettingStatus = betAmount === 0 ? 'accepted' : 'in_progress';
      // Reset acceptance when the amount changes; proposing a wager implies the
      // host consents to it (the host UI has no separate Accept button).
      this.state.players.forEach((p) => {
        p.acceptedBet = betAmount > 0 && p.sessionId === client.sessionId;
      });
    });

    this.onMessage('acceptBet', (client) => {
      if (this.state.roomPhase !== 'waiting') return;
      const seat = this.seatOf(client.sessionId);
      if (seat < 0) return;
      const player = this.state.players[seat]!;
      player.acceptedBet = true;
    });

    // Any human can decline, which voids the wager for the whole room.
    this.onMessage('declineBet', (client) => {
      if (this.state.roomPhase !== 'waiting') return;
      if (this.seatOf(client.sessionId) < 0) return;
      this.state.betAmount = 0;
      this.state.bettingStatus = 'accepted';
      this.state.players.forEach((p) => {
        p.acceptedBet = false;
      });
    });

    this.onMessage('time', (client, msg: TimeIntent) => {
      client.send('timeResult', { t0: msg?.t0 ?? 0, server: Date.now() });
    });

    // Watchdog: nothing may stall the room.
    this.clock.setInterval(() => this.watchdog(), 5000);

    await this.setMetadata({ joinCode: code });
  }

  async onJoin(client: Client, options: JoinOptions) {
    if (this.state.roomPhase !== 'waiting') throw new ServerError(JOIN_ERROR.ROOM_STARTED, 'ROOM_STARTED');
    const token = options?.deviceToken ?? '';
    if (token && process.env.ALLOW_DUP_DEVICE !== '1') {
      for (const t of this.deviceTokens.values()) {
        if (t === token) throw new ServerError(JOIN_ERROR.ALREADY_IN_ROOM, 'ALREADY_IN_ROOM');
      }
    }
    this.deviceTokens.set(client.sessionId, token);

    const player = new PlayerSchema();
    player.sessionId = client.sessionId;
    player.nickname = (options?.nickname || 'Player').slice(0, 20);
    this.nicknames.set(client.sessionId, player.nickname);

    if (token && dbEnabled()) {
      try {
        const [balance, equipped] = await Promise.all([
          getCoinBalance(token),
          getPlayerCosmeticsEquipped(token),
        ]);
        if (balance !== null) player.coinBalance = balance;
        // Everyone owns the free default, so only a bought skin is worth showing off.
        if (equipped.character && equipped.character.price > 0) {
          player.equippedCharacter = equipped.character.id;
        }
      } catch (err) {
        console.error('[db] failed to load wallet for joining player', err);
      }
    }

    this.state.players.push(player);
    if (!this.state.hostSessionId) this.state.hostSessionId = client.sessionId;
  }

  /** Unexpected disconnect. Mid-match the seat is held for a while; otherwise onLeave runs next. */
  onDrop(client: Client) {
    const player = this.state.players[this.seatOf(client.sessionId)];
    if (!player || this.state.roomPhase !== 'playing') return;
    player.connected = false;
    // On timeout Colyseus calls onLeave, which hands the seat to a bot.
    this.allowReconnection(client, T.reconnectSec);
  }

  onReconnect(client: Client) {
    const player = this.state.players[this.seatOf(client.sessionId)];
    if (player) player.connected = true;
  }

  onLeave(client: Client) {
    const seat = this.seatOf(client.sessionId);
    if (seat < 0) return;
    const player = this.state.players[seat]!;

    if (this.state.roomPhase === 'waiting') {
      this.state.players.splice(seat, 1);
      this.deviceTokens.delete(client.sessionId);
      this.nicknames.delete(client.sessionId);
      if (this.state.hostSessionId === client.sessionId && this.state.players.length > 0) {
        this.state.hostSessionId = this.state.players[0]!.sessionId;
      }
      return;
    }
    if (this.state.roomPhase === 'ended') return;

    // Gone for good mid-match (quit, or never came back). A bot plays the seat out.
    // Walking out of a wagered match forfeits the stake, otherwise quitting would
    // be a free way out of a losing bet.
    player.connected = false;
    if (player.staked) player.forfeitedBet = true;
    player.isBot = true;
    player.nickname = `${player.nickname} 🤖`;
    if (this.state.currentPlayer === seat && this.state.turnPhase !== 'animating') {
      this.scheduleBotAction(this.turnNonce);
    }
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private seatOf(sessionId: string): number {
    return this.state.players.findIndex((p) => p.sessionId === sessionId);
  }

  /**
   * Nickname as the player typed it. `onLeave` appends a 🤖 marker for the
   * scoreboard, and that decoration must not leak into their stored profile.
   */
  private storedNickname(p: PlayerSchema): string {
    return (this.nicknames.get(p.sessionId) ?? p.nickname).slice(0, 20);
  }

  private isCurrentHuman(seat: number): boolean {
    if (this.state.roomPhase !== 'playing') return false;
    if (seat < 0 || seat !== this.state.currentPlayer) return false;
    const p = this.state.players[seat]!;
    return !p.isBot;
  }

  private currentNeedsAutomation(): boolean {
    const p = this.state.players[this.state.currentPlayer];
    return !!p && (p.isBot || !p.connected);
  }

  /** Widened read — turnPhase is mutated by doRoll/doMove, defeating TS narrowing. */
  private phase(): string {
    return this.state.turnPhase;
  }

  private syncSchema() {
    this.game.players.forEach((ep, i) => {
      const sp = this.state.players[i]!;
      ep.tokens.forEach((t, ti) => {
        if (sp.tokens[ti] !== t) sp.tokens[ti] = t;
      });
      sp.finishedRank = ep.finishedRank;
    });
    this.state.currentPlayer = this.game.current;
    this.state.consecutiveSixes = this.game.consecutiveSixes;
  }

  // ── game flow ────────────────────────────────────────────────────────────

  private startGame() {
    // Validate betting if needed
    if (this.state.betAmount > 0) {
      for (const p of this.state.players) {
        if (p.isBot) continue;
        if (!p.acceptedBet) {
          this.broadcast('error', { message: 'All players must accept the bet to start' });
          return;
        }
        if (p.coinBalance < this.state.betAmount) {
          this.broadcast('error', { message: `${p.nickname} doesn't have enough coins` });
          return;
        }
      }
    }

    // Freeze the bettor list now: everyone here at the whistle has coins on the
    // line for the rest of the match, whatever happens to their seat later.
    if (this.state.betAmount > 0) {
      this.state.players.forEach((p) => (p.staked = !p.isBot));
    }

    const seats = this.maxClients;
    while (this.state.players.length < seats) {
      const bot = new PlayerSchema();
      bot.sessionId = `bot-${this.state.players.length}`;
      bot.nickname = BOT_NAMES[this.state.players.length % BOT_NAMES.length]!;
      bot.isBot = true;
      this.state.players.push(bot);
    }
    const colors = pickColors(seats);
    this.state.players.forEach((p, i) => (p.color = colors[i]!));
    this.state.bettingStatus = 'accepted';

    this.game = createGame(colors);
    this.dice =
      this.state.diceMode === 'fair'
        ? new FairDice((lo, hi) => randomInt(lo, hi))
        : new DynamicDice((lo, hi) => randomInt(lo, hi));
    this.rollsSinceSix = colors.map(() => 0);
    this.capturesBySeat = colors.map(() => 0);
    this.state.roomPhase = 'playing';
    void this.lock();
    this.syncSchema();

    void safeWrite('insert match', async () => {
      const seatRows = await Promise.all(
        this.state.players.map(async (p, seat) => {
          const token = this.deviceTokens.get(p.sessionId);
          const userId = !p.isBot && token ? await upsertGuestUser(token, this.storedNickname(p)) : null;
          return { seat, userId, nickname: p.nickname, color: p.color, isBot: p.isBot };
        })
      );
      this.matchId = await insertMatch(
        { roomId: this.roomId, joinCode: this.state.joinCode, diceMode: this.state.diceMode, seats },
        seatRows
      );
    });

    this.beginTurn();
  }

  private beginTurn() {
    if (this.state.roomPhase !== 'playing') return;
    const seat = this.game.current;
    const nonce = ++this.turnNonce;
    this.state.currentPlayer = seat;
    this.state.turnPhase = 'awaitRoll';
    this.state.dice = 0;
    this.pendingMoves = [];
    this.state.turnDeadline = Date.now() + this.state.turnSeconds * 1000;
    this.broadcast('turnChanged', { seat, deadline: this.state.turnDeadline });
    this.clock.setTimeout(() => this.onTurnTimeout(nonce), this.state.turnSeconds * 1000);
    if (this.currentNeedsAutomation()) this.scheduleBotAction(nonce);
  }

  /** Fresh full deadline for the move phase; invalidates the roll-phase timer. */
  private grantMoveWindow() {
    const nonce = ++this.turnNonce;
    this.state.turnDeadline = Date.now() + this.state.turnSeconds * 1000;
    this.clock.setTimeout(() => this.onTurnTimeout(nonce), this.state.turnSeconds * 1000);
  }

  /** Bots, and players who dropped, act after a short random pause so turns don't fly by. */
  private scheduleBotAction(nonce: number) {
    const stale = () => nonce !== this.turnNonce || this.state.roomPhase !== 'playing';
    const move = () => {
      const choice = chooseBotMove(this.game, this.pendingMoves, 'normal', this.botRng);
      this.doMove(choice.tokenIndex);
    };
    const thinkMs = T.botRoll + Math.floor(Math.random() * (FAST ? 5 : 400));
    const pickMs = T.botMove + Math.floor(Math.random() * 300);

    this.clock.setTimeout(() => {
      if (stale()) return;
      if (this.state.turnPhase === 'awaitMove') {
        move();
      } else if (this.state.turnPhase === 'awaitRoll') {
        this.doRoll();
        if (this.phase() !== 'awaitMove') return;
        this.clock.setTimeout(() => {
          if (!stale() && this.phase() === 'awaitMove') move();
        }, pickMs);
      }
    }, thinkMs);
  }

  private onTurnTimeout(nonce: number) {
    if (nonce !== this.turnNonce || this.state.roomPhase !== 'playing') return;
    if (this.state.turnPhase === 'awaitRoll') {
      this.doRoll(true);
      if (this.phase() === 'awaitMove') {
        this.clock.setTimeout(() => {
          if (nonce !== this.turnNonce || this.state.turnPhase !== 'awaitMove') return;
          this.doMove(pickBestMove(this.game, this.pendingMoves).tokenIndex, true);
        }, T.autoMove);
      }
    } else if (this.state.turnPhase === 'awaitMove') {
      this.doMove(pickBestMove(this.game, this.pendingMoves).tokenIndex, true);
    }
  }

  private doRoll(auto = false) {
    if (this.state.roomPhase !== 'playing' || this.state.turnPhase !== 'awaitRoll') return;
    const seat = this.game.current;
    let value = this.fixedRolls.shift();
    let weights: number[] | undefined;
    if (value === undefined) {
      const roll = this.dice.roll({
        state: this.game,
        playerIdx: seat,
        rollsSinceSix: this.rollsSinceSix[seat] ?? 0,
      });
      value = roll.value;
      weights = roll.weights;
    }
    this.rollsSinceSix[seat] = value === 6 ? 0 : (this.rollsSinceSix[seat] ?? 0) + 1;
    if (weights && this.state.diceMode === 'dynamic') {
      console.debug(
        `[dice] seat=${seat} value=${value} weights=${weights.map((w) => w.toFixed(2)).join(',')}`
      );
    }

    const res = applyRoll(this.game, value);
    this.game = res.state;
    this.state.dice = value;
    this.syncSchema();
    this.broadcast('diceRolled', {
      seq: ++this.seq,
      seat,
      value,
      legalTokens: res.moves.map((m) => m.tokenIndex),
      autoPass: res.autoPass,
      forfeit: res.forfeit,
      auto,
    });

    if (res.forfeit || res.autoPass) {
      this.state.turnPhase = 'animating';
      this.clock.setTimeout(() => this.beginTurn(), T.passDelay);
    } else {
      this.pendingMoves = res.moves;
      this.state.turnPhase = 'awaitMove';
    }
  }

  private doMove(tokenIndex: number, auto = false) {
    if (this.state.roomPhase !== 'playing' || this.state.turnPhase !== 'awaitMove') return;
    const move = this.pendingMoves.find((m) => m.tokenIndex === tokenIndex);
    if (!move) return;
    const seat = this.game.current;
    const res = applyMove(this.game, tokenIndex);
    this.game = res.state;
    this.capturesBySeat[seat] = (this.capturesBySeat[seat] ?? 0) + move.captures.length;
    this.syncSchema();

    const moved = res.events.find((e) => e.type === 'moved');
    const extraRoll = res.events.some((e) => e.type === 'extraRoll');
    const finishedToken = res.events.some((e) => e.type === 'tokenFinished');
    const path = moved?.type === 'moved' ? moved.path : [];

    this.broadcast('moveApplied', {
      seq: ++this.seq,
      seat,
      tokenIndex,
      path,
      captures: move.captures.map((c) => ({ seat: c.player, tokenIndex: c.tokenIndex, fromPos: c.fromPos })),
      finishedToken,
      extraRoll,
      auto,
    });
    for (const e of res.events) {
      if (e.type === 'playerFinished') this.broadcast('playerFinished', { seat: e.player, rank: e.rank });
    }

    if (this.matchId !== null) {
      const matchId = this.matchId;
      const snapshot = serializeGame(this.game);
      void safeWrite('snapshot', () => updateSnapshot(matchId, snapshot));
    }

    const over = res.events.find((e) => e.type === 'gameOver');
    if (over?.type === 'gameOver') {
      this.endGame();
      return;
    }

    this.state.turnPhase = 'animating';
    const animMs = T.animBase + T.animPerStep * path.length + (move.captures.length ? T.animCapture : 0);
    this.clock.setTimeout(() => this.beginTurn(), animMs);
  }

  private endGame() {
    this.state.roomPhase = 'ended';
    this.state.turnPhase = 'awaitRoll';
    this.turnNonce++;
    const ranking = this.state.players
      .map((p, seat) => ({
        seat,
        nickname: p.nickname,
        rank: p.finishedRank,
        captures: this.capturesBySeat[seat] ?? 0,
        tokensHome: p.tokens.filter((t) => t === 56).length,
      }))
      .sort((a, b) => a.rank - b.rank);
    this.broadcast('gameOver', { ranking });

    if (this.matchId !== null) {
      const matchId = this.matchId;
      void safeWrite('complete match', async () => {
        const results = await Promise.all(
          this.state.players.map(async (p, seat) => {
            const token = this.deviceTokens.get(p.sessionId);
            // A player who walked out is flagged isBot for the UI but is still a
            // real account that owes the pot — key off the device token instead.
            const userId = token ? await upsertGuestUser(token, this.storedNickname(p)) : null;
            return {
              seat,
              userId,
              rank: p.finishedRank,
              captures: this.capturesBySeat[seat] ?? 0,
              tokensHome: p.tokens.filter((t) => t === 56).length,
            };
          })
        );
        await completeMatch(matchId, results);

        // Settle the pot against the bettor list frozen at kickoff — `isBot` is
        // true for anyone who quit mid-match, and they must still pay in.
        const settlement = computeSettlement(
          this.state.betAmount,
          results.map((r) => ({
            seat: r.seat,
            isBot: !this.state.players[r.seat]!.staked,
            userId: r.userId,
            rank: r.rank,
            forfeited: this.state.players[r.seat]!.forfeitedBet,
          }))
        );
        if (settlement.winnerId !== null) {
          await awardCoins(matchId, settlement.winnerId, settlement.stake, settlement.loserIds);
        }
      });
    }
  }

  onDispose() {
    this.deviceTokens.clear();
    this.nicknames.clear();
    if (this.matchId !== null && this.state.roomPhase !== 'ended') {
      const matchId = this.matchId;
      void safeWrite('abandon match', () => abandonMatch(matchId));
    }
  }

  private watchdog() {
    if (this.state.roomPhase !== 'playing') return;
    const now = Date.now();
    if (this.state.turnPhase === 'animating') {
      if (now > this.state.turnDeadline + 15000) this.beginTurn();
      return;
    }
    if (now > this.state.turnDeadline + 5000) this.onTurnTimeout(this.turnNonce);
  }
}
