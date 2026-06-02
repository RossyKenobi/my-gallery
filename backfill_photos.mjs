import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { neon } from '@neondatabase/serverless';
import sharp from 'sharp';

const sql = neon(process.env.POSTGRES_URL);

async function run() {
  console.log('Fetching photos to backfill...');
  const photos = await sql`SELECT id, image_url FROM photos WHERE is_portrait IS NULL`;
  console.log(`Found ${photos.length} photos.`);
  
  for (const photo of photos) {
    try {
      console.log(`Processing ${photo.image_url}...`);
      const res = await fetch(photo.image_url);
      const buffer = await res.arrayBuffer();
      const metadata = await sharp(Buffer.from(buffer)).metadata();
      const isPortrait = metadata.height > metadata.width;
      await sql`UPDATE photos SET is_portrait = ${isPortrait} WHERE id = ${photo.id}`;
      console.log(`Updated photo ${photo.id} to is_portrait=${isPortrait}`);
    } catch (e) {
      console.error(`Failed to process photo ${photo.id}:`, e.message);
    }
  }
  console.log('Done backfilling.');
}
run();
