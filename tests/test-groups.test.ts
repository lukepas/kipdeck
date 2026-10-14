// `npm test` is two runs (tests/support/run.mjs): every file in parallel but the timing-sensitive
// ones, then those one at a time. This keeps the split whole, so no file is run twice or dropped, and
// keeps the Release workflow running both groups with onchain/attest's packages installed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { SERIAL, allTestFiles, group } from './support/run.mjs';

const root = path.join(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
const workflow = readFileSync(path.join(root, '.github/workflows/release.yml'), 'utf8');

test('main and perf together run every test file exactly once', () => {
  const all: string[] = allTestFiles();
  const main = group('main').files as string[];
  const perf = group('perf').files as string[];
  assert.ok(all.includes('tests/test-groups.test.ts'));
  assert.deepEqual([...main, ...perf].sort(), all);
  assert.equal(new Set([...main, ...perf]).size, all.length);
  assert.deepEqual(perf, SERIAL);
});

test('perf runs its files one at a time; main keeps the runner default', () => {
  assert.deepEqual(group('perf').flags, ['--test-concurrency=1']);
  assert.deepEqual(group('main').flags, []);
});

test('a SERIAL file that is gone, or an unknown group, is an error, not an empty run', () => {
  const without = (allTestFiles() as string[]).filter((f) => f !== SERIAL[0]);
  assert.match(group('main', without).error, /lists files that aren't there: tests\/landing-a11y\.test\.ts/);
  assert.match(group('everything').error, /usage/);
});

test('npm test runs both groups, and so does the Release workflow, after installing onchain/attest', () => {
  assert.equal(pkg.scripts.test, 'npm run test:main && npm run test:perf');
  assert.equal(pkg.scripts['test:main'], 'node tests/support/run.mjs main');
  assert.equal(pkg.scripts['test:perf'], 'node tests/support/run.mjs perf');
  const at = (s: string) => workflow.indexOf(s);
  assert.ok(at('run: npm run test:main') > 0 && at('run: npm run test:perf') > at('run: npm run test:main'));
  assert.ok(!/run: npm test\b/.test(workflow), 'the workflow runs the two groups as separate steps');
  assert.ok(at('working-directory: onchain/attest') > 0 && at('working-directory: onchain/attest') < at('run: npm run test:main'));
  assert.match(workflow, /onchain\/attest\/package-lock\.json/);
});
