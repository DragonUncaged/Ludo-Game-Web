import { useEffect, useRef } from 'react';
import type { Room } from '@colyseus/sdk';
import { posToGrid } from '@ludo/engine';
import type { PlayerColor } from '@ludo/engine';
import type { MoveAppliedEvent } from '@ludo/shared';
import { useGame } from '../store/gameStore';
import { sfx } from '../lib/sfx';

const STEP_MS = 120;
const FLY_MS = 550;

let poofSeq = 1;

/**
 * Serial animation runner. Schema patches update truePos immediately; this queue
 * pins tokens to override positions and walks them through the step path, so a
 * patch landing mid-animation never teleports a token. Overrides clear on drain.
 */
export function useAnimationQueue(room: Room | null): void {
  const queue = useRef<MoveAppliedEvent[]>([]);
  const running = useRef(false);
  const lastSeq = useRef(0);

  useEffect(() => {
    if (!room) return;
    let active = true;

    const g = () => useGame.getState();

    const runJob = async (msg: MoveAppliedEvent): Promise<void> => {
      const snap = g().snap;
      const mover = snap?.players[msg.seat];
      if (!mover || msg.path.length === 0) return;
      const color = mover.color as PlayerColor;
      const key = `${msg.seat}-${msg.tokenIndex}`;

      // walk the step path
      for (let i = 0; i < msg.path.length; i++) {
        const [r, c] = posToGrid(color, msg.path[i]!, msg.tokenIndex);
        g().setOverride(key, { r, c, anim: 'hop' });
        sfx.hop(i);
        await new Promise((res) => setTimeout(res, STEP_MS));
      }
      g().setOverride(key, null);

      // captures: victims fly off from the capture cell, poof, reappear in base
      if (msg.captures.length > 0) {
        const dest = msg.path[msg.path.length - 1]!;
        const [cr, cc] = posToGrid(color, dest, msg.tokenIndex);
        sfx.capture();
        const poofId = poofSeq++;
        g().addPoof({ id: poofId, r: cr, c: cc });
        for (const cap of msg.captures) {
          g().setOverride(`${cap.seat}-${cap.tokenIndex}`, { r: cr, c: cc, anim: 'fly' });
        }
        await new Promise((res) => setTimeout(res, FLY_MS));
        for (const cap of msg.captures) {
          g().setOverride(`${cap.seat}-${cap.tokenIndex}`, null);
        }
        setTimeout(() => g().removePoof(poofId), 400);
      }

      if (msg.finishedToken) sfx.finish();
      else if (msg.extraRoll) sfx.six();
    };

    const pump = async (): Promise<void> => {
      if (running.current) return;
      running.current = true;
      while (queue.current.length > 0) {
        const job = queue.current.shift()!;
        try {
          await runJob(job);
        } catch {
          /* never let a bad job wedge the queue */
        }
      }
      g().clearOverrides(); // reconcile: render pure truePos when idle
      running.current = false;
    };

    room.onMessage<MoveAppliedEvent>('moveApplied', (msg) => {
      if (!active) return;
      // StrictMode/HMR can leave stale handlers registered — seq dedupe makes
      // sure each move animates exactly once.
      if (msg.seq && msg.seq <= lastSeq.current) return;
      if (msg.seq) lastSeq.current = msg.seq;
      // Pin positions synchronously (before the state patch renders) to avoid teleports.
      const snap = g().snap;
      const mover = snap?.players[msg.seat];
      if (mover && msg.path.length > 0) {
        const color = mover.color as PlayerColor;
        const from = msg.path[0] === 0 && msg.path.length === 1 ? -1 : msg.path[0]! - 1;
        const [r, c] = posToGrid(color, from, msg.tokenIndex);
        g().setOverride(`${msg.seat}-${msg.tokenIndex}`, { r, c, anim: null });
        for (const cap of msg.captures) {
          const victim = snap!.players[cap.seat];
          if (!victim) continue;
          const [vr, vc] = posToGrid(victim.color as PlayerColor, cap.fromPos, cap.tokenIndex);
          g().setOverride(`${cap.seat}-${cap.tokenIndex}`, { r: vr, c: vc, anim: null });
        }
      }
      queue.current.push(msg);
      void pump();
    });

    return () => {
      active = false;
      queue.current = [];
      g().clearOverrides();
    };
  }, [room]);
}
