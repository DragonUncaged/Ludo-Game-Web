// Join codes: 6 chars from an alphabet without lookalikes (no 0/O, 1/I/L, 5/S, 8/B).
export const JOIN_CODE_ALPHABET = 'ACDEFGHJKMNPQRTUVWXYZ234679';
export const JOIN_CODE_LENGTH = 6;

export function isValidJoinCode(code: string): boolean {
  if (code.length !== JOIN_CODE_LENGTH) return false;
  return [...code.toUpperCase()].every((c) => JOIN_CODE_ALPHABET.includes(c));
}

export function normalizeJoinCode(code: string): string {
  return code.trim().toUpperCase();
}

/** randInt(loInclusive, hiExclusive) is injected so the server can use crypto.randomInt. */
export function generateJoinCode(randInt: (lo: number, hiExcl: number) => number): string {
  let out = '';
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    out += JOIN_CODE_ALPHABET[randInt(0, JOIN_CODE_ALPHABET.length)];
  }
  return out;
}
