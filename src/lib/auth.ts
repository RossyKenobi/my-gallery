import { sql } from './db';

/**
 * Fetch the current username from Clerk API
 */
async function fetchClerkUsername(clerkId: string): Promise<{ username: string | null; email: string | null }> {
  try {
    const res = await fetch(`https://api.clerk.com/v1/users/${clerkId}`, {
      headers: { Authorization: `Bearer ${import.meta.env.CLERK_SECRET_KEY}` }
    });
    if (res.ok) {
      const clerkUser = await res.json();
      return {
        username: clerkUser.username || null,
        email: clerkUser.email_addresses?.[0]?.email_address || null,
      };
    }
  } catch (err) {
    console.error('Clerk sync error:', err);
  }
  return { username: null, email: null };
}

/**
 * Sync Clerk users into Postgres (Lazy sync).
 * - If user exists: check and sync username changes (with redirect logging)
 * - If user doesn't exist: create with username
 */
export async function ensureUser(clerkId: string, email?: string) {
  const existing = await sql`SELECT * FROM users WHERE clerk_id = ${clerkId}`;

  if (existing.length > 0) {
    const dbUser = existing[0];

    // Fetch latest username from Clerk to check for changes
    const clerk = await fetchClerkUsername(clerkId);

    if (clerk.username && clerk.username !== dbUser.username) {
      // Username changed — log redirect from old to new
      if (dbUser.username) {
        try {
          await sql`
            INSERT INTO username_redirects (old_username, new_username, clerk_id)
            VALUES (${dbUser.username}, ${clerk.username}, ${clerkId})
            ON CONFLICT (old_username) DO UPDATE SET new_username = ${clerk.username}
          `;
        } catch (e) {
          console.error('Failed to log username redirect:', e);
        }
      }

      // Update the username in users table
      await sql`UPDATE users SET username = ${clerk.username} WHERE clerk_id = ${clerkId}`;
      dbUser.username = clerk.username;
    }

    // Also sync email if changed
    if (clerk.email && clerk.email !== dbUser.email) {
      await sql`UPDATE users SET email = ${clerk.email} WHERE clerk_id = ${clerkId}`;
      dbUser.email = clerk.email;
    }

    return dbUser;
  }

  // --- User does not exist: create ---
  const clerk = await fetchClerkUsername(clerkId);
  let finalEmail = email || clerk.email;
  if (!finalEmail) {
    finalEmail = `user_${clerkId}@noemail.local`;
  }

  const inserted = await sql`
    INSERT INTO users (clerk_id, email, username, is_admin, created_at)
    VALUES (${clerkId}, ${finalEmail}, ${clerk.username}, false, NOW())
    ON CONFLICT (clerk_id) DO UPDATE SET email = EXCLUDED.email, username = COALESCE(EXCLUDED.username, users.username)
    RETURNING *
  `;

  return inserted[0] || (await sql`SELECT * FROM users WHERE clerk_id = ${clerkId}`)[0];
}

/**
 * Check if the current user is an Admin
 */
export async function isAdmin(clerkId: string): Promise<boolean> {
  const rows = await sql`SELECT is_admin FROM users WHERE clerk_id = ${clerkId}`;
  return rows.length > 0 && rows[0].is_admin === true;
}

/**
 * Look up a user by their username
 */
export async function getUserByUsername(username: string) {
  const rows = await sql`SELECT * FROM users WHERE username = ${username}`;
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Check for a username redirect (old → new)
 */
export async function getRedirect(oldUsername: string): Promise<string | null> {
  const rows = await sql`SELECT new_username FROM username_redirects WHERE old_username = ${oldUsername}`;
  return rows.length > 0 ? rows[0].new_username : null;
}
