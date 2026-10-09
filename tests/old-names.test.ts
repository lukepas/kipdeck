// One name on every page: builds the app's pages (home, bridge, sign-in, join, claim), the /pom/
// showcase and the landing page into temporary folders, strips the HTML tags (so a wordmark split
// as MERGE<span>LINE</span> still reads MERGELINE), and fails on an earlier product name.
//
// Outside these guards the old names appear only in the naming history (business/naming.md,
// design/README.md) and in links to the demo repository, which still has its old name on GitHub.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'vite';
// @ts-expect-error a plain .mjs script with no types
import { buildSite } from '../site/build.mjs';

const root = path.join(import.meta.dirname, '..');
const OLD = /mergeline|ugc ?-?army/i;

const out = mkdtempSync(path.join(tmpdir(), 'old-names-'));
test.after(() => rmSync(out, { recursive: true, force: true }));

const app = path.join(out, 'app');
const showcase = path.join(out, 'showcase');
const site = path.join(out, 'site');
await build({ configFile: path.join(root, 'vite.config.ts'), logLevel: 'silent', build: { outDir: app, emptyOutDir: true } });
await build({ configFile: path.join(root, 'vite.showcase.config.ts'), logLevel: 'silent', build: { outDir: showcase, emptyOutDir: true } });
await buildSite({ env: {}, outDir: site, card: false });

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** What a person reads on a page: no scripts, styles or comments, no tags, the common entities decoded. */
function pageText(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

test('stripping the tags joins a split wordmark, so MERGE<span>LINE</span> cannot slip past', () => {
  assert.match(pageText('<span class="wordmark">MERGE<span>LINE</span></span>'), OLD);
  assert.equal(pageText('<b>KIP</b><span>DECK</span>'), 'KIPDECK');
  assert.doesNotMatch(pageText('<script>const a = "mergeline";</script><p>Kipdeck</p>'), OLD);
});

for (const [label, dir] of [['the app', app], ['the showcase', showcase], ['the landing page', site]] as const) {
  test(`${label}: every page reads Kipdeck, never an earlier name`, () => {
    const pages = walk(dir).filter((f) => f.endsWith('.html'));
    assert.ok(pages.length > 0, `${label} built its pages`);
    for (const page of pages) {
      const html = readFileSync(page, 'utf8');
      const text = pageText(html);
      const name = path.relative(out, page);
      assert.doesNotMatch(text, OLD, `${name} says an old name: ${OLD.exec(text)?.[0]}`);
      // The attributes a person or a screen reader meets (the title, alt and aria-label text) too.
      for (const m of html.matchAll(/(?:title|alt|aria-label|content)="([^"]*)"/g)) assert.doesNotMatch(m[1], OLD, `${name}: ${m[0]}`);
      if (/<span class="(?:wordmark|word|brand-word|loading-name)/.test(html)) assert.match(text, /KIPDECK/, `${name} draws the KIPDECK wordmark`);
    }
  });

  test(`${label}: no script or style carries an old name`, () => {
    for (const f of walk(dir).filter((p) => /\.(js|css)$/.test(p))) {
      const code = readFileSync(f, 'utf8');
      assert.doesNotMatch(code, OLD, `${path.relative(out, f)}: ${OLD.exec(code)?.[0]}`);
    }
  });
}

test("the app's sign-in, join and claim pages draw the same KIP DECK lockup as ui/brand.ts", () => {
  for (const f of ['login.html', 'join.html', 'claim.html']) {
    const html = readFileSync(path.join(app, f), 'utf8');
    assert.match(html, /<span class="wordmark" aria-hidden="true">KIP<span>DECK<\/span><\/span>/, f);
    assert.match(html, /<title>Kipdeck - /, f);
  }
  assert.match(readFileSync(path.join(root, 'src/client/ui/brand.ts'), 'utf8'), /<b>KIP<\/b><span>DECK<\/span>/);
});
