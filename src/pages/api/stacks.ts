import type { APIRoute } from 'astro';
import { sql } from '../../lib/db';
import { requireRegisteredUser } from '../../lib/auth';
import { isValidStackId, cleanImages } from '../../lib/validate';

export const prerender = false;

// CREATE new stack
export const POST: APIRoute = async ({ request, locals }) => {
  const auth = locals.auth();
  if (!auth?.userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const regUser = await requireRegisteredUser(auth.userId);
    if (!regUser) {
      return new Response(JSON.stringify({ error: 'Forbidden: registration not finalized' }), { status: 403 });
    }

    const body = await request.json();
    const { id, caption, author, category, isPortrait, hidden, images } = body;

    // Validate everything that will be rendered into other visitors' pages (GA-04)
    if (!isValidStackId(id)) {
      return new Response(JSON.stringify({ error: 'Invalid album id' }), { status: 400 });
    }
    const cleanedImages = images && images.length > 0 ? cleanImages(images) : [];
    if (!cleanedImages) {
      return new Response(JSON.stringify({ error: 'Invalid image data' }), { status: 400 });
    }

    // Get current max sort_order
    const maxSort = await sql`SELECT COALESCE(MAX(sort_order), -1) as max_sort FROM stacks`;
    const nextSort = maxSort[0].max_sort + 1;

    await sql`
      INSERT INTO stacks (id, caption, author, category, is_portrait, hidden, sort_order, personal_sort_order, owner_clerk_id, created_at)
      VALUES (${id}, ${caption || ''}, ${author || ''}, ${category || 'General'}, ${isPortrait || false}, ${hidden || false}, ${nextSort}, ${nextSort}, ${auth.userId}, NOW())
      ON CONFLICT (id) DO NOTHING
    `;

    // Insert photos if any
    for (let i = 0; i < cleanedImages.length; i++) {
      const imgObj = cleanedImages[i];
      await sql`
        INSERT INTO photos (stack_id, image_url, thumbnail_url, lqip, is_portrait, sort_order, created_at)
        VALUES (${id}, ${imgObj.url}, ${imgObj.thumbnail_url}, ${imgObj.lqip}, ${imgObj.isPortrait}, ${i}, NOW())
      `;
    }

    return new Response(JSON.stringify({ success: true, db_id: id }), { status: 201 });
  } catch (err: any) {
    console.error('Stack creation error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
