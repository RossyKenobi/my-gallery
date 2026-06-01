import type { APIRoute } from 'astro';
import { sql } from '../../lib/db';
import { isAdmin } from '../../lib/auth';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  try {
    const ownerFilter = url.searchParams.get('owner');
    const sortMode = url.searchParams.get('sort'); // 'personal' or default

    const orderColumn = sortMode === 'personal' ? 'personal_sort_order' : 'sort_order';

    // Safe schema guards
    try {
    } catch(e) {
      console.warn('Failed to conditionally add columns', e);
    }

    let rows;
    if (ownerFilter) {
      rows = await sql`
        SELECT
          s.id, s.caption, s.author, s.category,
          s.is_portrait, s.hidden, s.is_hidden_from_global, s.sort_order, s.personal_sort_order, s.owner_clerk_id,
          u.username AS owner_username,
          p.id AS photo_id, p.image_url AS photo_url, p.sort_order AS photo_sort_order, p.expanded_sort_order
        FROM stacks s
        LEFT JOIN photos p ON p.stack_id = s.id
        LEFT JOIN users u ON s.owner_clerk_id = u.clerk_id
        WHERE s.owner_clerk_id = ${ownerFilter}
        ORDER BY s.sort_order ASC, p.sort_order ASC
      `;
    } else {
      rows = await sql`
        SELECT
          s.id, s.caption, s.author, s.category,
          s.is_portrait, s.hidden, s.is_hidden_from_global, s.sort_order, s.personal_sort_order, s.owner_clerk_id,
          u.username AS owner_username,
          p.image_url AS photo_url, p.sort_order AS photo_sort_order
        FROM stacks s
        LEFT JOIN photos p ON p.stack_id = s.id
        LEFT JOIN users u ON s.owner_clerk_id = u.clerk_id
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
          is_hidden_from_global: row.is_hidden_from_global || false,
          images: [],
          owner_clerk_id: row.owner_clerk_id,
          owner_username: row.owner_username,
          sort_order: row.sort_order,
          personal_sort_order: row.personal_sort_order,
        });
      }
      if (row.photo_url) {
        if (sortMode === 'personal' && ownerFilter) {
          stackMap.get(row.id).images.push({
            url: row.photo_url,
            photoId: row.photo_id,
            expandedSortOrder: row.expanded_sort_order,
          });
        } else {
          stackMap.get(row.id).images.push(row.photo_url);
        }
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
        
        if (scope === 'expanded') {
          // Handled after the main loop to keep it clean
          break;
        } else if (scope === 'personal') {
          // Personal sort: update personal_sort_order for own stacks only
          await sql`
            UPDATE stacks 
            SET personal_sort_order = ${i}, caption = ${post.caption || ''}, author = ${post.author || ''} 
            WHERE id = ${post.id} AND owner_clerk_id = ${auth.userId}
          `;
        } else if (adminFlag) {
          // Admin global sort: update sort_order AND is_hidden_from_global
          await sql`
            UPDATE stacks 
            SET sort_order = ${i}, 
                is_hidden_from_global = ${post.is_hidden_from_global || false}, 
                caption = ${post.caption || ''}, 
                author = ${post.author || ''} 
            WHERE id = ${post.id}
          `;
        } else {
          // Non-admin on main page: only update metadata of own stacks
          await sql`UPDATE stacks SET caption = ${post.caption || ''}, author = ${post.author || ''} WHERE id = ${post.id} AND owner_clerk_id = ${auth.userId}`;
        }
        
        // Update photos if provided (skip for expanded scope)
        if (scope !== 'expanded' && post.images && post.images.length > 0) {
          const canEdit = adminFlag || (await sql`SELECT id FROM stacks WHERE id = ${post.id} AND owner_clerk_id = ${auth.userId}`).length > 0;
          
          if (canEdit) {
            await sql`DELETE FROM photos WHERE stack_id = ${post.id}`;
            for (let j = 0; j < post.images.length; j++) {
              const imgUrl = typeof post.images[j] === 'string' ? post.images[j] : post.images[j].url;
              await sql`INSERT INTO photos (stack_id, image_url, sort_order, created_at) VALUES (${post.id}, ${imgUrl}, ${j}, NOW())`;
            }
          }
        }
      }
      // Handle expanded scope: body is [{photoId, order}, ...]
      if (scope === 'expanded' && Array.isArray(body)) {
        const adminFlag = await isAdmin(auth.userId);
        for (const item of body) {
          if (item.photoId && item.order !== undefined) {
            // Update photo order. If admin, allow all. If not, only for own stacks.
            if (adminFlag) {
              await sql`UPDATE photos SET expanded_sort_order = ${item.order} WHERE id = ${item.photoId}`;
            } else {
              await sql`
                UPDATE photos SET expanded_sort_order = ${item.order}
                WHERE id = ${item.photoId}
                AND stack_id IN (SELECT id FROM stacks WHERE owner_clerk_id = ${auth.userId})
              `;
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
