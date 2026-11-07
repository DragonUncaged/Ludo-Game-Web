import { SAFE_CELLS, TURN_ORDER } from './constants.js';
import { absCell, stepPath } from './path.js';
import { LAST_MAIN_POS, POS_BASE, POS_FINISHED } from './types.js';
import type {
  Capture,
  EngineEvent,
  EnginePlayer,
  GameState,
  Move,
  MoveResult,
  PlayerColor,
  RollResult,
} from './types.js';

export function createGame(colors: PlayerColor[]): GameState {
  const ordered = TURN_ORDER.filter((c) => colors.includes(c));
  if (ordered.length < 2) throw new Error('need at least 2 players');
  if (ordered.length !== colors.length) throw new Error('duplicate or unknown colors');
  const players: EnginePlayer[] = ordered.map((color) => ({
    color,
    tokens: [POS_BASE, POS_BASE, POS_BASE, POS_BASE],
    finishedRank: 0,
  }));
  return { players, current: 0, phase: 'awaitRoll', dice: 0, consecutiveSixes: 0, turnCount: 0 };
}

function clone(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p, tokens: [...p.tokens] as EnginePlayer['tokens'] })),
  };
}

function capturesAt(state: GameState, playerIdx: number, to: number): Capture[] {
  if (to > LAST_MAIN_POS) return [];
  const me = state.players[playerIdx]!;
  const dest = absCell(me.color, to);
  if (dest === null || SAFE_CELLS.has(dest)) return [];
  const captures: Capture[] = [];
  state.players.forEach((p, pi) => {
    if (pi === playerIdx) return;
    p.tokens.forEach((pos, ti) => {
      if (pos >= 0 && pos <= LAST_MAIN_POS && absCell(p.color, pos) === dest) {
        captures.push({ player: pi, tokenIndex: ti, fromPos: pos });
      }
    });
  });
  return captures;
}

export function legalMoves(state: GameState, dice: number): Move[] {
  if (dice < 1 || dice > 6) return [];
  const playerIdx = state.current;
  const player = state.players[playerIdx]!;
  const moves: Move[] = [];
  player.tokens.forEach((pos, tokenIndex) => {
    if (pos === POS_FINISHED) return;
    if (pos === POS_BASE) {
      if (dice !== 6) return;
      moves.push({
        tokenIndex,
        from: POS_BASE,
        to: 0,
        captures: capturesAt(state, playerIdx, 0),
        isExitBase: true,
        isFinish: false,
        entersHome: false,
      });
      return;
    }
    const to = pos + dice;
    if (to > POS_FINISHED) return; // overshoot — token immobile this roll
    moves.push({
      tokenIndex,
      from: pos,
      to,
      captures: capturesAt(state, playerIdx, to),
      isExitBase: false,
      isFinish: to === POS_FINISHED,
      entersHome: pos <= LAST_MAIN_POS && to > LAST_MAIN_POS,
    });
  });
  return moves;
}

function nextActiveIdx(state: GameState, from: number): number {
  const n = state.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n;
    if (state.players[idx]!.finishedRank === 0) return idx;
  }
  return from;
}

function advanceTurn(state: GameState): void {
  state.current = nextActiveIdx(state, state.current);
  state.phase = 'awaitRoll';
  state.dice = 0;
  state.consecutiveSixes = 0;
  state.turnCount++;
}

export function applyRoll(state: GameState, dice: number): RollResult {
  if (state.phase !== 'awaitRoll') throw new Error(`applyRoll in phase ${state.phase}`);
  if (dice < 1 || dice > 6) throw new Error(`bad dice ${dice}`);
  const next = clone(state);
  next.dice = dice;
  next.consecutiveSixes = dice === 6 ? next.consecutiveSixes + 1 : 0;

  if (dice === 6 && next.consecutiveSixes >= 3) {
    advanceTurn(next);
    return { state: next, moves: [], forfeit: true, autoPass: false };
  }
  const moves = legalMoves(next, dice);
  if (moves.length === 0) {
    advanceTurn(next);
    return { state: next, moves: [], forfeit: false, autoPass: true };
  }
  next.phase = 'awaitMove';
  return { state: next, moves, forfeit: false, autoPass: false };
}

export function applyMove(state: GameState, tokenIndex: number): MoveResult {
  if (state.phase !== 'awaitMove') throw new Error(`applyMove in phase ${state.phase}`);
  const move = legalMoves(state, state.dice).find((m) => m.tokenIndex === tokenIndex);
  if (!move) throw new Error(`illegal move: token ${tokenIndex} with dice ${state.dice}`);

  const next = clone(state);
  const playerIdx = next.current;
  const player = next.players[playerIdx]!;
  const events: EngineEvent[] = [];

  player.tokens[tokenIndex] = move.to;
  events.push({ type: 'moved', player: playerIdx, tokenIndex, path: stepPath(move.from, move.to) });

  for (const cap of move.captures) {
    next.players[cap.player]!.tokens[cap.tokenIndex] = POS_BASE;
    events.push({
      type: 'captured',
      player: cap.player,
      tokenIndex: cap.tokenIndex,
      byPlayer: playerIdx,
      atCell: absCell(player.color, move.to)!,
    });
  }

  if (move.isFinish) {
    events.push({ type: 'tokenFinished', player: playerIdx, tokenIndex });
    if (player.tokens.every((t) => t === POS_FINISHED)) {
      const rank = next.players.filter((p) => p.finishedRank > 0).length + 1;
      player.finishedRank = rank;
      events.push({ type: 'playerFinished', player: playerIdx, rank });
    }
  }

  const unfinished = next.players.filter((p) => p.finishedRank === 0);
  if (unfinished.length <= 1) {
    if (unfinished.length === 1) {
      const lastIdx = next.players.findIndex((p) => p.finishedRank === 0);
      next.players[lastIdx]!.finishedRank = next.players.length;
      events.push({ type: 'playerFinished', player: lastIdx, rank: next.players.length });
    }
    next.phase = 'gameOver';
    next.dice = 0;
    const ranking = next.players
      .map((p, i) => ({ i, rank: p.finishedRank }))
      .sort((a, b) => a.rank - b.rank)
      .map((r) => r.i);
    events.push({ type: 'gameOver', ranking });
    return { state: next, events };
  }

  if (next.dice === 6 && player.finishedRank === 0) {
    next.phase = 'awaitRoll';
    events.push({ type: 'extraRoll', player: playerIdx });
    return { state: next, events };
  }

  advanceTurn(next);
  events.push({ type: 'turnChanged', player: next.current });
  return { state: next, events };
}
