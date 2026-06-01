import type { APIRoute } from 'astro';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { nanoid } from 'nanoid';

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
    const filename = formData.get('filename') as string;

    if (!file || !(file instanceof File)) {
      return new Response(JSON.stringify({ error: 'File is required' }), { status: 400 });
    }

    const originalExt = file.name.split('.').pop() || 'jpg';
    const safeFilename = `${nanoid()}.${originalExt}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const key = `posts/${safeFilename}`;

    const s3 = getS3Client();
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: file.type || 'image/jpeg',
    }));

    const finalImageUrl = `https://img.penumbrae.uk/${key}`;

    return new Response(JSON.stringify({ finalImageUrl }), { status: 200 });
  } catch (err: any) {
    console.error('Upload error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
