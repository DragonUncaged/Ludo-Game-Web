import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { Client } from 'colyseus.js';
import type { Room } from 'colyseus.js';

let gameServer: Server;
let port = 0;

beforeAll(async () => {
  process.env.LUDO_FAST = '1'; // must be set before the room module is imported
  const { LudoRoom } = await import('../src/rooms/LudoRoom.js');
  const server = http.createServer();
  gameServer = new Server({ transport: new WebSocketTransport({ server }) });
  gameServer.define('ludo', LudoRoom);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  port = (server.address() as { port: number }).port;
});

afterAll(async () => {
  await gameServer.gracefullyShutdown(false);
});

function connect(): Client {
  return new Client(`ws://127.0.0.1:${port}`);
}

function registerNoops(room: Room) {
  for (const type of ['turnChanged', 'diceRolled', 'moveApplied', 'playerFinished', 'gameOver', 'timeResult']) {
    room.onMessage(type, () => {});
  }
}

describe('LudoRoom', () => {
  it(
    'active human + 3 bots plays a full match to gameOver with consistent ranks',
    async () => {
      const client = connect();
      const room = await client.create('ludo', {
        nickname: 'Tester',
        deviceToken: 'device-a',
        create: { seats: 4, diceMode: 'fair', turnSeconds: 5 },
      });
      const mySeat = 0;
      const gameOver = new Promise<{ ranking: { rank: number }[] }>((resolve) =>
        room.onMessage('gameOver', resolve)
      );
      room.onMessage<{ seat: number }>('turnChanged', ({ seat }) => {
        if (seat === mySeat) room.send('roll');
      });
      room.onMessage<{ seat: number; legalTokens: number[]; autoPass: boolean; forfeit: boolean }>(
        'diceRolled',
        ({ seat, legalTokens, autoPass, forfeit }) => {
          if (seat === mySeat && !autoPass && !forfeit && legalTokens.length > 0) {
            room.send('move', { tokenIndex: legalTokens[0] });
          }
        }
      );
      room.onMessage('moveApplied', () => {});
      room.onMessage('playerFinished', () => {});

      room.send('startGame');
      const result = await gameOver;
      expect(result.ranking).toHaveLength(4);
      expect(result.ranking.map((r) => r.rank).sort()).toEqual([1, 2, 3, 4]);
      await room.leave();
    },
    // real-RNG match length varies (observed 85–130s in FAST mode) — generous margin
    300_000
  );

  it(
    'turn timeout auto-rolls and auto-moves for an idle human',
    async () => {
      process.env.FIXED_ROLLS = '6'; // idle human's first (auto) roll can leave base
      const client = connect();
      const room = await client.create('ludo', {
        nickname: 'Idle',
        deviceToken: 'device-b',
        create: { seats: 2, diceMode: 'fair', turnSeconds: 5 },
      });
      delete process.env.FIXED_ROLLS;
      registerNoops(room);

      const autoMove = new Promise<{ seat: number }>((resolve) => {
        room.onMessage<{ seat: number }>('moveApplied', (m) => {
          if (m.seat === 0) resolve(m);
        });
      });
      room.send('startGame');
      const m = await autoMove; // arrives only via the deadline timeout — we never send roll/move
      expect(m.seat).toBe(0);
      await room.leave();
    },
    30_000
  );

  it('rejects duplicate device tokens and joins after start', async () => {
    const client = connect();
    const room = await client.create('ludo', {
      nickname: 'Host',
      deviceToken: 'device-c',
      create: { seats: 4, diceMode: 'fair', turnSeconds: 5 },
    });
    registerNoops(room);

    await expect(
      connect().joinById(room.roomId, { nickname: 'Dup', deviceToken: 'device-c' })
    ).rejects.toMatchObject({ code: 4002 });

    room.send('startGame');
    await new Promise((r) => setTimeout(r, 200));
    await expect(
      connect().joinById(room.roomId, { nickname: 'Late', deviceToken: 'device-d' })
    ).rejects.toBeTruthy();
    await room.leave();
  }, 20_000);
});
