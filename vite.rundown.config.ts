import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// The /rundown skill's script: the office's own collector and page (src/server/rundown/cli.ts,
// src/shared/rundown/) as one dependency-free ESM file for Node 18 or newer, dist/rundown/rundown.mjs.
// `npm run rundown:install` copies it, with skills/rundown/SKILL.md and README.md, into ~/.claude/skills/rundown/
// (after listing what changes and backing up what was there).
export default defineConfig({
  publicDir: false,
  logLevel: 'warn',
  build: {
    ssr: resolve(import.meta.dirname, 'src/server/rundown/bin.ts'),
    outDir: resolve(import.meta.dirname, 'dist/rundown'),
    emptyOutDir: true,
    target: 'node18',
    minify: false,
    rollupOptions: {
      output: { format: 'es', entryFileNames: 'rundown.mjs', codeSplitting: false, banner: '#!/usr/bin/env node' },
    },
  },
  ssr: { noExternal: true, target: 'node' },
});
