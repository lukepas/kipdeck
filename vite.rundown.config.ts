import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { RUNDOWN_VERSION, VERSION_STAMP } from './src/shared/rundown/version.ts';

// The /rundown skill's script: the office's own collector and page (src/server/rundown/cli.ts,
// src/shared/rundown/) as one dependency-free ESM file for Node 18 or newer, written beside the skill
// as skills/rundown/scripts/rundown.mjs. It is committed, because the Claude Code plugin (.claude-plugin/)
// installs from git with no build step; tests/rundown-plugin.test.ts fails when it is out of date. The npm
// package ships it with SKILL.md and README.md, and `kipdeck rundown install` (or `npm run rundown:install`
// in a source checkout) copies all three into ~/.claude/skills/rundown/. Its second line carries the
// version, so the installer never replaces a newer copy with an older one.
export default defineConfig({
  publicDir: false,
  logLevel: 'warn',
  build: {
    ssr: resolve(import.meta.dirname, 'src/server/rundown/bin.ts'),
    outDir: resolve(import.meta.dirname, 'skills/rundown/scripts'),
    // The folder holds only this file; nothing else in skills/ is touched.
    emptyOutDir: false,
    target: 'node18',
    minify: false,
    rollupOptions: {
      output: { format: 'es', entryFileNames: 'rundown.mjs', codeSplitting: false, banner: `#!/usr/bin/env node\n${VERSION_STAMP(RUNDOWN_VERSION)}` },
    },
  },
  ssr: { noExternal: true, target: 'node' },
});
