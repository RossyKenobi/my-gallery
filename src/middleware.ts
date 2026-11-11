import { defineMiddleware, sequence } from 'astro:middleware';
import { clerkMiddleware } from '@clerk/astro/server';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Enforce same-origin Origin header on all state-changing requests (GA-14),
// including JSON or text/plain requests where SameSite=Lax cookies from subdomains could be sent.
const csrfOriginMiddleware = defineMiddleware(async (context, next) => {
  if (!SAFE_METHODS.has(context.request.method.toUpperCase())) {
    const origin = context.request.headers.get('origin');
    if (!origin || origin !== context.url.origin) {
      return new Response(JSON.stringify({ error: 'Cross-site request forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }
  return next();
});

export const onRequest = sequence(
  csrfOriginMiddleware,
  clerkMiddleware({
    authorizedParties: [
      'https://penumbrae.uk',
      'http://localhost:4321',
      'http://localhost:3000',
    ],
  })
);
