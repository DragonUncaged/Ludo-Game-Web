import { Client } from '@colyseus/sdk';
import type { Room } from '@colyseus/sdk';
import { JOIN_ERROR, normalizeJoinCode } from '@ludo/shared';
import type { DiceMode } from '@ludo/shared';

const WS_URL: string = import.meta.env.VITE_WS_URL ?? 'ws://localhost:2567';
const HTTP_URL = WS_URL.replace(/^ws/, 'http');

export const client = new Client(WS_URL);

export interface CreateRoomOpts {
  nickname: string;
  deviceToken: string;
  seats: 2 | 3 | 4;
  diceMode: DiceMode;
  turnSeconds: number;
}

export async function createRoom(opts: CreateRoomOpts): Promise<Room> {
  return client.create('ludo', {
    nickname: opts.nickname,
    deviceToken: opts.deviceToken,
    create: { seats: opts.seats, diceMode: opts.diceMode, turnSeconds: opts.turnSeconds },
  });
}

export async function lookupRoomId(code: string): Promise<string> {
  const res = await fetch(`${HTTP_URL}/rooms/${encodeURIComponent(normalizeJoinCode(code))}`);
  if (!res.ok) throw new Error('ROOM_NOT_FOUND');
  const body = (await res.json()) as { roomId: string };
  return body.roomId;
}

export async function joinRoomByCode(
  code: string,
  opts: { nickname: string; deviceToken: string }
): Promise<Room> {
  const roomId = await lookupRoomId(code);
  return client.joinById(roomId, { nickname: opts.nickname, deviceToken: opts.deviceToken });
}

const RECONNECT_KEY = 'ludo-reconnect';

export function saveReconnectToken(room: Room): void {
  sessionStorage.setItem(RECONNECT_KEY, JSON.stringify({ code: '', token: room.reconnectionToken }));
}

export async function tryReconnect(): Promise<Room | null> {
  const raw = sessionStorage.getItem(RECONNECT_KEY);
  if (!raw) return null;
  try {
    const { token } = JSON.parse(raw) as { token: string };
    return await client.reconnect(token);
  } catch {
    sessionStorage.removeItem(RECONNECT_KEY);
    return null;
  }
}

export function clearReconnectToken(): void {
  sessionStorage.removeItem(RECONNECT_KEY);
}

export function mapJoinError(err: unknown): string {
  const e = err as { code?: number; message?: string };
  if (e?.code === JOIN_ERROR.ROOM_STARTED) return 'That game has already started.';
  if (e?.code === JOIN_ERROR.ALREADY_IN_ROOM) return 'You are already in this room (same device).';
  if (e?.message === 'ROOM_NOT_FOUND') return 'No room found with that code.';
  if (/full/i.test(e?.message ?? '')) return 'That room is full.';
  return 'Could not join the room. Check the code and try again.';
}
