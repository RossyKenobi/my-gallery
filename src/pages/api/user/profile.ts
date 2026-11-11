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
    const { title, subtitle } = await request.json();

    if (title === undefined || subtitle === undefined) {
      return new Response(JSON.stringify({ error: 'Title and subtitle are required' }), { status: 400 });
    }

    // Limit length to prevent overflow
    const safeTitle = title.substring(0, 255);
    const safeSubtitle = subtitle.substring(0, 255);

    await sql`
      UPDATE users 
      SET profile_title = ${safeTitle}, profile_subtitle = ${safeSubtitle}
      WHERE clerk_id = ${auth.userId}
    `;

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err: any) {
    console.error('Update profile text error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
};
