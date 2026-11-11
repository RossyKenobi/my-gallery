import type { APIRoute } from 'astro';
import { sql } from '../../lib/db';
import { isAdmin } from '../../lib/auth';
import { validateText } from '../../lib/validate';

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const rows = await sql`SELECT key, value FROM site_settings WHERE key IN ('site_title', 'site_subtitle', 'site_about')`;
    const settings: Record<string, string> = {};
    rows.forEach(r => settings[r.key] = r.value);
    return new Response(JSON.stringify(settings), { status: 200 });
  } catch (err: any) {
    console.error('Failed to get site settings:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
};

export const PUT: APIRoute = async ({ request, locals }) => {
  const auth = locals.auth();
  if (!auth?.userId) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  
  const adminFlag = await isAdmin(auth.userId);
  if (!adminFlag) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });

  try {
    const { title, subtitle, about } = await request.json();

    if (title !== undefined) {
      const safeTitle = validateText(title, 200, 'title');
      await sql`
        INSERT INTO site_settings (key, value) VALUES ('site_title', ${safeTitle})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      `;
    }
    if (subtitle !== undefined) {
      const safeSubtitle = validateText(subtitle, 500, 'subtitle');
      await sql`
        INSERT INTO site_settings (key, value) VALUES ('site_subtitle', ${safeSubtitle})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      `;
    }
    if (about !== undefined) {
      const safeAbout = validateText(about, 5000, 'about');
      await sql`
        INSERT INTO site_settings (key, value) VALUES ('site_about', ${safeAbout})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      `;
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err: any) {
    if (err instanceof Error && /must be a string|exceeds maximum length/i.test(err.message)) {
      return new Response(JSON.stringify({ error: err.message }), { status: 400 });
    }
    console.error('Failed to update site settings:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
};
