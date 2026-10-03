import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// The public showcase (Proof of Merge), its own bundle: served by the office at /pom/ and exported as
// static files to GitHub Pages by onchain/indexer (scripts/showcase.ts). Relative asset paths, so the
// same files work under /pom/ and under any Pages path. Nothing inline: the page's policy forbids it.
export default defineConfig({
  root: resolve(import.meta.dirname, 'src/client/showcase'),
  base: './',
  publicDir: false,
  build: {
    outDir: resolve(import.meta.dirname, 'dist/showcase'),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
  },
  server: {
    port: 5174,
    proxy: { '/pom/showcase.json': { target: 'http://localhost:4600', changeOrigin: false } },
  },
});
