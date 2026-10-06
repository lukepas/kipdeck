// Screenshots of the public, read-only pages the technical demo points at: the explorers for the real
// Solana devnet and Base Sepolia transactions, easscan, and the demo repo on GitHub. Nothing is signed in,
// nothing is clicked that changes anything; each page is loaded, given time to fetch its data, and shot at
// 1920x1080 (the edit pans over them). Basescan answers scripts with a challenge, so the Base Sepolia
// transactions are shown on Blockscout's Base Sepolia explorer, which reads the same chain.
//
//   node launch/video/capture/web.mjs [name,name,...]
//
// Writes launch/video/out/web/<name>.png (untracked).
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const require = createRequire(path.join(ROOT, 'package.json'));
const OUT = path.join(ROOT, 'launch', 'video', 'out', 'web');
mkdirSync(OUT, { recursive: true });
const only = process.argv[2] ? new Set(process.argv[2].split(',')) : undefined;

const PROGRAM = 'JAH6ZioohUJmhnTESy5TpedBPLuiGviZLhYFyQsyVQs6';
// The program's first release (2026-10-03), a demo bounty with no GitHub merge behind it (launch/chain/README.md).
const RELEASE = '2rPSWQv7YSWkEwJWNJtGtpeN8WYQzHXvbPz8xb9dCbEz8LnpatSZaoYHyyyq7dgUCkmWHrU4ywFc29HPYa73ZtUc';
// The bounty account for issue #2 on zbagdzevicius/ugc-army-demo (15 test USDC, open), from `ao-bounty show`.
const BOUNTY2 = '5V3sAZZ1eBBJ9sMK5tkB2KtQuxJnNpPL1TESNDkUwS85';
const SCHEMA = '0x368e9023c13393aea075e78cae18e804725b0d1bb3e2b1a6c1117d759a01a900';
const X402TX = '0x490896509be59e45e7d14afbaa3ec24c18db5292f4ea1c71cf79533670d126dc';
const REPUTATION = '0x8004B663056A597Dffe9eCcC1965A193B7388713';

/** name: [url, how long to let it load, what to do before the shot]. */
const PAGES = {
  'sol-release': [`https://explorer.solana.com/tx/${RELEASE}?cluster=devnet`, 9000, null],
  'sol-release-ix': [`https://explorer.solana.com/tx/${RELEASE}?cluster=devnet`, 9000, async (p) => scrollTo(p, 'text=Instruction', 160)],
  'sol-bounty2': [`https://explorer.solana.com/address/${BOUNTY2}?cluster=devnet`, 9000, null],
  'sol-program': [`https://explorer.solana.com/address/${PROGRAM}?cluster=devnet`, 9000, null],
  'eas-schema': [`https://base-sepolia.easscan.org/schema/view/${SCHEMA}`, 8000, null],
  'bs-x402': [`https://base-sepolia.blockscout.com/tx/${X402TX}`, 9000, null],
  'bs-reputation': [`https://base-sepolia.blockscout.com/address/${REPUTATION}`, 9000, null],
  'gh-pr4': ['https://github.com/zbagdzevicius/ugc-army-demo/pull/4', 5000, null],
  'gh-issue2': ['https://github.com/zbagdzevicius/ugc-army-demo/issues/2', 5000, null],
};

async function scrollTo(page, selector, above) {
  const el = page.locator(selector).first();
  await el.waitFor({ timeout: 15_000 });
  const box = await el.boundingBox();
  if (box) await page.evaluate((y) => window.scrollTo(0, y), Math.max(0, box.y + (await page.evaluate(() => window.scrollY)) - above));
  await page.waitForTimeout(800);
}

/** Cookie banners, ads and chat bubbles cover data; take them off the shot (the data is untouched). */
async function tidy(page) {
  for (const label of ['OPT-OUT', 'Opt-out', 'Reject all', 'Decline']) {
    const b = page.getByRole('button', { name: label, exact: true });
    if (await b.count().catch(() => 0)) await b.first().click({ timeout: 2000 }).catch(() => {});
  }
  await page.addStyleTag({
    content: `[class*="cookie" i], [id*="cookie" i], [class*="intercom" i], iframe[title*="chat" i] { display: none !important; }`,
  }).catch(() => {});
  // Ads: Blockscout's "Sponsored" row (its label and its value, a banner or a line of text, which changes
  // on every load), its side promo, and any outside banner image. Only ads are hidden; data is untouched.
  await page.evaluate(() => {
    const hide = (el) => el && (el.style.visibility = 'hidden');
    for (const el of document.querySelectorAll('body *')) {
      const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('');
      if (!/^Sponsored:?$/.test(own)) continue;
      let item = el;
      while (item.parentElement && item.parentElement.children.length === 1) item = item.parentElement;
      hide(item);
      hide(item.nextElementSibling);
      const short = el.closest('div');
      if (short && short.textContent.trim().length < 200) hide(short);
    }
    for (const img of document.querySelectorAll('a[target="_blank"] img, a[rel*="sponsored"] img')) {
      const a = img.closest('a');
      const r = img.getBoundingClientRect();
      if (a && new URL(a.href, location.href).host !== location.host && r.width > 120) hide(a);
    }
    for (const f of document.querySelectorAll('iframe')) hide(f);
  }).catch(() => {});
}

const { chromium } = require('playwright-core');
const browser = await chromium.launch({ headless: true });
const deadline = setTimeout(() => {
  console.error('TIMEOUT');
  process.exit(1);
}, 400_000);
let failed = 0;
try {
  for (const [name, [url, settle, act]] of Object.entries(PAGES)) {
    if (only && !only.has(name)) continue;
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
      colorScheme: 'dark',
      timezoneId: 'UTC',
      locale: 'en-US',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    try {
      const r = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await page.waitForTimeout(settle);
      await tidy(page);
      if (act) await act(page);
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT, `${name}.png`) });
      console.log('shot', name, r?.status(), (await page.title()).slice(0, 70));
    } catch (e) {
      failed++;
      console.log('failed', name, e.message.split('\n')[0]);
    }
    await context.close();
  }
} finally {
  clearTimeout(deadline);
  await browser.close();
}
process.exitCode = failed ? 1 : 0;
