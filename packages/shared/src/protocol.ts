// Wire types shared by client and realtime server.
// The synced Colyseus schema is defined server-side; these are the message payloads.

export type DiceMode = 'fair' | 'dynamic';
export type RoomPhase = 'waiting' | 'playing' | 'ended';
export type TurnPhase = 'awaitRoll' | 'awaitMove' | 'animating';

export interface JoinOptions {
  nickname: string;
  deviceToken: string;
  create?: {
    seats: 2 | 3 | 4;
    diceMode: DiceMode;
    turnSeconds: number;
  };
}

// client → server
export interface MoveIntent {
  tokenIndex: number;
}
export interface SetOptionsIntent {
  seats?: 2 | 3 | 4;
  diceMode?: DiceMode;
  turnSeconds?: number;
}
export interface TimeIntent {
  t0: number;
}

// server → client
export interface DiceRolledEvent {
  /** Grows with every broadcast; drop anything not newer than the last one seen. */
  seq?: number;
  seat: number;
  value: number;
  legalTokens: number[];
  autoPass: boolean;
  forfeit: boolean;
  /** true when the turn timer rolled on the player's behalf */
  auto?: boolean;
}
export interface CaptureInfo {
  seat: number;
  tokenIndex: number;
  fromPos: number;
}
export interface MoveAppliedEvent {
  /** Grows with every broadcast; drop anything not newer than the last one seen. */
  seq?: number;
  seat: number;
  tokenIndex: number;
  path: number[];
  captures: CaptureInfo[];
  finishedToken: boolean;
  extraRoll: boolean;
  /** true when the turn timer moved on the player's behalf */
  auto?: boolean;
}
export interface TurnChangedEvent {
  seat: number;
  deadline: number;
}
export interface PlayerFinishedEvent {
  seat: number;
  rank: number;
}
export interface RankingEntry {
  seat: number;
  nickname: string;
  rank: number;
  captures: number;
  tokensHome: number;
}
export interface GameOverEvent {
  ranking: RankingEntry[];
}
/** Codes the room rejects a join with. Colyseus reserves 4000–4010 for close codes. */
export const JOIN_ERROR = {
  ROOM_STARTED: 4101,
  ALREADY_IN_ROOM: 4102,
} as const;
export interface TimeResultEvent {
  t0: number;
  server: number;
}
