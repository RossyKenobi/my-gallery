#!/usr/bin/env node
/**
 * Backfill missing 640px WebP thumbnails for existing `photos` rows where `thumbnail_url IS NULL`.
 * Usage:
 *   node --env-file=.env.local scripts/backfill-thumbnails.mjs [--dry-run]
 */
import { neon } from '@neondatabase/serverless';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { nanoid } from 'nanoid';

const isDryRun = process.argv.includes('--dry-run');

const DATABASE_URL = process.env.DATABASE_URL;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'penumbrae-storage';

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL environment variable.');
  process.exit(1);
}
if (!isDryRun && (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY)) {
  console.error('Missing R2 credentials in environment variables.');
  process.exit(1);
}

const sql = neon(DATABASE_URL);
const s3 = isDryRun
  ? null
  : new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });

async function main() {
  const rows = await sql`
    SELECT id, image_url
    FROM photos
    WHERE thumbnail_url IS NULL OR thumbnail_url = ''
    ORDER BY id ASC
  `;

  console.log(`Found ${rows.length} photo(s) missing thumbnail_url.`);

  for (const row of rows) {
    const { id, image_url: imageUrl } = row;
    try {
      const res = await fetch(imageUrl);
      if (!res.ok) {
        console.warn(`[skip] Photo #${id}: HTTP ${res.status} fetching ${imageUrl}`);
        continue;
      }
      const inputBuffer = Buffer.from(await res.arrayBuffer());
      const thumbBuffer = await sharp(inputBuffer)
        .rotate()
        .resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();

      const thumbKey = `posts/thumb_backfill_${id}_${nanoid(8)}.webp`;
      const thumbUrl = `https://img.penumbrae.uk/${thumbKey}`;

      if (isDryRun) {
        console.log(`[dry-run] Photo #${id}: would upload ${thumbBuffer.byteLength}B -> ${thumbUrl}`);
        continue;
      }

      await s3.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: thumbKey,
          Body: thumbBuffer,
          ContentType: 'image/webp',
          CacheControl: 'public, max-age=31536000, immutable',
        })
      );

      await sql`
        UPDATE photos
        SET thumbnail_url = ${thumbUrl}
        WHERE id = ${id}
      `;
      console.log(`[ok] Photo #${id} -> ${thumbUrl}`);
    } catch (err) {
      console.error(`[error] Photo #${id}:`, err.message || err);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
