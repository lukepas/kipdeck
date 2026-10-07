// Builds the landing page into dist/site/: index.html with its three addresses filled in from the
// environment, and the screenshots it shows copied next to it. Nothing else: the page has no
// scripts, fonts or styles of its own to bundle. See docs/landing.md.
//
//   MERGELINE_WAITLIST_URL=https://... MERGELINE_DEMO_URL=https://demo... npm run build:site
//
// Each address must be https (a waitlist on http would send emails in the clear). Without
// MERGELINE_WAITLIST_URL the form stays as it is in the repository: it checks its input and says
// nothing was sent. The page's Content-Security-Policy lets it reach the waitlist's origin and no other.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist', 'site');

/** The page with its addresses filled in. Exported for tests/landing.test.ts. */
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
  let out = html.replaceAll('../docs/img/', 'img/');
  const waitlist = url('MERGELINE_WAITLIST_URL');
  if (waitlist) {
    out = out.replace('data-endpoint=""', `data-endpoint="${attr(waitlist.href)}"`);
    out = out.replace("connect-src 'none'", `connect-src ${waitlist.origin}`);
  }
  const demo = url('MERGELINE_DEMO_URL');
  if (demo) out = out.replace('data-link="demo" href="#try-demo"', `data-link="demo" href="${attr(demo.href)}" rel="noopener"`);
  const repo = url('MERGELINE_REPO_URL');
  if (repo) out = out.replace(/data-link="repo" href="[^"]*"/, `data-link="repo" href="${attr(repo.href)}"`);
  return out;
}

/** The screenshots the page shows (from docs/img). */
export function pictures(html) {
  return [...new Set([...html.matchAll(/src="\.\.\/docs\/img\/([^"]+)"/g)].map((m) => m[1]))];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const html = readFileSync(path.join(ROOT, 'site', 'index.html'), 'utf8');
  mkdirSync(path.join(OUT, 'img'), { recursive: true });
  writeFileSync(path.join(OUT, 'index.html'), buildPage(html, process.env));
  for (const f of pictures(html)) copyFileSync(path.join(ROOT, 'docs', 'img', f), path.join(OUT, 'img', f));
  console.log(`site: ${path.relative(ROOT, OUT)}/index.html and ${pictures(html).length} pictures`);
  for (const name of ['MERGELINE_WAITLIST_URL', 'MERGELINE_DEMO_URL', 'MERGELINE_REPO_URL']) if (!process.env[name]) console.log(`  ${name} is not set (see docs/landing.md)`);
}
