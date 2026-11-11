import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';
import { requireRegisteredUser } from '../../../lib/auth';

export const prerender = false;

export const PUT: APIRoute = async ({ request, locals }) => {
  const auth = locals.auth();
  if (!auth?.userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  const regUser = await requireRegisteredUser(auth.userId);
  if (!regUser) {
    return new Response(JSON.stringify({ error: 'Forbidden: registration not finalized' }), { status: 403 });
  }

  try {
    const { expanded } = await request.json();
    await sql`UPDATE users SET gallery_expanded = ${!!expanded} WHERE clerk_id = ${auth.userId}`;
    return new Response(JSON.stringify({ success: true }));
  } catch (err: any) {
    console.error('Expanded API error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
};
