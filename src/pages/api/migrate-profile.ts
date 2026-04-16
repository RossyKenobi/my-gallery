import type { APIRoute } from 'astro';
import { sql } from '../../lib/db';
import { isAdmin } from '../../lib/auth';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const auth = locals.auth();
  if (!auth?.userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const adminFlag = await isAdmin(auth.userId);
  if (!adminFlag) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  const results: string[] = [];

  try {
    // 1. Add username column to users (ignore if exists)
    try {
      await sql`ALTER TABLE users ADD COLUMN username VARCHAR(255) UNIQUE`;
      results.push('Added users.username column');
    } catch (e: any) {
      if (e.message?.includes('already exists')) {
        results.push('users.username already exists, skipped');
      } else {
        throw e;
      }
    }

    // 2. Add background_url column to users
    try {
      await sql`ALTER TABLE users ADD COLUMN background_url TEXT`;
      results.push('Added users.background_url column');
    } catch (e: any) {
      if (e.message?.includes('already exists')) {
        results.push('users.background_url already exists, skipped');
      } else {
        throw e;
      }
    }

    try {
      await sql`ALTER TABLE users ADD COLUMN profile_title VARCHAR(255)`;
      results.push('Added users.profile_title column');
    } catch (e: any) {
      if (e.message?.includes('already exists')) results.push('users.profile_title already exists, skipped');
      else throw e;
    }

    try {
      await sql`ALTER TABLE users ADD COLUMN profile_subtitle VARCHAR(255)`;
      results.push('Added users.profile_subtitle column');
    } catch (e: any) {
      if (e.message?.includes('already exists')) results.push('users.profile_subtitle already exists, skipped');
      else throw e;
    }

    // 3. Add personal_sort_order column to stacks
    try {
      await sql`ALTER TABLE stacks ADD COLUMN personal_sort_order INTEGER DEFAULT 0`;
      results.push('Added stacks.personal_sort_order column');
    } catch (e: any) {
      if (e.message?.includes('already exists')) {
        results.push('stacks.personal_sort_order already exists, skipped');
      } else {
        throw e;
      }
    }

    // 4. Initialize personal_sort_order from sort_order
    await sql`UPDATE stacks SET personal_sort_order = sort_order WHERE personal_sort_order = 0 OR personal_sort_order IS NULL`;
    results.push('Initialized personal_sort_order from sort_order');

    // 5. Create username_redirects table
    try {
      await sql`
        CREATE TABLE username_redirects (
          old_username VARCHAR(255) PRIMARY KEY,
          new_username VARCHAR(255) NOT NULL,
          clerk_id VARCHAR(255) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `;
      results.push('Created username_redirects table');
    } catch (e: any) {
      if (e.message?.includes('already exists')) {
        results.push('username_redirects table already exists, skipped');
      } else {
        throw e;
      }
    }

    // 6. Backfill usernames from Clerk for existing users
    const users = await sql`SELECT clerk_id FROM users WHERE username IS NULL`;
    let backfilled = 0;

    for (const user of users) {
      try {
        const res = await fetch(`https://api.clerk.com/v1/users/${user.clerk_id}`, {
          headers: { Authorization: `Bearer ${import.meta.env.CLERK_SECRET_KEY}` }
        });
        if (res.ok) {
          const clerkUser = await res.json();
          const username = clerkUser.username || null;
          if (username) {
            await sql`UPDATE users SET username = ${username} WHERE clerk_id = ${user.clerk_id}`;
            backfilled++;
          }
        }
      } catch (e) {
        console.error(`Failed to backfill username for ${user.clerk_id}:`, e);
      }
    }
    results.push(`Backfilled ${backfilled} usernames from Clerk`);

    return new Response(JSON.stringify({ success: true, results }), { status: 200 });
  } catch (err: any) {
    console.error('Profile migration error:', err);
    return new Response(JSON.stringify({ error: err.message, results }), { status: 500 });
  }
};
