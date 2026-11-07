import express from 'express';
import cors from 'cors';
import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { normalizeJoinCode } from '@ludo/shared';
import { loadRootEnv } from '@ludo/db';
import { LudoRoom } from './rooms/LudoRoom.js';

loadRootEnv();
const port = Number(process.env.REALTIME_PORT ?? 2567);

const gameServer = new Server({
  transport: new WebSocketTransport(),
  express: (app) => {
    app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true }));
    app.use(express.json());

    app.get('/health', (_req, res) => {
      res.json({ ok: true });
    });

    // Join-code lookup lives here rather than in the api because it needs this process's matchMaker.
    app.get('/rooms/:code', async (req, res) => {
      const code = normalizeJoinCode(req.params.code);
      const rooms = await matchMaker.query<LudoRoom>({ name: 'ludo' });
      const room = rooms.find((r) => r.metadata?.joinCode === code);
      if (!room) {
        res.status(404).json({ error: 'ROOM_NOT_FOUND' });
        return;
      }
      res.json({ roomId: room.roomId, clients: room.clients, locked: room.locked });
    });
  },
});

gameServer.define('ludo', LudoRoom);

await gameServer.listen(port);
console.log(`[realtime] listening on :${port}`);
