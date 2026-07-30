import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { normalizeJoinCode } from '@ludo/shared';
import { loadRootEnv } from '@ludo/db';
import { LudoRoom } from './rooms/LudoRoom.js';

loadRootEnv();
const port = Number(process.env.REALTIME_PORT ?? 2567);
const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

// Room lookup by join code — must live on this service (needs the local matchMaker).
app.get('/rooms/:code', async (req, res) => {
  const code = normalizeJoinCode(req.params.code);
  const rooms = await matchMaker.query({ name: 'ludo' });
  const room = rooms.find((r) => r.metadata?.joinCode === code);
  if (!room) return res.status(404).json({ error: 'ROOM_NOT_FOUND' });
  res.json({ roomId: room.roomId, clients: room.clients, locked: room.locked });
});

const server = http.createServer(app);
const gameServer = new Server({ transport: new WebSocketTransport({ server }) });
gameServer.define('ludo', LudoRoom);

server.listen(port, () => console.log(`[realtime] listening on :${port}`));
