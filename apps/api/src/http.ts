import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response, Router } from 'express';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isDeviceToken(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Rejects any route on this router whose `:deviceToken` isn't a UUID. */
export function validateDeviceToken(router: Router): void {
  router.param('deviceToken', (_req, res, next, value) => {
    if (isDeviceToken(value)) next();
    else res.status(400).json({ error: 'BAD_REQUEST' });
  });
}

/** `?limit=` clamped to [1, max], falling back to `fallback`. */
export function limitParam(raw: unknown, fallback: number, max: number): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : fallback;
}

/**
 * Bearer-token guard for admin routes. With no ADMIN_TOKEN configured the routes
 * don't exist as far as callers can tell.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    res.status(404).json({ error: 'NOT_FOUND' });
    return;
  }
  const given = Buffer.from(req.get('authorization') ?? '');
  const wanted = Buffer.from(`Bearer ${expected}`);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
    res.status(401).json({ error: 'UNAUTHORIZED' });
    return;
  }
  next();
}
