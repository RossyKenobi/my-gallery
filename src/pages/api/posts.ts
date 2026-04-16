import type { APIRoute } from 'astro';
import { sql } from '../../lib/db';
import { isAdmin } from '../../lib/auth';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  try {
    const ownerFilter = url.searchParams.get('owner');
    const sortMode = url.searchParams.get('sort'); // 'personal' or default

    const orderColumn = sortMode === 'personal' ? 'personal_sort_order' : 'sort_order';

    let rows;
    if (ownerFilter) {
      rows = await sql`
        SELECT
          s.id, s.caption, s.author, s.category,
          s.is_portrait, s.hidden, s.sort_order, s.personal_sort_order, s.owner_clerk_id,
          p.image_url AS photo_url, p.sort_order AS photo_sort_order
        FROM stacks s
        LEFT JOIN photos p ON p.stack_id = s.id
        WHERE s.owner_clerk_id = ${ownerFilter}
        ORDER BY s.sort_order ASC, p.sort_order ASC
      `;
    } else {
      rows = await sql`
        SELECT
          s.id, s.caption, s.author, s.category,
          s.is_portrait, s.hidden, s.sort_order, s.personal_sort_order, s.owner_clerk_id,
          p.image_url AS photo_url, p.sort_order AS photo_sort_order
        FROM stacks s
        LEFT JOIN photos p ON p.stack_id = s.id
        ORDER BY s.sort_order ASC, p.sort_order ASC
      `;
    }

    const stackMap = new Map();
    for (const row of rows) {
      if (!stackMap.has(row.id)) {
        stackMap.set(row.id, {
          id: row.id,
          caption: row.caption || '',
          author: row.author || '',
          category: row.category || '',
          isPortrait: row.is_portrait,
          hidden: row.hidden,
          images: [],
          owner_clerk_id: row.owner_clerk_id,
          sort_order: row.sort_order,
          personal_sort_order: row.personal_sort_order,
        });
      }
      if (row.photo_url) {
        stackMap.get(row.id).images.push(row.photo_url);
      }
    }

    // Sort by the requested column
    let results = [...stackMap.values()];
    if (sortMode === 'personal') {
      results.sort((a: any, b: any) => (a.personal_sort_order ?? 0) - (b.personal_sort_order ?? 0));
    }

    return new Response(JSON.stringify(results), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('Posts API error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};

export const PUT: APIRoute = async ({ locals, request, url }) => {
  const auth = locals.auth();
  if (!auth?.userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const body = await request.json();
    const scope = url.searchParams.get('scope'); // 'personal' or null (global)
    
    if (Array.isArray(body)) {
      const adminFlag = await isAdmin(auth.userId);

      for (let i = 0; i < body.length; i++) {
        const post = body[i];
        
        if (scope === 'personal') {
          // Personal sort: update personal_sort_order for own stacks only
          await sql`
            UPDATE stacks 
            SET personal_sort_order = ${i}, caption = ${post.caption || ''}, author = ${post.author || ''} 
            WHERE id = ${post.id} AND owner_clerk_id = ${auth.userId}
          `;
        } else if (adminFlag) {
          // Admin global sort: update sort_order
          await sql`UPDATE stacks SET sort_order = ${i}, caption = ${post.caption || ''}, author = ${post.author || ''} WHERE id = ${post.id}`;
        } else {
          // Non-admin on main page: only update metadata of own stacks
          await sql`UPDATE stacks SET caption = ${post.caption || ''}, author = ${post.author || ''} WHERE id = ${post.id} AND owner_clerk_id = ${auth.userId}`;
        }
        
        // Update photos if provided
        if (post.images && post.images.length > 0) {
          const canEdit = adminFlag || (await sql`SELECT id FROM stacks WHERE id = ${post.id} AND owner_clerk_id = ${auth.userId}`).length > 0;
          
          if (canEdit) {
            await sql`DELETE FROM photos WHERE stack_id = ${post.id}`;
            for (let j = 0; j < post.images.length; j++) {
              await sql`INSERT INTO photos (stack_id, image_url, sort_order, created_at) VALUES (${post.id}, ${post.images[j]}, ${j}, NOW())`;
            }
          }
        }
      }
      return new Response(JSON.stringify({ success: true }));
    }

    return new Response(JSON.stringify({ error: 'Payload must be an array of updated posts' }), { status: 400 });
  } catch (err: any) {
    console.error('Posts API error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
