// Runs the test files in two groups. `npm test` runs both, one after the other.
//
//   node tests/support/run.mjs main   every test file but the ones in SERIAL, in parallel (npm run test:main)
//   node tests/support/run.mjs perf   the files in SERIAL, one at a time (npm run test:perf)
//
// The files in SERIAL time something against a budget (long tasks while scrolling with the CPU slowed
// 4x) or drive the 3D office in a headless browser, which needs the CPU to itself to keep to its
// timeouts. Under the parallel run they compete with every other file for the CPU and fail now and
// then; alone, one at a time, they hold. So they run after the rest, never beside it, and the budgets
// stay as they are. A new file that measures time on the page goes on this list.
//
// Anything after the group is passed on to node's test runner (e.g. --test-name-pattern=...).
// tests/test-groups.test.ts checks the list and the split.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SERIAL = [
  'tests/landing-a11y.test.ts',
  'tests/landing-kip.test.ts',
  'tests/dialog-e2e.test.ts',
  'tests/mission-e2e.test.ts',
  'tests/surface-e2e.test.ts',
  'tests/replay-deck-e2e.test.ts',
];

const root = path.join(import.meta.dirname, '..', '..');

/** Every test file, as `tests/<name>.test.ts`, sorted. */
export function allTestFiles() {
  return readdirSync(path.join(root, 'tests'))
    .filter((f) => f.endsWith('.test.ts'))
    .map((f) => `tests/${f}`)
    .sort();
}

/** The files and runner flags of a group, or an error message. */
export function group(name, all = allTestFiles()) {
  const missing = SERIAL.filter((f) => !all.includes(f));
  if (missing.length) return { error: `tests/support/run.mjs lists files that aren't there: ${missing.join(', ')}` };
  if (name === 'main') return { files: all.filter((f) => !SERIAL.includes(f)), flags: [] };
  if (name === 'perf') return { files: [...SERIAL], flags: ['--test-concurrency=1'] };
  return { error: 'usage: node tests/support/run.mjs main|perf [node test runner flags]' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [name, ...rest] = process.argv.slice(2);
  const g = group(name);
  if (g.error) {
    console.error(g.error);
    process.exit(2);
  }
  const run = spawnSync(process.execPath, ['--import', 'tsx', '--import=#tests/css', '--test', ...g.flags, ...rest, ...g.files], {
    cwd: root,
    stdio: 'inherit',
  });
  process.exit(run.status ?? 1);
}
