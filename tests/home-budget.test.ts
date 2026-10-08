// The home page at / is the product, and it has to open fast on any laptop or phone: what it loads
// before it can draw (its scripts, the chunks they import and its stylesheets) stays at or under what
// the 2D view at /lite loaded when it became the home (stage 0, 812,503 bytes), and none of it is
// three.js. The 3D bridge is a bundle of its own at /bridge. Skipped (not failed) when the bundle is
// missing or older than its sources.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleWhy } from './support/bundle.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'dist', 'public');
const stale = bundleWhy(path.join(BUNDLE, 'index.html'), [path.join(ROOT, 'src', 'client'), path.join(ROOT, 'src', 'shared')]);

/** What /lite loaded up front at stage 0 (commit 47fd05b5): the home page's first ceiling. */
const LITE_BUDGET_BYTES = 812_503;
/**
 * The inbox's own ceiling since stage 2, when the terminal (xterm), the Changes window and the other
 * windows moved behind home/lazy.ts: it loaded about 175 kB, so 250 kB leaves room to grow without
 * anything big sliding back in up front.
 */
const HOME_BUDGET_BYTES = 250_000;

/** The files a page loads before it draws: its module script, the chunks it preloads, its stylesheets. */
function eager(page: string): string[] {
  const html = readFileSync(path.join(BUNDLE, page), 'utf8');
  return [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+)"/g)].map((m) => path.join(BUNDLE, m[1]));
}

test('the home page loads no more than the 2D view did, and no three.js', { skip: stale || undefined }, () => {
  const files = eager('index.html');
  assert.ok(files.length >= 2, 'the home page loads a script and a stylesheet');
  const bytes = files.reduce((n, f) => n + statSync(f).size, 0);
  assert.ok(bytes <= LITE_BUDGET_BYTES, `the home page loads ${bytes} bytes up front, over the ${LITE_BUDGET_BYTES} budget`);
  assert.ok(bytes <= HOME_BUDGET_BYTES, `the home page loads ${bytes} bytes up front, over the inbox's ${HOME_BUDGET_BYTES} budget: load big windows through home/lazy.ts`);
  for (const f of files.filter((f) => f.endsWith('.js'))) {
    // three.js's renderer, by a name it always carries.
    assert.doesNotMatch(readFileSync(f, 'utf8'), /WebGLRenderer|THREE\.REVISION|WebGLRenderTarget/, `${path.basename(f)} is part of three.js`);
  }
});

test('the 3D bridge is its own page, and the home page shares none of its entry', { skip: stale || undefined }, () => {
  assert.ok(existsSync(path.join(BUNDLE, 'bridge.html')), 'bridge.html is built');
  const bridge = eager('bridge.html');
  const entry = bridge.find((f) => /\/bridge-[^/]+\.js$/.test(f));
  assert.ok(entry, 'the bridge has an entry chunk of its own');
  assert.ok(!eager('index.html').includes(entry), 'the home page does not load the bridge');
  assert.match(readFileSync(entry, 'utf8') + bridge.filter((f) => f.endsWith('.js')).map((f) => readFileSync(f, 'utf8')).join(''), /WebGLRenderer/, 'the bridge carries three.js');
});
