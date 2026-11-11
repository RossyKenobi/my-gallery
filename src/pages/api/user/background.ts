import type { APIRoute } from 'astro';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { sql } from '../../../lib/db';
import { requireRegisteredUser } from '../../../lib/auth';
import { getS3Client, inspectUploadedImage, R2_BUCKET } from '../../../lib/r2';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = locals.auth();
  if (!auth?.userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  const regUser = await requireRegisteredUser(auth.userId);
  if (!regUser) {
    return new Response(JSON.stringify({ error: 'Forbidden: registration not finalized' }), { status: 403 });
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
    const key = `backgrounds/${auth.userId}-${timestamp}.${inspected.ext}`;

    const s3 = getS3Client();
    await s3.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: inspected.buffer,
      ContentType: inspected.contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }));

    const backgroundUrl = `https://img.penumbrae.uk/${key}`;

    await sql`UPDATE users SET background_url = ${backgroundUrl} WHERE clerk_id = ${auth.userId}`;

    return new Response(JSON.stringify({ url: backgroundUrl }), { status: 200 });
  } catch (err: any) {
    console.error('Background upload error:', err);
    return new Response(JSON.stringify({ error: 'Failed to upload background' }), { status: 500 });
  }
};
