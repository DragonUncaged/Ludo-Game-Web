// Dev utility: plays a full match against a running realtime server and prints the result.
// Usage: node scripts/playmatch.mjs [ws://localhost:2567]
import { Client } from '@colyseus/sdk';
import { randomUUID } from 'node:crypto';

const url = process.argv[2] ?? 'ws://localhost:2567';
const client = new Client(url);

const room = await client.create('ludo', {
  nickname: 'ScriptKid',
  deviceToken: randomUUID(),
  create: { seats: 2, diceMode: 'dynamic', turnSeconds: 5 },
});

const mySeat = 0;
let code = '';
const done = new Promise((resolve) => room.onMessage('gameOver', resolve));

room.onStateChange((state) => {
  if (!code && state.joinCode) {
    code = state.joinCode;
    console.log(`[playmatch] room ${room.roomId} code ${code}`);
  }
});
room.onMessage('turnChanged', ({ seat }) => {
  if (seat === mySeat) setTimeout(() => room.send('roll'), 150);
});
room.onMessage('diceRolled', ({ seat, legalTokens, autoPass, forfeit }) => {
  if (seat === mySeat && !autoPass && !forfeit && legalTokens.length > 0) {
    setTimeout(() => room.send('move', { tokenIndex: legalTokens[0] }), 200);
  }
});
for (const t of ['moveApplied', 'playerFinished', 'timeResult']) room.onMessage(t, () => {});

room.send('startGame');
console.log('[playmatch] started, playing…');
const result = await done;
console.log('[playmatch] gameOver:', JSON.stringify(result));
await room.leave();
process.exit(0);
