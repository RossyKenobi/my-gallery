import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel/serverless';
import clerk from '@clerk/astro';

export default defineConfig({
  site: 'https://penumbrae.uk',
  output: 'hybrid',
  adapter: vercel(),
  // Note: CSRF Origin validation for state-changing methods (POST/PUT/PATCH/DELETE)
  // is enforced in src/middleware.ts so HEAD/OPTIONS requests aren't blocked by Astro 4's createOriginCheckMiddleware bug.
  security: {
    checkOrigin: false,
  },
  integrations: [clerk()],
  vite: {
    ssr: {
      noExternal: ['nanoid', 'clsx', '@clerk/astro'],
    },
  },
});
