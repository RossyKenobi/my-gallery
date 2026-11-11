import type { APIRoute } from 'astro';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { nanoid } from 'nanoid';
import { requireRegisteredUser } from '../../lib/auth';
import { getS3Client, inspectUploadedImage, R2_BUCKET } from '../../lib/r2';

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
    const thumbnail = formData.get('thumbnail');
    const lqip = formData.get('lqip') as string;

    if (!file || !(file instanceof File)) {
      return new Response(JSON.stringify({ error: 'File is required' }), { status: 400 });
    }

    let inspectedMain: Awaited<ReturnType<typeof inspectUploadedImage>>;
    try {
      inspectedMain = await inspectUploadedImage(file);
    } catch (validationErr: any) {
      return new Response(JSON.stringify({ error: validationErr.message }), { status: 400 });
    }

    const baseId = nanoid();
    const safeFilename = `${baseId}.${inspectedMain.ext}`;
    const key = `posts/${safeFilename}`;

    const s3 = getS3Client();
    await s3.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: inspectedMain.buffer,
      ContentType: inspectedMain.contentType,
    }));

    const finalImageUrl = `https://img.penumbrae.uk/${key}`;
    let thumbnailUrl = '';

    if (thumbnail && thumbnail instanceof File) {
      let inspectedThumb: Awaited<ReturnType<typeof inspectUploadedImage>>;
      try {
        inspectedThumb = await inspectUploadedImage(thumbnail);
      } catch (validationErr: any) {
        return new Response(JSON.stringify({ error: validationErr.message }), { status: 400 });
      }
      const thumbKey = `posts/thumb_${baseId}.${inspectedThumb.ext}`;
      await s3.send(new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: thumbKey,
        Body: inspectedThumb.buffer,
        ContentType: inspectedThumb.contentType,
      }));
      thumbnailUrl = `https://img.penumbrae.uk/${thumbKey}`;
    }

    return new Response(JSON.stringify({ finalImageUrl, thumbnailUrl, lqip }), { status: 200 });
  } catch (err: any) {
    console.error('Upload error:', err);
    return new Response(JSON.stringify({ error: 'Failed to upload image' }), { status: 500 });
  }
};
