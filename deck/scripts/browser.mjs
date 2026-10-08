// playwright-core comes from the repository's own node_modules one level up (no browser download needed).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const candidates = [
  process.env.PLAYWRIGHT_CORE,
  'playwright-core',
].filter(Boolean);
let pw;
for (const c of candidates) { try { pw = require(c); break; } catch { /* next */ } }
if (!pw) throw new Error('playwright-core not found; set PLAYWRIGHT_CORE');
export const chromium = pw.chromium;
