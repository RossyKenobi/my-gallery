import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';
import { isAdmin, requireRegisteredUser } from '../../../lib/auth';
import { cleanImages, isValidStackId } from '../../../lib/validate';
import { deleteUnreferencedPhotoObjects } from '../../../lib/r2';

export const prerender = false;

export const DELETE: APIRoute = async ({ params, locals }) => {
  const auth = locals.auth();
  if (!auth?.userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const stackId = params.id;
  if (!stackId || !isValidStackId(stackId)) {
    return new Response(JSON.stringify({ error: 'Valid stack ID required' }), { status: 400 });
  }

  try {
    const regUser = await requireRegisteredUser(auth.userId);
    if (!regUser) {
      return new Response(JSON.stringify({ error: 'Forbidden: registration not finalized' }), { status: 403 });
    }
    const adminFlag = regUser.is_admin === true;

    const stackRows = await sql`
      SELECT id, owner_clerk_id FROM stacks WHERE id = ${stackId}
    `;
    if (stackRows.length === 0) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    }
    if (!adminFlag && stackRows[0].owner_clerk_id !== auth.userId) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
    }

    const photoRows = await sql`
      SELECT image_url, thumbnail_url FROM photos WHERE stack_id = ${stackId}
    `;

    await sql.transaction([
      sql`DELETE FROM photos WHERE stack_id = ${stackId}`,
      sql`DELETE FROM stacks WHERE id = ${stackId}`,
    ]);

    const urlsToClean: Array<string | null> = [];
    for (const row of photoRows) {
      urlsToClean.push(row.image_url, row.thumbnail_url);
    }
    await deleteUnreferencedPhotoObjects(urlsToClean);

    return new Response(JSON.stringify({ success: true }));
  } catch (err: any) {
    console.error('Delete API error:', err);
    return new Response(JSON.stringify({ error: 'Failed to delete album' }), { status: 500 });
  }
};

/**
 * Diff-based single-album update inside a database transaction (GA-07, GA-08).
 * Existing photos keep their id, expanded_sort_order, thumbnail_url, lqip, is_portrait and created_at;
 * only their sort_order is updated. New photos are inserted; removed photos are deleted and cleaned from R2.
 */
