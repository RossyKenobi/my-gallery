import type { APIRoute } from 'astro';
import { nanoid } from 'nanoid';
import { sql } from '../../lib/db';
import { requireRegisteredUser } from '../../lib/auth';
import { cleanImages } from '../../lib/validate';

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
    const { caption, author, category, isPortrait, images } = body;

    // Generate stack ID on the server and verify insert succeeded before adding photos (GA-11)
    const stackId = `local-${Date.now()}-${nanoid(8)}`;
    const cleanedImages = images && images.length > 0 ? cleanImages(images) : [];
    if (!cleanedImages) {
      return new Response(JSON.stringify({ error: 'Invalid image data' }), { status: 400 });
    }

    // Atomic next sort_order via subquery
    const inserted = await sql`
      INSERT INTO stacks (id, caption, author, category, is_portrait, hidden, sort_order, personal_sort_order, owner_clerk_id, created_at)
      VALUES (
        ${stackId},
        ${caption || ''},
        ${author || ''},
        ${category || 'General'},
        ${isPortrait || false},
        false,
        (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM stacks),
        (SELECT COALESCE(MAX(personal_sort_order), -1) + 1 FROM stacks WHERE owner_clerk_id = ${auth.userId}),
        ${auth.userId},
        NOW()
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `;

    if (inserted.length === 0) {
      return new Response(JSON.stringify({ error: 'Album ID conflict' }), { status: 409 });
    }

    // Insert photos if any
    for (let i = 0; i < cleanedImages.length; i++) {
      const imgObj = cleanedImages[i];
      await sql`
        INSERT INTO photos (stack_id, image_url, thumbnail_url, lqip, is_portrait, sort_order, created_at)
        VALUES (${stackId}, ${imgObj.url}, ${imgObj.thumbnail_url}, ${imgObj.lqip}, ${imgObj.isPortrait}, ${i}, NOW())
      `;
    }

    return new Response(JSON.stringify({ success: true, db_id: stackId }), { status: 201 });
  } catch (err: any) {
    console.error('Stack creation error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
