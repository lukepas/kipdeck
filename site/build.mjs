// Builds the landing page (site/landing/, Vite) into dist/site/, fills in its deploy addresses from
// the environment, and renders its share card (og.png) from the brand. See docs/landing.md.
//
//   KIPDECK_SITE_URL=https://kipdeck.com/ KIPDECK_WAITLIST_URL=https://... npm run build:site
//   KIPDECK_BRAND=<id> npm run build:site           # another entry in site/landing/brand.ts
//
// The brand's repository (github.com/zbagdzevicius/kipdeck) is public, so a build with no settings
// links it: the clone command, section 06's terminal, the Source and Docs links and the structured
// data's codeRepository. For a brand whose repository is private, build with KIPDECK_REPO_PUBLIC=0:
// the page then shows nothing a visitor could not follow.
//
// Each address must be https (a waitlist on http would send emails in the clear). Without
// KIPDECK_WAITLIST_URL the Team waitlist form is not shown at all (the design-partner link, an
// email to the brand's contact address, is the ask). On Vercel, KIPDECK_SITE_URL falls back to the
// project's production address (VERCEL_PROJECT_PRODUCTION_URL), so the share card is absolute there. The page's Content-Security-Policy lets it reach the waitlist's
// origin and no other.
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { siteEnv } from './env.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = path.join(ROOT, 'dist', 'site');
/** The repository a built page points at: the brand's (site/landing/brand.ts), on the html element. */
export function repoOf(html) {
  return (/<html\b[^>]*\bdata-repo="([^"]+)"/.exec(html) ?? [])[1] ?? '';
}

/** The build's settings, with KIPDECK_SITE_URL taken from Vercel's production address
 *  (VERCEL_PROJECT_PRODUCTION_URL, a bare host name) when it is not set itself. */
export function withSiteUrl(env) {
  if (siteEnv(env, 'SITE_URL') || !env.VERCEL_PROJECT_PRODUCTION_URL) return env;
  return { ...env, KIPDECK_SITE_URL: `https://${env.VERCEL_PROJECT_PRODUCTION_URL.replace(/^https?:\/\//, '').replace(/\/$/, '')}/` };
}

