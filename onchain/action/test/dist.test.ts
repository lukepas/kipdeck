// GitHub runs dist/, not src/, so the committed bundle must be exactly what the sources build to.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');

test('dist/ is the build of the current sources (run npm run build and commit it if not)', (t) => {
  const out = mkdtempSync(path.join(os.tmpdir(), 'bounty-action-dist-'));
  t.after(() => rmSync(out, { recursive: true, force: true }));
  execFileSync(process.execPath, [path.join(root, 'scripts/build.mjs'), '--out', out], { cwd: root, stdio: 'pipe', timeout: 60_000 });
  for (const file of ['index.mjs', 'ao-bounty.mjs']) {
    const fresh = readFileSync(path.join(out, file), 'utf8');
    const committed = readFileSync(path.join(root, 'dist', file), 'utf8');
    assert.ok(fresh === committed, `dist/${file} is out of date: run npm run build in onchain/action`);
  }
});

test('action.yml runs the bundle on a current Node', () => {
  const yml = readFileSync(path.join(root, 'action.yml'), 'utf8');
  assert.match(yml, /^runs:\n {2}using: node24\n {2}main: dist\/index\.mjs$/m);
  for (const input of ['attester-key', 'approver-key', 'approver-nonce-account', 'approver', 'base-attester-key', 'merged-by-secret', 'mode', 'pr-number']) assert.match(yml, new RegExp(`^  ${input}:$`, 'm'));
});

test('the example workflows pass only inputs action.yml declares, and secrets only through secrets.*', () => {
  const yml = readFileSync(path.join(root, 'action.yml'), 'utf8');
  const declared = new Set([...yml.matchAll(/^ {2}([\w-]+):$/gm)].map((m) => m[1]));
  for (const file of ['bounty.yml', 'bounty-gated.yml']) {
    const text = readFileSync(path.join(root, 'examples', file), 'utf8');
    const used = [...text.matchAll(/^ {10}([\w-]+): (.*)$/gm)];
    assert.ok(used.length > 3, `${file} passes inputs`);
    for (const [, name, value] of used) {
      assert.ok(declared.has(name), `${file} passes ${name}, which action.yml doesn't declare`);
      if (/key|secret/.test(name)) assert.match(value, /^\$\{\{ secrets\.[A-Z_]+ \}\}$/, `${file}: ${name} must come from an encrypted secret`);
    }
    assert.match(text, /types: \[closed\]/);
    assert.doesNotMatch(text, /pull_request_target/);
  }
});
