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
  /** monotonic per-room broadcast counter — drop events with seq <= last seen */
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
  /** monotonic per-room broadcast counter — drop events with seq <= last seen */
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
export type JoinErrorCode = 'ROOM_FULL' | 'ROOM_STARTED' | 'ALREADY_IN_ROOM' | 'ROOM_NOT_FOUND';
export interface JoinErrorEvent {
  code: JoinErrorCode;
}
export interface TimeResultEvent {
  t0: number;
  server: number;
}