export const PUT: APIRoute = async ({ params, request, locals }) => {
  const auth = locals.auth();
  if (!auth?.userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const stackId = params.id;
  if (!stackId || !isValidStackId(stackId)) {
    return new Response(JSON.stringify({ error: 'Valid stack ID required' }), { status: 400 });
  }

  try {
    const regUser = await requireRegisteredUser(auth.userId);
    if (!regUser) {
      return new Response(JSON.stringify({ error: 'Forbidden: registration not finalized' }), { status: 403 });
    }
    const adminFlag = regUser.is_admin === true;

    const stackRows = await sql`
      SELECT id, owner_clerk_id, is_portrait FROM stacks WHERE id = ${stackId}
    `;
    if (stackRows.length === 0) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    }
    if (!adminFlag && stackRows[0].owner_clerk_id !== auth.userId) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
    }

    const body = await request.json();
    const caption = typeof body.caption === 'string' ? body.caption : '';
    const author = typeof body.author === 'string' ? body.author : '';
    const cleaned = cleanImages(body.images);
    if (!cleaned || cleaned.length === 0) {
      return new Response(JSON.stringify({ error: 'Album must contain at least one valid image' }), { status: 400 });
    }

    const existingPhotos = await sql`
      SELECT id, image_url, thumbnail_url, lqip, is_portrait, expanded_sort_order
      FROM photos
      WHERE stack_id = ${stackId}
      ORDER BY sort_order ASC, id ASC
    `;

    const byId = new Map<number, any>();
    const unusedByUrl = new Map<string, any[]>();
    for (const row of existingPhotos) {
      const pid = Number(row.id);
      byId.set(pid, row);
      const list = unusedByUrl.get(row.image_url) || [];
      list.push(row);
      unusedByUrl.set(row.image_url, list);
    }

    const keptPhotoIds = new Set<number>();
    const queries: any[] = [];

    for (let idx = 0; idx < cleaned.length; idx++) {
      const item = cleaned[idx];
      let matchedRow: any = null;

      if (item.photoId && byId.has(item.photoId) && !keptPhotoIds.has(item.photoId)) {
        matchedRow = byId.get(item.photoId);
      } else {
        const candidates = unusedByUrl.get(item.url) || [];
        matchedRow = candidates.find((c) => !keptPhotoIds.has(Number(c.id))) || null;
      }

      if (matchedRow) {
        const pid = Number(matchedRow.id);
        keptPhotoIds.add(pid);
        queries.push(sql`
          UPDATE photos
          SET sort_order = ${idx},
              thumbnail_url = COALESCE(${item.thumbnail_url}, thumbnail_url),
              lqip = COALESCE(${item.lqip}, lqip),
              is_portrait = COALESCE(${item.isPortrait}, is_portrait)
          WHERE id = ${pid} AND stack_id = ${stackId}
        `);
      } else {
        queries.push(sql`
          INSERT INTO photos (stack_id, image_url, thumbnail_url, lqip, is_portrait, sort_order, created_at)
          VALUES (${stackId}, ${item.url}, ${item.thumbnail_url}, ${item.lqip}, ${item.isPortrait}, ${idx}, NOW())
        `);
      }
    }

    const removedRows = existingPhotos.filter((r) => !keptPhotoIds.has(Number(r.id)));
    for (const rem of removedRows) {
      queries.push(sql`DELETE FROM photos WHERE id = ${rem.id} AND stack_id = ${stackId}`);
    }

    const firstPortrait = cleaned[0]?.isPortrait;
    queries.push(sql`
      UPDATE stacks
      SET caption = ${caption},
          author = ${author},
          is_portrait = COALESCE(${firstPortrait}, is_portrait)
      WHERE id = ${stackId}
    `);

    await sql.transaction(queries);

    if (removedRows.length > 0) {
      const urlsToClean: Array<string | null> = [];
      for (const rem of removedRows) {
        urlsToClean.push(rem.image_url, rem.thumbnail_url);
      }
      await deleteUnreferencedPhotoObjects(urlsToClean);
    }

    const updatedRows = await sql`
      SELECT id AS photo_id, image_url AS url, thumbnail_url, lqip, is_portrait, expanded_sort_order
      FROM photos
      WHERE stack_id = ${stackId}
      ORDER BY sort_order ASC, id ASC
    `;

    const imagesOut = updatedRows.map((r, i) => ({
      url: r.url,
      thumbnail_url: r.thumbnail_url,
      lqip: i === 0 ? r.lqip : undefined,
      photoId: r.photo_id,
      expandedSortOrder: r.expanded_sort_order,
      isPortrait: r.is_portrait,
    }));

    return new Response(JSON.stringify({ success: true, images: imagesOut }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('Update stack error:', err);
    return new Response(JSON.stringify({ error: 'Failed to update album' }), { status: 500 });
  }
};

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const auth = locals.auth();
  if (!auth?.userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const stackId = params.id;
  if (!stackId || !isValidStackId(stackId)) {
    return new Response(JSON.stringify({ error: 'Stack ID required' }), { status: 400 });
  }

  try {
    const adminFlag = await isAdmin(auth.userId);
    if (!adminFlag) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
    }

    const { isHiddenFromGlobal } = await request.json();

    const result = await sql`
      UPDATE stacks 
      SET is_hidden_from_global = ${!!isHiddenFromGlobal} 
      WHERE id = ${stackId} 
      RETURNING id
    `;

    if (result.length === 0) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    }

    return new Response(JSON.stringify({ success: true }));
  } catch (err: any) {
    console.error('Patch API error:', err);
    return new Response(JSON.stringify({ error: 'Failed to update visibility' }), { status: 500 });
  }
};