/** The built page with its addresses filled in. Exported for tests/landing.test.ts. */
export function buildPage(html, given) {
  const env = withSiteUrl(given);
  const url = (name) => {
    const v = (siteEnv(env, name) ?? '').trim();
    if (!v) return '';
    let u;
    try {
      u = new URL(v);
    } catch {
      throw new Error(`KIPDECK_${name} is not a URL: ${v}`);
    }
    if (u.protocol !== 'https:') throw new Error(`KIPDECK_${name} must be https: ${v}`);
    return u;
  };
  const attr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  let out = html;
  const waitlist = url('WAITLIST_URL');
  if (waitlist) {
    // The Team tier waitlist is shown only in a build that has somewhere to send it.
    out = out.replace('data-endpoint="" hidden', `data-endpoint="${attr(waitlist.href)}"`);
    out = out.replace("connect-src 'none'", `connect-src ${waitlist.origin}`);
  }
  const demo = url('DEMO_URL');
  // A hosted demo turns the hero's button from copying the command into opening the live inbox.
  if (demo) out = out.replace('data-link="demo" href="#try-demo">Copy the demo command<', `data-link="demo" href="${attr(demo.href)}" rel="noopener">Try the demo<`);
  // Where the page itself lives: the canonical link, og:url, and absolute addresses for the share
  // card (most link previews ignore a relative og:image). Without it there is no canonical link,
  // since a relative one would be wrong wherever the page is copied.
  const site = url('SITE_URL');
  if (site) {
    const href = attr(site.href.endsWith('/') ? site.href : `${site.href}/`);
    out = out.replace('<meta name="robots"', `<link rel="canonical" href="${href}">\n<meta property="og:url" content="${href}">\n<meta name="robots"`);
    out = out.replaceAll('content="og.png"', `content="${href}og.png"`);
    out = out.replace('"image":"og.png"', `"image":"${href}og.png","url":"${href}"`);
  }
  // Every link and command that names the brand's repository moves to KIPDECK_REPO_URL.
  const repo = url('REPO_URL');
  const current = repoOf(out);
  if (repo && current) {
    const next = repo.href.replace(/\/$/, '').replace(/\.git$/, '');
    // The clone lands in a folder named after the new repository, so the command's folder and cd follow it.
    const slug = (u) => u.split('/').pop();
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const clone = new RegExp(`git clone ${esc(current)}(?: [\\w.-]+)? &amp;&amp; cd [\\w.-]+ &amp;&amp;`, 'g');
    out = out.replace(clone, `git clone ${attr(next)} &amp;&amp; cd ${attr(slug(next))} &amp;&amp;`);
    out = out.replaceAll(current, attr(next));
  }
  // Until `npx` works from the registry, the page shows the from-source command and says so (never a
  // command that 404s). Published, the npx command takes its place.
  if (siteEnv(env, 'NPM_PUBLISHED') === '1') {
    out = out.replace(/\s*<(div|p|pre|span|code)\b[^>]*\bdata-unpublished\b[^>]*>[\s\S]*?<\/\1>/g, '');
    out = out.replaceAll('data-published hidden', 'data-published');
    out = out.replace(/data-copy="[^"]*" data-copy-published="([^"]*)"/g, 'data-copy="$1"');
  }
  return withoutPrivateRepo(out, { open: Boolean(repo) || siteEnv(env, 'REPO_PUBLIC') !== '0', npm: siteEnv(env, 'NPM_PUBLISHED') === '1', demo: Boolean(demo) });
}

/** When the brand's repository is private (KIPDECK_REPO_PUBLIC=0 and no KIPDECK_REPO_URL), a
 *  visitor can neither clone it nor read its docs, so the page offers nothing that points there: the
 *  Source and Docs links and the structured data's repository go, and unless npx works the hero's
 *  command and section 06's terminal (the blocks between runnable markers) go too. Then the film is
 *  the hero's first button and the design-partner email its second. */
function withoutPrivateRepo(html, { open, npm, demo }) {
  if (open) return html;
  let out = html.replace(/\s*<a [^>]*data-link="repo(?:-docs)?"[^>]*>[^<]*<\/a>/g, '');
  out = out.replace(/,"codeRepository":"[^"]*"/, '');
  if (npm) return out;
  out = out.replace(/\s*<!-- runnable -->[\s\S]*?<!-- \/runnable -->/g, '');
  if (demo) return out;
  const partner = (/<a class="btn primary apply-link" data-link="partner" href="([^"]+)"/.exec(out) ?? [])[1];
  return out.replace(/<div class="cta">[\s\S]*?<\/div>/, (cta) => {
    let next = cta.replace(/\s*<a [^>]*data-link="demo"[^>]*>[^<]*<\/a>/, '').replace('class="btn ghost" type="button" data-watch', 'class="btn primary magnetic" type="button" data-watch');
    if (partner) next = next.replace(/<\/div>$/, `  <a class="btn ghost" data-link="partner-hero" href="${partner}">Become a design partner</a>\n      </div>`);
    return next;
  });
}

