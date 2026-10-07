// Builds the landing page (site/landing/, Vite) into dist/site/, fills in its deploy addresses from
// the environment, and renders its share card (og.png) from the brand. See docs/landing.md.
//
//   MERGELINE_SITE_URL=https://mergeline.dev/ MERGELINE_WAITLIST_URL=https://... npm run build:site
//   MERGELINE_BRAND=ugc-army npm run build:site        # the other name (site/landing/brand.ts)
//
// Each address must be https (a waitlist on http would send emails in the clear). Without
// MERGELINE_WAITLIST_URL the form checks its input and says nothing was sent. The page's
// Content-Security-Policy lets it reach the waitlist's origin and no other.
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = path.join(ROOT, 'dist', 'site');
/** The repository every link and command on the page points at until MERGELINE_REPO_URL says otherwise. */
export const DEFAULT_REPO = 'https://github.com/zbagdzevicius/ugcarmy';

/** The built page with its addresses filled in. Exported for tests/landing.test.ts. */
export function buildPage(html, env) {
  const url = (name) => {
    const v = (env[name] ?? '').trim();
    if (!v) return '';
    let u;
    try {
      u = new URL(v);
    } catch {
      throw new Error(`${name} is not a URL: ${v}`);
    }
    if (u.protocol !== 'https:') throw new Error(`${name} must be https: ${v}`);
    return u;
  };
  const attr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  let out = html;
  const waitlist = url('MERGELINE_WAITLIST_URL');
  if (waitlist) {
    out = out.replace('data-endpoint=""', `data-endpoint="${attr(waitlist.href)}"`);
    out = out.replace("connect-src 'none'", `connect-src ${waitlist.origin}`);
  }
  const demo = url('MERGELINE_DEMO_URL');
  if (demo) out = out.replace('data-link="demo" href="#try-demo"', `data-link="demo" href="${attr(demo.href)}" rel="noopener"`);
  // Where the page itself lives: the canonical link, og:url, and absolute addresses for the share
  // card (most link previews ignore a relative og:image). Without it there is no canonical link,
  // since a relative one would be wrong wherever the page is copied.
  const site = url('MERGELINE_SITE_URL');
  if (site) {
    const href = attr(site.href.endsWith('/') ? site.href : `${site.href}/`);
    out = out.replace('<meta name="robots"', `<link rel="canonical" href="${href}">\n<meta property="og:url" content="${href}">\n<meta name="robots"`);
    out = out.replaceAll('content="og.png"', `content="${href}og.png"`);
    out = out.replace('"image":"og.png"', `"image":"${href}og.png","url":"${href}"`);
  }
  const repo = url('MERGELINE_REPO_URL');
  if (repo) out = out.replaceAll(DEFAULT_REPO, attr(repo.href.replace(/\/$/, '')));
  // Until `npx` works from the registry, the page shows the from-source command and says so (never a
  // command that 404s). Published, the npx command takes its place.
  if (env.MERGELINE_NPM_PUBLISHED === '1') {
    out = out.replace(/\s*<(div|p|pre|span|code)\b[^>]*\bdata-unpublished\b[^>]*>[\s\S]*?<\/\1>/g, '');
    out = out.replaceAll('data-published hidden', 'data-published');
    out = out.replace(/data-copy="[^"]*" data-copy-published="([^"]*)"/g, 'data-copy="$1"');
  }
  return out;
}

/** The share card, 1200 by 630, drawn from the brand with the page's own fonts. */
export function cardHtml({ name, lead, muted, archivo, mono }) {
  const font = (f) => `data:font/woff2;base64,${readFileSync(f).toString('base64')}`;
  return `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:A;src:url(${font(archivo)});font-weight:100 900;font-stretch:62% 125%}
@font-face{font-family:M;src:url(${font(mono)});font-weight:100 800}
*{margin:0;box-sizing:border-box}html,body{width:1200px;height:630px;background:#0d131a;color:#e8ecef;font-family:A}
body{padding:64px 72px;background-image:radial-gradient(rgba(138,151,165,.25) 1px,transparent 1.2px),radial-gradient(600px 500px at 90% 80%,rgba(255,106,26,.12),transparent);background-size:28px 28px,auto;position:relative;overflow:hidden}
.top{display:flex;align-items:center;gap:14px;font-stretch:118%;font-weight:600;letter-spacing:.06em;font-size:24px}.top span{color:#8a97a5}
h1{margin-top:70px;font-stretch:118%;font-weight:750;font-size:104px;line-height:.92;letter-spacing:-.025em}h1 b{color:#ff6a1a;font-weight:750;font-stretch:125%}
p{margin-top:34px;font-size:28px;color:#8a97a5;max-width:900px}
.row{position:absolute;right:72px;top:64px;display:flex;align-items:center;gap:12px;padding:12px 16px;border:1px solid #3a4756;border-left:3px solid #ff6a1a;border-radius:4px;background:#141b23;font-family:M;font-size:20px;color:#ff6a1a}
.row i{width:14px;height:14px;background:#ff6a1a;transform:rotate(45deg)}
.bar{position:absolute;left:0;top:0;height:6px;width:38%;background:#ff6a1a}
</style><div class="bar"></div><div class="top"><svg width="34" height="34" viewBox="0 0 24 24"><path d="M4 10 11 3l1 1 1-1 7 7v4l-8-8-8 8Z" fill="#ff6a1a"/><path d="m4 17 8-8 8 8M4 22l8-8 8 8" fill="none" stroke="#e8ecef" stroke-width="2.5"/></svg>${lead}<span>${muted}</span></div>
<div class="row"><i></i>waiting 23:04</div>
<h1>Your agents are<br><b>waiting</b> on you.</h1><p>${name}: one inbox for every coding agent you run. Answer, review and merge.</p>`;
}

async function shareCard(outDir) {
  const html = readFileSync(path.join(outDir, 'index.html'), 'utf8');
  const name = (html.match(/<meta property="og:site_name" content="([^"]*)"/) ?? [])[1] ?? '';
  const lead = (html.match(/<tspan class="wm-lead">([^<]*)</) ?? [])[1] ?? '';
  const muted = (html.match(/<tspan class="wm-muted">([^<]*)</) ?? [])[1] ?? '';
  const assets = readdirSync(path.join(outDir, 'assets'));
  const pick = (re) => path.join(outDir, 'assets', assets.find((f) => re.test(f)) ?? '');
  let chromium;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch {
    return 'playwright-core is not installed: og.png not drawn';
  }
  let browser;
  for (const how of [{}, ...(process.env.CHROMIUM_PATH ? [{ executablePath: process.env.CHROMIUM_PATH }] : []), { channel: 'chrome' }]) {
    try {
      browser = await chromium.launch({ headless: true, ...how });
      break;
    } catch {
      // Try the next browser.
    }
  }
  if (!browser) return 'no headless Chromium here: og.png not drawn';
  try {
    const dir = mkdtempSync(path.join(tmpdir(), 'og-'));
    const file = path.join(dir, 'card.html');
    writeFileSync(file, cardHtml({ name, lead, muted, archivo: pick(/^archivo-latin-[\w-]+\.woff2$/), mono: pick(/^jetbrains-mono-latin-[\w-]+\.woff2$/) }));
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
    await page.goto(pathToFileURL(file).href);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(outDir, 'og.png') });
    return 'og.png drawn';
  } finally {
    await browser.close();
  }
}

