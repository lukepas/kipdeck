// A throwaway git repository for the rundown's collector and skill tests: two folders of code, tests, a
// TODO, a branch ahead of main, a worktree, an untracked file, and the traps a collector must not fall
// into: a .env it must never open, a symlink out of the repository it must not follow, and a
// core.fsmonitor program it must never run (it would leave a marker file).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export interface RundownFixture {
  tmp: string;
  repo: string;
  worktree: string;
  /** Where the fsmonitor trap writes if it ever runs. */
  marker: string;
  /** What only the .env and the file outside the repo say: never in any output. */
  secret: string;
}

export function makeRundownFixture(): RundownFixture {
  const tmp = mkdtempSync(path.join(tmpdir(), 'rundown-fx-'));
  const repo = path.join(tmp, 'repo');
  const outside = path.join(tmp, 'outside');
  mkdirSync(repo);
  mkdirSync(outside);
  const secret = 'S3CRET-' + Math.random().toString(36).slice(2, 10);
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=Fixture Dev', ...args], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  git('init', '-q', '-b', 'main');
  const write = (rel: string, text: string) => {
    mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
    writeFileSync(path.join(repo, rel), text);
  };
  write('package.json', JSON.stringify({ name: 'fixture-app', version: '1.2.3', scripts: { test: 'node --test' }, devDependencies: { vitest: '1' } }, null, 2));
  write('README.md', '# Fixture\n\nA small app the rundown tests map, with a server, a client and their tests.\n');
  write('src/server/api.ts', Array.from({ length: 120 }, (_, i) => `export const a${i} = ${i};`).join('\n') + '\n// TODO tidy the api\n');
  write('src/client/view.ts', Array.from({ length: 40 }, (_, i) => `export const v${i} = ${i};`).join('\n') + '\n// FIXME flicker\n');
  write('tests/api.test.ts', "import test from 'node:test';\ntest('a', () => {});\ntest('b', () => {});\n");
  write('docs/guide.md', '# Guide\n');
  git('add', '.');
  git('commit', '-q', '-m', 'Start the app');
  git('checkout', '-q', '-b', 'feature/x');
  write('src/server/extra.ts', 'export const extra = 1;\n');
  git('add', '.');
  git('commit', '-q', '-m', 'Add extra');
  git('checkout', '-q', 'main');
  const worktree = path.join(tmp, 'wt');
  git('worktree', 'add', '-q', worktree, 'feature/x');
  // The traps.
  write('.env', `API_KEY=${secret}\n// TODO ${secret}\n`);
  writeFileSync(path.join(outside, 'far.ts'), `// TODO ${secret}\n`.repeat(50));
  symlinkSync(path.join(outside, 'far.ts'), path.join(repo, 'src', 'linked.ts'));
  const marker = path.join(tmp, 'fsmonitor-ran');
  const hook = path.join(tmp, 'fsmonitor.sh');
  writeFileSync(hook, `#!/bin/sh\ntouch '${marker}'\n`);
  chmodSync(hook, 0o755);
  git('config', 'core.fsmonitor', hook);
  // Uncommitted work.
  write('src/client/new.ts', 'export const fresh = true;\n');
  return { tmp, repo, worktree, marker, secret };
}