/** The share card, 1200 by 630, drawn from the brand with the page's own fonts. */
export function cardHtml({ name, lead, muted, archivo, mono }) {
  const font = (f) => `data:font/woff2;base64,${readFileSync(f).toString('base64')}`;
  return `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:A;src:url(${font(archivo)});font-weight:100 900;font-stretch:62% 125%}
@font-face{font-family:M;src:url(${font(mono)});font-weight:100 800}
*{margin:0;box-sizing:border-box}html,body{width:1200px;height:630px;background:#0d131a;color:#e8ecef;font-family:A}
body{padding:64px 72px;background-image:radial-gradient(rgba(138,151,165,.25) 1px,transparent 1.2px),radial-gradient(600px 500px at 90% 80%,rgba(255,106,26,.12),transparent);background-size:28px 28px,auto;position:relative;overflow:hidden}
.top{display:flex;align-items:center;gap:14px;font-stretch:118%;font-weight:600;letter-spacing:.06em;font-size:24px}.top .w span{color:#8a97a5}.top .signal{fill:#ff6a1a}
h1{margin-top:70px;font-stretch:118%;font-weight:750;font-size:104px;line-height:.92;letter-spacing:-.025em}h1 b{color:#ff6a1a;font-weight:750;font-stretch:125%}
p{margin-top:34px;font-size:28px;color:#8a97a5;max-width:900px}
.row{position:absolute;right:72px;top:64px;display:flex;align-items:center;gap:12px;padding:12px 16px;border:1px solid #3a4756;border-left:3px solid #ff6a1a;border-radius:4px;background:#141b23;font-family:M;font-size:20px;color:#ff6a1a}
.row i{width:14px;height:14px;background:#ff6a1a;transform:rotate(45deg)}
.bar{position:absolute;left:0;top:0;height:6px;width:38%;background:#ff6a1a}
</style><div class="bar"></div><div class="top"><svg data-logo="mark" width="44" height="44" viewBox="0 0 32 32" fill="#e8ecef"><path d="M4.7 21.6A11.3 9.4 0 1 1 27.3 21.6A11.3 9.4 0 1 1 4.7 21.6ZM10.5 16.9C5.3 12.3 3.4 5.4 4.7 1C8.5 3.6 11.5 10.1 10.5 16.9ZM21.5 16.9C20.5 10.1 23.5 3.6 27.3 1C28.6 5.4 26.7 12.3 21.5 16.9ZM8.4 21.1A3 3 0 1 0 14.4 21.1A3 3 0 1 0 8.4 21.1ZM11.5 20.1A0.8 0.8 0 1 1 13.1 20.1A0.8 0.8 0 1 1 11.5 20.1ZM17.6 21.1A3 3 0 1 0 23.6 21.1A3 3 0 1 0 17.6 21.1ZM20.7 20.1A0.8 0.8 0 1 1 22.3 20.1A0.8 0.8 0 1 1 20.7 20.1ZM15.4 14.1C13.8 11.5 14.8 8.1 16.9 6.6A0.5 0.5 0 0 1 17.5 7.4C15.5 9 15 10.8 16.6 13.4Z"/><path class="signal" d="M15.6 6A2.1 2.1 0 1 1 19.8 6A2.1 2.1 0 1 1 15.6 6Z"/></svg><span class="w">${lead}<span>${muted}</span></span></div>
<div class="row"><i></i>waiting 23:04</div>
<h1>Your agents are<br><b>waiting</b> on you.</h1><p>${name}: every coding agent you run, in one place. See who waits on you, then answer, review and merge.</p>`;
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
    return 'playwright-core is not installed: og.png not drawn, public/og.png ships instead';
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
  if (!browser) return 'no headless Chromium here: og.png not drawn, public/og.png ships instead';
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
  const v = (siteEnv(withSiteUrl(env), 'SITE_URL') ?? '').trim();
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

/** Builds the page into `outDir` for `env` (KIPDECK_BRAND and the four addresses). */
export async function buildSite({ env = process.env, outDir = OUT, card = true } = {}) {
  const { build } = await import('vite');
  const saved = { brand: process.env.KIPDECK_BRAND, out: process.env.KIPDECK_SITE_OUT };
  process.env.KIPDECK_BRAND = siteEnv(env, 'BRAND') ?? '';
  process.env.KIPDECK_SITE_OUT = outDir;
  try {
    await build({ configFile: path.join(ROOT, 'site', 'landing', 'vite.config.ts'), logLevel: 'warn', mode: 'production' });
  } finally {
    if (saved.brand === undefined) delete process.env.KIPDECK_BRAND;
    else process.env.KIPDECK_BRAND = saved.brand;
    if (saved.out === undefined) delete process.env.KIPDECK_SITE_OUT;
    else process.env.KIPDECK_SITE_OUT = saved.out;
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
  for (const name of ['SITE_URL', 'WAITLIST_URL', 'DEMO_URL', 'NPM_PUBLISHED']) if (!siteEnv(withSiteUrl(process.env), name)) console.log(`  KIPDECK_${name} is not set (see docs/landing.md)`);
}
