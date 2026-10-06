import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { bundleWhy, newestIn } from './support/bundle.js';

// The end-to-end tests load the built bundle, so one built before the last change to its sources (a
// merge, a checkout, an edit) would test old code: the mission e2e's debrief once timed out on a clock
// fix that was in src/ but not yet in dist/public. They skip such a bundle with a reason instead.

function tree(t: { after(fn: () => void): void }) {
  const root = mkdtempSync(path.join(tmpdir(), 'office-bundle-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const src = path.join(root, 'src', 'client', 'features', 'launch');
  const dist = path.join(root, 'dist');
  mkdirSync(src, { recursive: true });
  mkdirSync(dist, { recursive: true });
  const source = path.join(src, 'index.ts');
  const index = path.join(dist, 'index.html');
  writeFileSync(source, 'export {};\n');
  writeFileSync(index, '<!doctype html>\n');
  const at = (file: string, s: number) => utimesSync(file, s, s);
  return { root, source, index, at, sources: [path.join(root, 'src')] };
}

test('a bundle built after its sources last changed is used', (t) => {
  const { source, index, at, sources } = tree(t);
  at(source, 1_000);
  at(index, 2_000);
  assert.equal(bundleWhy(index, sources), '');
});

test('a bundle built before a change to a source deep in the tree is skipped, with what to run', (t) => {
  const { source, index, at, sources } = tree(t);
  at(index, 1_000);
  at(source, 2_000);
  assert.match(bundleWhy(index, sources), /older than its sources.*npm run build/);
});

test('no bundle at all is skipped, naming what is missing', (t) => {
  const { root, sources } = tree(t);
  assert.equal(bundleWhy(path.join(root, 'nope', 'index.html'), sources, 'showcase bundle'), 'no showcase bundle: run npm run build first');
});

test('the newest source is found in nested folders, and a missing folder counts for nothing', (t) => {
  const { root, source, at } = tree(t);
  at(source, 5_000);
  assert.equal(newestIn([path.join(root, 'src'), path.join(root, 'missing')]), 5_000_000);
  assert.equal(newestIn([path.join(root, 'missing')]), 0);
});
