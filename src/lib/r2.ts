import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { sql } from './db';

export const R2_BUCKET = 'my-gallery-images';
export const R2_PUBLIC_HOST = 'img.penumbrae.uk';
const DELETABLE_PREFIX = 'posts/';

export function getS3Client() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${import.meta.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: import.meta.env.R2_ACCESS_KEY_ID,
      secretAccessKey: import.meta.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

/**
 * Returns the R2 key for a photo URL only if it is one of ours and lives under `posts/`.
 * Anything else (foreign hosts, legacy relative paths, backgrounds) is never deletable.
 */
function deletableKey(url: string | null | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== R2_PUBLIC_HOST) return null;
  const key = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  if (!key.startsWith(DELETABLE_PREFIX) || key.includes('..')) return null;
  return key;
}

/**
 * Deletes R2 objects for the given URLs, but only after the DB rows pointing at them are gone.
 * Must be called AFTER the owning rows have been deleted: any URL still referenced by another
 * photo row is skipped, so a user cannot delete someone else's file by pointing a row at it.
 * Failures are logged, never thrown — the DB is the source of truth.
 */
export async function deleteUnreferencedPhotoObjects(urls: Array<string | null | undefined>) {
  const unique = [...new Set(urls.filter((u): u is string => !!u))];
  if (unique.length === 0) return;
  const s3 = getS3Client();

  for (const url of unique) {
    const key = deletableKey(url);
    if (!key) continue;
    try {
      const stillUsed = await sql`
        SELECT 1 FROM photos WHERE image_url = ${url} OR thumbnail_url = ${url} LIMIT 1
      `;
      if (stillUsed.length > 0) continue;
      await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    } catch (e) {
      console.error('R2 cleanup failed for an object:', e);
    }
  }
}
