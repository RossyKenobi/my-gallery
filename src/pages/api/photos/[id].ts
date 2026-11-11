import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';
import { requireRegisteredUser } from '../../../lib/auth';
import { deleteUnreferencedPhotoObjects } from '../../../lib/r2';

export const prerender = false;

export const DELETE: APIRoute = async ({ params, locals }) => {
  const auth = locals.auth();
  if (!auth?.userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const photoId = params.id;
  if (!photoId) {
    return new Response(JSON.stringify({ error: 'Photo ID required' }), { status: 400 });
  }

  try {
    const regUser = await requireRegisteredUser(auth.userId);
    if (!regUser) {
      return new Response(JSON.stringify({ error: 'Forbidden: registration not finalized' }), { status: 403 });
    }
    const adminFlag = regUser.is_admin === true;

    // Check ownership
    const photo = await sql`
      SELECT p.id, p.stack_id, p.image_url, p.thumbnail_url FROM photos p
      JOIN stacks s ON s.id = p.stack_id
      WHERE p.id = ${photoId}
      AND (s.owner_clerk_id = ${auth.userId} OR ${adminFlag})
    `;

    if (photo.length === 0) {
      return new Response(JSON.stringify({ error: 'Not found or not authorized' }), { status: 404 });
    }

    const stackId = photo[0].stack_id;

    // Delete the row first; R2 cleanup only touches objects no other row still references.
    await sql`DELETE FROM photos WHERE id = ${photoId}`;
    await deleteUnreferencedPhotoObjects([photo[0].image_url, photo[0].thumbnail_url]);

    // Check if the stack is now empty
    const remaining = await sql`SELECT count(*) as c FROM photos WHERE stack_id = ${stackId}`;
    const stackDeleted = parseInt(remaining[0].c) === 0;
    if (stackDeleted) {
      await sql`DELETE FROM stacks WHERE id = ${stackId}`;
    }

    return new Response(JSON.stringify({ success: true, stackDeleted }));
  } catch (err: any) {
    console.error('Photo delete error:', err);
    return new Response(JSON.stringify({ error: 'Failed to delete photo' }), { status: 500 });
  }
};
