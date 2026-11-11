import { createHmac, timingSafeEqual } from 'node:crypto';

const TTL_MS = 30 * 60 * 1000; // 30 minutes

function getSigningSecret(): string {
  const secret = import.meta.env.CLERK_SECRET_KEY || import.meta.env.POSTGRES_URL;
  if (!secret) throw new Error('Missing server signing secret');
  return secret;
}

export function signInviteToken(inviteRowId: number | string): string {
  const idStr = String(inviteRowId);
  const exp = Date.now() + TTL_MS;
  const payload = `${idStr}.${exp}`;
  const sig = createHmac('sha256', getSigningSecret()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

/**
 * Verifies a signed invite token and returns the underlying integer invitation_codes.id,
 * or null if invalid / expired. Bare integers are always rejected (GA-05).
 */
export function verifyInviteToken(token: unknown): number | null {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [idStr, expStr, sigHex] = parts;
  if (!/^\d+$/.test(idStr) || !/^\d+$/.test(expStr) || !/^[0-9a-f]{64}$/i.test(sigHex)) {
    return null;
  }
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) {
    return null;
  }
  const payload = `${idStr}.${expStr}`;
  const expected = createHmac('sha256', getSigningSecret()).update(payload).digest();
  const actual = Buffer.from(sigHex, 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }
  const id = Number(idStr);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
