import type { APIRoute } from 'astro';
import { sql } from '../../lib/db';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = locals.auth();
  if (!auth?.userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const { inviteId } = await request.json();

    if (!inviteId) {
      await fetch(`https://api.clerk.com/v1/users/${auth.userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${import.meta.env.CLERK_SECRET_KEY}` }
      });
      return new Response(JSON.stringify({ error: 'Invite ID required. Account deleted.' }), { status: 400 });
    }

    const consumeRes = await sql`
      UPDATE invitation_codes
      SET is_used = true, used_by_clerk_id = ${auth.userId}, used_at = NOW()
      WHERE id = ${inviteId} AND is_used = false
      RETURNING code
    `;

    if (consumeRes.length === 0) {
      await fetch(`https://api.clerk.com/v1/users/${auth.userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${import.meta.env.CLERK_SECRET_KEY}` }
      });
      return new Response(JSON.stringify({ error: 'Invalid or already used invite code. Account deleted.' }), { status: 400 });
    }

    const code = consumeRes[0].code;
    const adminSecret = import.meta.env.ADMIN_INVITE_CODE;
    const isRootAdmin = adminSecret ? code === adminSecret : false;

    // Get user email from Clerk
    const clerkRes = await fetch(`https://api.clerk.com/v1/users/${auth.userId}`, {
      headers: { Authorization: `Bearer ${import.meta.env.CLERK_SECRET_KEY}` }
    });
    const clerkUser = await clerkRes.json();
    const email = clerkUser.email_addresses?.[0]?.email_address || '';
    const username = clerkUser.username || null;

    // Create user record in Postgres
    await sql`
      INSERT INTO users (clerk_id, email, username, is_admin, created_at)
      VALUES (${auth.userId}, ${email}, ${username}, ${isRootAdmin}, NOW())
      ON CONFLICT (clerk_id) DO UPDATE SET is_admin = CASE WHEN ${isRootAdmin} THEN true ELSE users.is_admin END, email = ${email}, username = COALESCE(${username}, users.username)
    `;

    return new Response(JSON.stringify({ success: true, isAdmin: isRootAdmin }), { status: 200 });

  } catch (err: any) {
    console.error('Finalize registration error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
