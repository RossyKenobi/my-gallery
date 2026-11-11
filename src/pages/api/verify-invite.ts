import type { APIRoute } from 'astro';
import { sql } from '../../lib/db';
import { isRateLimited } from '../../lib/rateLimit';
import { signInviteToken } from '../../lib/inviteToken';

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const ip = (clientAddress || request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  if (await isRateLimited(`verify-invite:${ip}`, 5, 60)) {
    return new Response(JSON.stringify({ valid: false, error: 'Too many attempts. Try again in 1 minute.' }), { status: 429 });
  }
  try {
    const { code } = await request.json();

    if (!code || typeof code !== 'string') {
      return new Response(JSON.stringify({ valid: false, error: 'Invite code is required' }), { status: 400 });
    }

    const rows = await sql`
      SELECT id FROM invitation_codes
      WHERE code = ${code.trim()} AND is_used = false
    `;

    if (rows.length === 0) {
      return new Response(JSON.stringify({ valid: false, error: 'Invalid or used invitation code' }), { status: 400 });
    }

    // Issue an HMAC-signed short-lived token instead of an enumerable integer id (GA-05)
    const signedToken = signInviteToken(rows[0].id);

    return new Response(JSON.stringify({
      valid: true,
      inviteId: signedToken,
    }), { status: 200 });

  } catch (err: any) {
    console.error('Verify invite error:', err);
    return new Response(JSON.stringify({ valid: false, error: 'Failed to verify invitation code' }), { status: 500 });
  }
};