/** robots.txt (from public/) gets the sitemap's address, and sitemap.xml is written, once the build knows where the page lives. */
export function writeCrawlerFiles(outDir, env) {
  const v = (env.MERGELINE_SITE_URL ?? '').trim();
  if (!v) return;
  const href = new URL(v).href.replace(/\/?$/, '/');
  const robots = path.join(outDir, 'robots.txt');
  writeFileSync(robots, `${readFileSync(robots, 'utf8').trimEnd()}\nSitemap: ${href}sitemap.xml\n`);
  const day = new Date().toISOString().slice(0, 10);
  writeFileSync(
    path.join(outDir, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${href}</loc><lastmod>${day}</lastmod></url>\n</urlset>\n`,
  );
}

/** Builds the page into `outDir` for `env` (MERGELINE_BRAND and the four addresses). */
export async function buildSite({ env = process.env, outDir = OUT, card = true } = {}) {
  const { build } = await import('vite');
  const saved = { brand: process.env.MERGELINE_BRAND, out: process.env.MERGELINE_SITE_OUT };
  process.env.MERGELINE_BRAND = env.MERGELINE_BRAND ?? '';
  process.env.MERGELINE_SITE_OUT = outDir;
  try {
    await build({ configFile: path.join(ROOT, 'site', 'landing', 'vite.config.ts'), logLevel: 'warn', mode: 'production' });
  } finally {
    if (saved.brand === undefined) delete process.env.MERGELINE_BRAND;
    else process.env.MERGELINE_BRAND = saved.brand;
    if (saved.out === undefined) delete process.env.MERGELINE_SITE_OUT;
    else process.env.MERGELINE_SITE_OUT = saved.out;
  }
  const file = path.join(outDir, 'index.html');
  writeFileSync(file, buildPage(readFileSync(file, 'utf8'), env));
  writeCrawlerFiles(outDir, env);
  const og = card ? await shareCard(outDir) : 'og.png skipped';
  return { outDir, og };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { outDir, og } = await buildSite();
  console.log(`site: ${path.relative(ROOT, outDir)}/index.html (${og})`);
  for (const name of ['MERGELINE_SITE_URL', 'MERGELINE_WAITLIST_URL', 'MERGELINE_DEMO_URL', 'MERGELINE_REPO_URL', 'MERGELINE_NPM_PUBLISHED']) if (!process.env[name]) console.log(`  ${name} is not set (see docs/landing.md)`);
}
