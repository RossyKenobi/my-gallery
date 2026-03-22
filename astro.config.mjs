import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  base: process.env.VERCEL ? undefined : '/Test.1',
});
