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
 * Sync existing registered users with Clerk (Lazy sync).
 * Never auto-inserts new rows (GA-03): only finalize-registration may create a users row.
 */
export async function ensureUser(clerkId: string, _email?: string) {
  const existing = await sql`SELECT * FROM users WHERE clerk_id = ${clerkId}`;

  if (existing.length === 0) {
    return null;
  }

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

/**
 * Look up a registered user row in `users`. Write endpoints must reject Clerk accounts
 * that have not completed invite finalization (GA-03).
 */
export async function requireRegisteredUser(clerkId: string | null | undefined) {
  if (!clerkId) return null;
  const rows = await sql`SELECT * FROM users WHERE clerk_id = ${clerkId}`;
  return rows.length > 0 ? rows[0] : null;
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
  // Ensure schema is up to date
  try {
    // columns already exist, assumed to be created by migrations
  } catch(e) {}

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
