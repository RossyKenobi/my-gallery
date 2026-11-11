import type { APIRoute } from 'astro';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { sql } from '../../lib/db';
import { isAdmin } from '../../lib/auth';
import { getS3Client, inspectUploadedImage, R2_BUCKET } from '../../lib/r2';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = locals.auth();
  if (!auth?.userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const userIsAdmin = await isAdmin(auth.userId);
  if (!userIsAdmin) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return new Response(JSON.stringify({ error: 'File is required' }), { status: 400 });
    }

    let inspected: Awaited<ReturnType<typeof inspectUploadedImage>>;
    try {
      inspected = await inspectUploadedImage(file);
    } catch (validationErr: any) {
      return new Response(JSON.stringify({ error: validationErr.message }), { status: 400 });
    }

    const timestamp = Date.now();
    const key = `site-backgrounds/main-${timestamp}.${inspected.ext}`;

    const s3 = getS3Client();
    await s3.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: inspected.buffer,
      ContentType: inspected.contentType,
    }));

    const backgroundUrl = `https://img.penumbrae.uk/${key}`;

    await sql`
      INSERT INTO site_settings (key, value)
      VALUES ('site_background', ${backgroundUrl})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `;

    return new Response(JSON.stringify({ url: backgroundUrl }), { status: 200 });
  } catch (err: any) {
    console.error('Site background upload error:', err);
    return new Response(JSON.stringify({ error: 'Failed to upload site background' }), { status: 500 });
  }
};
