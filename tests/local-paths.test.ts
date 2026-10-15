// No committed file may carry the home folder of the computer it was made on. Screenshot reports and
// recordings used to write absolute paths, and those name the person, their machine and whatever
// folders they keep their work in. Write paths relative to the repository instead.
//
// The check reads the home folder of whoever runs it, so it catches every developer's own paths
// without naming anyone here. Only files git tracks are read (binary files are skipped).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');

test('no tracked file holds the home folder of the computer it was made on', (t) => {
  const home = homedir();
  // A home folder that short ("/" or "/root") would match too much to mean anything.
  if (home.split('/').filter(Boolean).length < 2) return t.skip(`home folder ${home} is too short to check`);
  let hits = '';
  try {
    hits = execFileSync('git', ['grep', '-l', '-I', '-F', '-e', `${home}/`], { cwd: root, encoding: 'utf8' }).trim();
  } catch (err) {
    // git grep exits 1 when nothing matches; anything else is a real error.
    if ((err as { status?: number }).status !== 1) throw err;
  }
  assert.equal(hits, '', `these files contain ${home}/, write repo-relative paths instead:\n${hits}`);
});

test('a committed report writes paths inside the repository relative to it', async () => {
  // @ts-expect-error: a plain .mjs script with no type declarations
  const { repoJson } = await import('../design/repo-json.mjs');
  const out = JSON.parse(repoJson('/w/repo', { shots: ['/w/repo/design/shots/a.png'], other: '/w/repository/b', url: 'http://x/' }));
  assert.deepEqual(out, { shots: ['design/shots/a.png'], other: '/w/repository/b', url: 'http://x/' });
});
