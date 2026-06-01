import type { APIRoute } from 'astro';
import { sql } from '../../lib/db';

export const prerender = false;

const rateLimitCache = new Map<string, { count: number, resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitCache.get(ip);
  if (!record) {
    rateLimitCache.set(ip, { count: 1, resetAt: now + 60000 }); // 1 min window
    return false;
  }
  if (now > record.resetAt) {
    rateLimitCache.set(ip, { count: 1, resetAt: now + 60000 });
    return false;
  }
  if (record.count >= 5) { // Max 5 attempts per minute
    return true;
  }
  record.count += 1;
  return false;
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const ip = clientAddress || request.headers.get('x-forwarded-for') || 'unknown';
  if (isRateLimited(ip)) {
    return new Response(JSON.stringify({ valid: false, error: 'Too many attempts. Try again in 1 minute.' }), { status: 429 });
  }
  try {
    const { code } = await request.json();

    if (!code) {
      return new Response(JSON.stringify({ valid: false, error: 'Invite code is required' }), { status: 400 });
    }

    const rows = await sql`
      SELECT id FROM invitation_codes
      WHERE code = ${code} AND is_used = false
    `;

    if (rows.length === 0) {
      return new Response(JSON.stringify({ valid: false, error: 'Invalid or used invitation code' }), { status: 400 });
    }

    // Pass the invite ID back to the client to be consumed after registration
    return new Response(JSON.stringify({
      valid: true,
      inviteId: rows[0].id,
    }), { status: 200 });

  } catch (err: any) {
    console.error('Verify invite error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
