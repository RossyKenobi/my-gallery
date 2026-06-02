import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { neon } from '@neondatabase/serverless';
import sharp from 'sharp';

const sql = neon(process.env.POSTGRES_URL);

async function run() {
  console.log('Fetching ALL photos to regenerate high-res LQIP...');
  const rows = await sql`SELECT id, image_url, thumbnail_url FROM photos`;
  console.log(`Found ${rows.length} photos to process.`);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    console.log(`Processing ${i + 1}/${rows.length} (ID: ${row.id})...`);
    try {
      const url = row.thumbnail_url || row.image_url;
      const res = await fetch(url);
      if (!res.ok) {
        console.error(`Failed to fetch ${url}`);
        continue;
      }
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const lqipBuffer = await sharp(buffer)
        .resize({ width: 60, height: 60, fit: 'inside' })
        .jpeg({ quality: 40 })
        .toBuffer();

      const lqipStr = `data:image/jpeg;base64,${lqipBuffer.toString('base64')}`;

      await sql`UPDATE photos SET lqip = ${lqipStr} WHERE id = ${row.id}`;
      console.log(`Success for ID: ${row.id}`);
    } catch (e) {
      console.error(`Error processing ID: ${row.id}`, e);
    }
  }
  console.log('Done!');
}

run().catch(console.error);
