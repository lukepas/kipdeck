// Export every slide to PDF, one 1920x1080 page per slide, final state.
// Usage: node scripts/pdf.mjs            -> out/deck.pdf (dark, as presented)
//        node scripts/pdf.mjs --light    -> out/deck-light.pdf (light theme for print)
//        node scripts/pdf.mjs --out=<path>  -> that file instead
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';
import { chromium } from './browser.mjs';

const light = process.argv.includes('--light');
const outArg = process.argv.find((a) => a.startsWith('--out='));   // --out=<path>: write somewhere else (checks)
const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'out');
const out = outArg ? path.resolve(outArg.slice(6)) : path.join(outDir, light ? 'deck-light.pdf' : 'deck.pdf');
fs.mkdirSync(path.dirname(out), { recursive: true });
const { server, url } = await serve();
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(url + '?print' + (light ? '&theme=light' : '') + '#1');
  await page.waitForFunction(() => window.__deckReady);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await page.pdf({ path: out, width: '1920px', height: '1080px', printBackground: true, preferCSSPageSize: true });
  console.log('wrote ' + out);
} finally {
  await browser.close();
  server.close();
}
