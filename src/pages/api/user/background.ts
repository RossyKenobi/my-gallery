import type { APIRoute } from 'astro';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { sql } from '../../../lib/db';

const BUCKET = 'my-gallery-images';

export const prerender = false;

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

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = locals.auth();
  if (!auth?.userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return new Response(JSON.stringify({ error: 'File is required' }), { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const timestamp = Date.now();
    const key = `backgrounds/${auth.userId}-${timestamp}.jpg`;

    const s3 = getS3Client();
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: file.type || 'image/jpeg',
    }));

    const backgroundUrl = `https://img.penumbrae.uk/${key}`;

    // Update user's background_url in DB
    await sql`UPDATE users SET background_url = ${backgroundUrl} WHERE clerk_id = ${auth.userId}`;

    return new Response(JSON.stringify({ url: backgroundUrl }), { status: 200 });
  } catch (err: any) {
    console.error('Background upload error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
