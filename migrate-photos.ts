import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

async function migrate() {
  const sql = neon(process.env.POSTGRES_URL as string);
  console.log('Running migration...');
  try {
    await sql`ALTER TABLE photos ADD COLUMN IF NOT EXISTS thumbnail_url TEXT`;
    await sql`ALTER TABLE photos ADD COLUMN IF NOT EXISTS lqip TEXT`;
    console.log('Migration successful!');
  } catch (err) {
    console.error('Migration failed:', err);
  }
}

migrate();
