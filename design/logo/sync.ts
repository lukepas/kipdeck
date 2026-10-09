// Writes every static copy of the logo from src/shared/logo.ts, so none of them can drift:
//
//   npm run logo            # rewrite the SVG files and the inline marks in the pages
//   npm run logo -- --png   # and render the PNG app icons with headless Chromium
//
// tests/logo.test.ts runs drift() and fails on any file that differs from what this would write.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { LOGO_COLORS, appIconSvg, faviconSvg, lockupFile, logoPaths, markFile, viewBoxOf, type LogoKind } from '../../src/shared/logo.ts';

export const ROOT = path.resolve(import.meta.dirname, '../..');

/** The standalone SVG files, each with the content it must have. */
export function files(): Record<string, string> {
  const calm = faviconSvg();
  const alert = faviconSvg(LOGO_COLORS.signal);
  return {
    'src/client/public/favicon.svg': calm,
    'src/client/showcase/favicon.svg': faviconSvg(LOGO_COLORS.proof),
    'site/landing/public/favicon.svg': calm,
    'site/landing/public/favicon-alert.svg': alert,
    'deck/site/favicon.svg': calm,
    'design/logo/mark.svg': markFile('mark'),
    'design/logo/mark-small.svg': markFile('small'),
    'design/logo/lockup-dark.svg': lockupFile('dark'),
    'design/logo/lockup-light.svg': lockupFile('light'),
    'design/logo/favicon.svg': calm,
    'design/logo/favicon-alert.svg': alert,
    'design/logo/app-icon.svg': appIconSvg(),
    'design/logo/app-icon-alert.svg': appIconSvg(true),
  };
}

/** The PNG app icons, rendered from app-icon.svg: [file, size]. */
export const PNGS: [string, number][] = [
  ['src/client/public/apple-touch-icon.png', 180],
  ['site/landing/public/apple-touch-icon.png', 180],
  ['deck/site/apple-touch-icon.png', 180],
  ['design/logo/app-icon-512.png', 512],
];

/** The pages and templates that draw the logo inline, as <svg data-logo="mark|small|lockup">. */
export const INLINE = [
  'src/client/index.html',
  'src/client/bridge.html',
  'src/client/login.html',
  'src/client/join.html',
  'src/client/claim.html',
  'src/client/showcase/index.html',
  'site/landing/index.html',
  'site/build.mjs',
  'deck/site/index.html',
  'design/record-demo.mjs',
];

const INLINE_SVG = /(<svg\b[^>]*\bdata-logo="(mark|small|lockup)"[^>]*>)([\s\S]*?)(<\/svg>)/g;

/** The text with every inline logo's paths and view box rewritten from logo.ts. */
export function syncInline(text: string): string {
  return text.replace(INLINE_SVG, (_m, open: string, kind: LogoKind, _inner: string, close: string) => {
    const tag = open.replace(/\bviewBox="[^"]*"/, `viewBox="${viewBoxOf(kind)}"`);
    return `${tag}${logoPaths(kind)}${close}`;
  });
}

/** How many inline logos a text carries. */
export const inlineCount = (text: string) => [...text.matchAll(INLINE_SVG)].length;

/** Every file that is not what `npm run logo` would write, with why. */
export function drift(): string[] {
  const out: string[] = [];
  for (const [f, want] of Object.entries(files())) {
    const p = path.join(ROOT, f);
    if (!existsSync(p)) out.push(`${f} is missing`);
    else if (readFileSync(p, 'utf8') !== want) out.push(`${f} differs from src/shared/logo.ts`);
  }
  for (const f of INLINE) {
    const text = readFileSync(path.join(ROOT, f), 'utf8');
    if (inlineCount(text) === 0) out.push(`${f} draws no inline logo`);
    else if (syncInline(text) !== text) out.push(`${f} has an inline logo that differs from src/shared/logo.ts`);
  }
  for (const [f] of PNGS) if (!existsSync(path.join(ROOT, f))) out.push(`${f} is missing (npm run logo -- --png)`);
  return out;
}

async function renderPngs() {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ headless: true }).catch(() => chromium.launch({ headless: true, channel: 'chrome' }));
  try {
    const page = await browser.newPage();
    for (const [f, size] of PNGS) {
      await page.setViewportSize({ width: size, height: size });
      await page.setContent(`<style>*{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${appIconSvg()}`);
      await page.screenshot({ path: path.join(ROOT, f), omitBackground: false });
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  for (const [f, content] of Object.entries(files())) {
    mkdirSync(path.dirname(path.join(ROOT, f)), { recursive: true });
    writeFileSync(path.join(ROOT, f), content);
  }
  for (const f of INLINE) {
    const p = path.join(ROOT, f);
    writeFileSync(p, syncInline(readFileSync(p, 'utf8')));
  }
  if (process.argv.includes('--png')) await renderPngs();
  const left = drift();
  console.log(left.length ? left.join('\n') : 'logo: every copy matches src/shared/logo.ts');
  if (left.length) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
