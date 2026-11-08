export const COLORS = ['red', 'green', 'yellow', 'blue'] as const;
export type PlayerColor = (typeof COLORS)[number];

/**
 * Token position encoding, relative to the token's own color:
 *  -1      in base
 *  0..50   main-path progress; absolute cell = (START_OFFSET[color] + pos) % 52
 *  51..55  home-column cell (pos - 51)
 *  56      finished (center home)
 */
export type TokenPos = number;
export const POS_BASE = -1;
export const POS_FINISHED = 56;
export const LAST_MAIN_POS = 50;
export const FIRST_HOME_POS = 51;

export interface EnginePlayer {
  color: PlayerColor;
  tokens: [TokenPos, TokenPos, TokenPos, TokenPos];
  /** 0 = still playing, 1..4 = placement */
  finishedRank: number;
}

export type TurnPhase = 'awaitRoll' | 'awaitMove' | 'gameOver';

export interface GameState {
  players: EnginePlayer[];
  /** index into players */
  current: number;
  phase: TurnPhase;
  /** pending dice value, 0 when none */
  dice: number;
  consecutiveSixes: number;
  turnCount: number;
}

export interface Capture {
  player: number;
  tokenIndex: number;
  /** victim's relative pos before being sent to base */
  fromPos: TokenPos;
}

export interface Move {
  tokenIndex: number;
  from: TokenPos;
  to: TokenPos;
  captures: Capture[];
  isExitBase: boolean;
  isFinish: boolean;
  entersHome: boolean;
}

export interface RollResult {
  state: GameState;
  moves: Move[];
  /** third six in a row: roll thrown away, turn passes */
  forfeit: boolean;
  /** no legal move, turn passes */
  autoPass: boolean;
}

export type EngineEvent =
  | { type: 'moved'; player: number; tokenIndex: number; path: TokenPos[] }
  | { type: 'captured'; player: number; tokenIndex: number; byPlayer: number; atCell: number }
  | { type: 'tokenFinished'; player: number; tokenIndex: number }
  | { type: 'playerFinished'; player: number; rank: number }
  | { type: 'extraRoll'; player: number }
  | { type: 'turnChanged'; player: number }
  | { type: 'gameOver'; ranking: number[] };

export interface MoveResult {
  state: GameState;
  events: EngineEvent[];
}
