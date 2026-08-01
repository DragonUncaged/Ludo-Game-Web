export const COLOR_HEX: Record<string, string> = {
  red: '#ff9a8b',
  green: '#9be3a8',
  yellow: '#ffd97d',
  blue: '#8fc7ff',
};

export function shade(hex: string, amt: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  const mix = (v: number) => Math.round(v + (t - v) * p);
  return (
    '#' + [mix(r), mix(g), mix(b)].map((v) => v.toString(16).padStart(2, '0')).join('')
  );
}
