import type { APIRoute } from 'astro';
import { sql } from '../../lib/db';
import { isAdmin, requireRegisteredUser } from '../../lib/auth';
import { isValidStackId } from '../../lib/validate';

export const prerender = false;

export async function getGalleryData(ownerFilter: string | null, sortMode: string | null) {
  const orderColumn = sortMode === 'personal' ? 'personal_sort_order' : 'sort_order';

  let rows;
    if (ownerFilter) {
      rows = await sql`
        SELECT
          s.id, s.caption, s.author, s.category,
          s.is_portrait, s.hidden, s.is_hidden_from_global, s.sort_order, s.personal_sort_order, s.owner_clerk_id,
          u.username AS owner_username,
          p.id AS photo_id, p.image_url AS photo_url, p.thumbnail_url, p.lqip, p.sort_order AS photo_sort_order, p.expanded_sort_order, p.is_portrait AS photo_is_portrait
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
          p.id AS photo_id, p.image_url AS photo_url, p.thumbnail_url, p.lqip, p.sort_order AS photo_sort_order, p.is_portrait AS photo_is_portrait
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
        const stack = stackMap.get(row.id);
        const isFirst = stack.images.length === 0;
        
        if (sortMode === 'personal' && ownerFilter) {
          stack.images.push({
            url: row.photo_url,
            thumbnail_url: row.thumbnail_url,
            lqip: isFirst ? row.lqip : undefined,
            photoId: row.photo_id,
            expandedSortOrder: row.expanded_sort_order,
            isPortrait: row.photo_is_portrait,
          });
        } else {
          stack.images.push({
            url: row.photo_url,
            thumbnail_url: row.thumbnail_url,
            lqip: isFirst ? row.lqip : undefined,
            photoId: row.photo_id,
            isPortrait: row.photo_is_portrait,
          });
        }
      }
    }

    // Sort by the requested column
    let results = [...stackMap.values()];
    if (sortMode === 'personal') {
      results.sort((a: any, b: any) => (a.personal_sort_order ?? 0) - (b.personal_sort_order ?? 0));
    }

    return results;
}

export const GET: APIRoute = async ({ url }) => {
  try {
    const ownerFilter = url.searchParams.get('owner');
    const sortMode = url.searchParams.get('sort');

    const results = await getGalleryData(ownerFilter, sortMode);

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
    const regUser = await requireRegisteredUser(auth.userId);
    if (!regUser) {
      return new Response(JSON.stringify({ error: 'Forbidden: registration not finalized' }), { status: 403 });
    }
    const body = await request.json();
    const scope = url.searchParams.get('scope'); // 'personal' or null (global)
    
    if (Array.isArray(body)) {
      const adminFlag = regUser.is_admin === true;
      const queries: any[] = [];

      if (scope === 'expanded') {
        // Handle expanded scope: body is [{photoId, order}, ...] inside a transaction
        for (const item of body) {
          const pid = Number(item?.photoId);
          const ord = Number(item?.order);
          if (Number.isInteger(pid) && pid > 0 && Number.isFinite(ord)) {
            if (adminFlag) {
              queries.push(sql`UPDATE photos SET expanded_sort_order = ${ord} WHERE id = ${pid}`);
            } else {
              queries.push(sql`
                UPDATE photos SET expanded_sort_order = ${ord}
                WHERE id = ${pid}
                AND stack_id IN (SELECT id FROM stacks WHERE owner_clerk_id = ${auth.userId})
              `);
            }
          }
        }
      } else {
        // Stack ordering & global visibility only — never delete or rewrite photos here (GA-07)
        for (let i = 0; i < body.length; i++) {
          const post = body[i];
          if (!post || !isValidStackId(post.id)) continue;

          if (scope === 'personal') {
            queries.push(sql`
              UPDATE stacks
              SET personal_sort_order = ${i}
              WHERE id = ${post.id} AND owner_clerk_id = ${auth.userId}
            `);
          } else if (adminFlag) {
            queries.push(sql`
              UPDATE stacks
              SET sort_order = ${i},
                  is_hidden_from_global = ${Boolean(post.is_hidden_from_global)}
              WHERE id = ${post.id}
            `);
          }
        }
      }

      if (queries.length > 0) {
        await sql.transaction(queries);
      }

      return new Response(JSON.stringify({ success: true }));
    }

    return new Response(JSON.stringify({ error: 'Payload must be an array of updated posts' }), { status: 400 });
  } catch (err: any) {
    console.error('Posts API error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
