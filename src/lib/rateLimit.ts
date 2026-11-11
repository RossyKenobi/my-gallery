import { sql } from './db';

let tableInitialized = false;
const fallbackMap = new Map<string, { count: number; resetAt: number }>();
const MAX_FALLBACK_ENTRIES = 1000;

function checkFallback(key: string, maxAttempts: number, windowMs: number): boolean {
  const now = Date.now();
  const existing = fallbackMap.get(key);
  if (!existing || now > existing.resetAt) {
    if (fallbackMap.size >= MAX_FALLBACK_ENTRIES) {
      const oldestKey = fallbackMap.keys().next().value;
      if (oldestKey) fallbackMap.delete(oldestKey);
    }
    fallbackMap.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  if (existing.count >= maxAttempts) return true;
  existing.count += 1;
  return false;
}

/**
 * Persistent Postgres-backed rate limiter (GA-05) so serverless cold starts do not reset counters.
 */
export async function isRateLimited(
  bucketKey: string,
  maxAttempts = 5,
  windowSeconds = 60
): Promise<boolean> {
  try {
    if (!tableInitialized) {
      await sql`
        CREATE TABLE IF NOT EXISTS api_rate_limits (
          key TEXT PRIMARY KEY,
          count INT NOT NULL,
          reset_at TIMESTAMPTZ NOT NULL
        )
      `;
      tableInitialized = true;
    }

    const rows = await sql`
      INSERT INTO api_rate_limits (key, count, reset_at)
      VALUES (${bucketKey}, 1, NOW() + (${windowSeconds} * INTERVAL '1 second'))
      ON CONFLICT (key) DO UPDATE
        SET count = CASE
              WHEN api_rate_limits.reset_at <= NOW() THEN 1
              ELSE api_rate_limits.count + 1
            END,
            reset_at = CASE
              WHEN api_rate_limits.reset_at <= NOW() THEN NOW() + (${windowSeconds} * INTERVAL '1 second')
              ELSE api_rate_limits.reset_at
            END
      RETURNING count
    `;
    return Number(rows[0]?.count ?? 1) > maxAttempts;
  } catch (err) {
    console.error('Persistent rate-limit fallback:', err);
    return checkFallback(bucketKey, maxAttempts, windowSeconds * 1000);
  }
}
