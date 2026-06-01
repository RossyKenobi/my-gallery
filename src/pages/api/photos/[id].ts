import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';
import { isAdmin } from '../../../lib/auth';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';

const BUCKET = 'my-gallery-images';

function getS3Client() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${import.meta.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: import.meta.env.R2_ACCESS_KEY_ID,
      secretAccessKey: import.meta.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

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
    const adminFlag = await isAdmin(auth.userId);

    // Check ownership
    const photo = await sql`
      SELECT p.id, p.stack_id, p.url FROM photos p
      JOIN stacks s ON s.id = p.stack_id
      WHERE p.id = ${photoId}
      AND (s.owner_clerk_id = ${auth.userId} OR ${adminFlag})
    `;

    if (photo.length === 0) {
      return new Response(JSON.stringify({ error: 'Not found or not authorized' }), { status: 404 });
    }

    const stackId = photo[0].stack_id;
    const photoUrl = photo[0].url;

    // Delete the photo
    await sql`DELETE FROM photos WHERE id = ${photoId}`;

    // Delete from R2
    try {
      const urlObj = new URL(photoUrl);
      const key = urlObj.pathname.substring(1); // removes leading '/'
      if (key) {
        const s3 = getS3Client();
        await s3.send(new DeleteObjectCommand({
          Bucket: BUCKET,
          Key: key
        }));
      }
    } catch (e) {
      console.error('Failed to delete file from R2:', e);
      // We don't throw here to ensure DB deletion still succeeds if R2 fails
    }

    // Check if the stack is now empty
    const remaining = await sql`SELECT count(*) as c FROM photos WHERE stack_id = ${stackId}`;
    if (parseInt(remaining[0].c) === 0) {
      await sql`DELETE FROM stacks WHERE id = ${stackId}`;
    }

    return new Response(JSON.stringify({ success: true, stackDeleted: parseInt(remaining[0].c) === 0 }));
  } catch (err: any) {
    console.error('Photo delete error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
