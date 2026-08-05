import { useSettings } from '../store/settingsStore';

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (!useSettings.getState().soundOn) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function blip(
  freq: number,
  dur: number,
  opts: { type?: OscillatorType; gain?: number; delay?: number; slide?: number } = {}
): void {
  const a = ac();
  if (!a) return;
  const { type = 'sine', gain = 0.06, delay = 0, slide = 0 } = opts;
  const t0 = a.currentTime + delay;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const sfx = {
  roll(): void {
    for (let i = 0; i < 5; i++) blip(180 + Math.random() * 320, 0.05, { type: 'square', gain: 0.03, delay: i * 0.07 });
  },
  hop(step: number): void {
    blip(300 + step * 40, 0.09, { type: 'triangle', gain: 0.05 });
  },
  capture(): void {
    blip(520, 0.3, { type: 'sawtooth', gain: 0.07, slide: -400 });
    blip(180, 0.35, { type: 'square', gain: 0.04, delay: 0.06, slide: -120 });
  },
  finish(): void {
    [523, 659, 784].forEach((f, i) => blip(f, 0.14, { type: 'triangle', gain: 0.06, delay: i * 0.09 }));
  },
  six(): void {
    blip(660, 0.12, { type: 'triangle', gain: 0.06 });
    blip(880, 0.16, { type: 'triangle', gain: 0.06, delay: 0.1 });
  },
  win(): void {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => blip(f, 0.18, { type: 'triangle', gain: 0.07, delay: i * 0.13 }));
  },
};
