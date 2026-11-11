import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel/serverless';
import clerk from '@clerk/astro';

export default defineConfig({
  output: 'hybrid',
  adapter: vercel(),
  security: {
    checkOrigin: true,
  },
  integrations: [clerk()],
  vite: {
    ssr: {
      noExternal: ['nanoid', 'clsx', '@clerk/astro'],
    },
  },
});
