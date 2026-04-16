import type { APIRoute } from 'astro';
import { sql } from '../../lib/db';
import { isAdmin } from '../../lib/auth';

export const prerender = false;

// Auto-migrate the table if it doesn't exist
async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS site_settings (
      key VARCHAR(255) PRIMARY KEY,
      value TEXT NOT NULL
    )
  `;
}

export const GET: APIRoute = async () => {
  try {
    await ensureTable();
    const rows = await sql`SELECT key, value FROM site_settings WHERE key IN ('site_title', 'site_subtitle')`;
    const settings: Record<string, string> = {};
    rows.forEach(r => settings[r.key] = r.value);
    return new Response(JSON.stringify(settings), { status: 200 });
  } catch (err: any) {
    console.error('Failed to get site settings:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};

export const PUT: APIRoute = async ({ request, locals }) => {
  const auth = locals.auth();
  if (!auth?.userId) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  
  const adminFlag = await isAdmin(auth.userId);
  if (!adminFlag) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });

  try {
    const { title, subtitle } = await request.json();
    await ensureTable();

    if (title !== undefined) {
      await sql`
        INSERT INTO site_settings (key, value) VALUES ('site_title', ${title})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      `;
    }
    if (subtitle !== undefined) {
      await sql`
        INSERT INTO site_settings (key, value) VALUES ('site_subtitle', ${subtitle})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      `;
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err: any) {
    console.error('Failed to update site settings:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
