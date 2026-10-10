// The deck's share card: slide 1's final frame at 1200x675, the og:image and twitter:image in
// site/index.html. Media is served with a one-year immutable cache (vercel.json), so when slide 1
// changes, write a new name and point the <head> at it.
// Usage: node scripts/og.mjs [out]   (default site/media/og-deck-v1.png; PORT=<n> pins the port)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';
import { chromium } from './browser.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(process.argv[2] ?? path.join(here, '..', 'site', 'media', 'og-deck-v1.png'));
const { server, url } = await serve();
const browser = await chromium.launch();
try {
  // The 1920x1080 stage, drawn at 0.625 so the card is 1200x675 with the slide's own layout.
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 0.625 });
  await page.goto(url + '?hold=final#1');
  await page.waitForFunction(() => window.__deckReady && document.fonts.status === 'loaded');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await page.screenshot({ path: out });
  console.log('wrote ' + out);
} finally {
  await browser.close();
  server.close();
}
