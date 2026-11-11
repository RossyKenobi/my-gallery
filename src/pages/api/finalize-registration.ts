import type { APIRoute } from 'astro';
import { sql } from '../../lib/db';
import { isRateLimited } from '../../lib/rateLimit';
import { verifyInviteToken } from '../../lib/inviteToken';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const auth = locals.auth();
  if (!auth?.userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const ip = (clientAddress || request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  if (await isRateLimited(`finalize:${auth.userId}:${ip}`, 5, 60)) {
    return new Response(JSON.stringify({ error: 'Too many attempts. Try again later.' }), { status: 429 });
  }

  try {
    const { inviteId } = await request.json();
    const verifiedRowId = verifyInviteToken(inviteId);

    // Check if user already has a row in `users` (idempotency & never delete registered users, GA-12)
    const existingUsers = await sql`SELECT is_admin FROM users WHERE clerk_id = ${auth.userId}`;
    const existingUser = existingUsers[0] || null;

    if (!verifiedRowId) {
      if (existingUser) {
        return new Response(JSON.stringify({ success: true, isAdmin: existingUser.is_admin === true }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: 'Valid invite token required.' }), { status: 400 });
    }

    const consumeRes = await sql`
      UPDATE invitation_codes
      SET is_used = true, used_by_clerk_id = ${auth.userId}, used_at = NOW()
      WHERE id = ${verifiedRowId} AND is_used = false
      RETURNING code
    `;

    let code: string;
    if (consumeRes.length === 0) {
      // Idempotent retry: if the same Clerk user already consumed this invite, succeed (GA-12)
      const prev = await sql`
        SELECT code, used_by_clerk_id FROM invitation_codes WHERE id = ${verifiedRowId}
      `;
      if (prev.length > 0 && prev[0].used_by_clerk_id === auth.userId) {
        code = prev[0].code;
      } else if (existingUser) {
        return new Response(JSON.stringify({ success: true, isAdmin: existingUser.is_admin === true }), { status: 200 });
      } else {
        return new Response(JSON.stringify({ error: 'Invalid or already used invite code.' }), { status: 400 });
      }
    } else {
      code = consumeRes[0].code;
    }

    const adminSecret = import.meta.env.ADMIN_INVITE_CODE;
    const isRootAdmin = adminSecret ? code === adminSecret : false;

    // Get user email from Clerk
    const clerkRes = await fetch(`https://api.clerk.com/v1/users/${auth.userId}`, {
      headers: { Authorization: `Bearer ${import.meta.env.CLERK_SECRET_KEY}` }
    });
    const clerkUser = clerkRes.ok ? await clerkRes.json() : {};
    const email = clerkUser.email_addresses?.[0]?.email_address || `user_${auth.userId}@noemail.local`;
    const username = clerkUser.username || null;

    // Create or update user record in Postgres
    await sql`
      INSERT INTO users (clerk_id, email, username, is_admin, created_at)
      VALUES (${auth.userId}, ${email}, ${username}, ${isRootAdmin}, NOW())
      ON CONFLICT (clerk_id) DO UPDATE
        SET is_admin = CASE WHEN ${isRootAdmin} THEN true ELSE users.is_admin END,
            email = ${email},
            username = COALESCE(${username}, users.username)
    `;

    return new Response(JSON.stringify({ success: true, isAdmin: isRootAdmin }), { status: 200 });

  } catch (err: any) {
    console.error('Finalize registration error:', err);
    return new Response(JSON.stringify({ error: 'Registration finalization failed' }), { status: 500 });
  }
};
