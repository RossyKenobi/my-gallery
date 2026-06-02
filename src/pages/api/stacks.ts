import type { APIRoute } from 'astro';
import { sql } from '../../lib/db';
import { isAdmin, ensureUser } from '../../lib/auth';

export const prerender = false;

// CREATE new stack
export const POST: APIRoute = async ({ request, locals }) => {
  const auth = locals.auth();
  if (!auth?.userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    // Ensure user exists in Postgres before inserting stack (Fixes FK error)
    await ensureUser(auth.userId);

    const body = await request.json();
    const { id, caption, author, category, isPortrait, hidden, images } = body;

    // Get current max sort_order
    const maxSort = await sql`SELECT COALESCE(MAX(sort_order), -1) as max_sort FROM stacks`;
    const nextSort = maxSort[0].max_sort + 1;

    await sql`
      INSERT INTO stacks (id, caption, author, category, is_portrait, hidden, sort_order, personal_sort_order, owner_clerk_id, created_at)
      VALUES (${id}, ${caption || ''}, ${author || ''}, ${category || 'General'}, ${isPortrait || false}, ${hidden || false}, ${nextSort}, ${nextSort}, ${auth.userId}, NOW())
      ON CONFLICT (id) DO NOTHING
    `;

    // Insert photos if any
    if (images && images.length > 0) {
      for (let i = 0; i < images.length; i++) {
        const imgObj = typeof images[i] === 'string' ? { url: images[i], thumbnail_url: null, lqip: null } : images[i];
        await sql`
          INSERT INTO photos (stack_id, image_url, thumbnail_url, lqip, sort_order, created_at)
          VALUES (${id}, ${imgObj.url}, ${imgObj.thumbnail_url || null}, ${imgObj.lqip || null}, ${i}, NOW())
        `;
      }
    }

    return new Response(JSON.stringify({ success: true, db_id: id }), { status: 201 });
  } catch (err: any) {
    console.error('Stack creation error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
