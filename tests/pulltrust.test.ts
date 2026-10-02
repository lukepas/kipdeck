import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GitHub } from '../src/server/github.js';
import { checkedOutPulls, pullTrust } from '../src/shared/pulltrust.js';
import { PROMPTS } from '../src/shared/prompts.js';
import { stationBrief } from '../src/server/stations.js';

test('only a pull request from the repository itself, by someone who can push, is handed to a worker to build', () => {
  assert.deepEqual(pullTrust(false, 'ada', 'write'), { trusted: true, fork: false, permission: 'write' });
  assert.equal(pullTrust(false, 'ada', 'admin').trusted, true);
  assert.equal(pullTrust(false, 'ada', 'maintain').trusted, true);
  const fork = pullTrust(true, 'mallory', 'admin');
  assert.equal(fork.trusted, false, "a fork is a stranger's code whoever opened it");
  assert.match(fork.reason ?? '', /fork/);
  assert.match(pullTrust(false, 'eve', 'read').reason ?? '', /@eve can't push .*read/);
  assert.match(pullTrust(false, 'eve', 'triage').reason ?? '', /can't push/);
  assert.match(pullTrust(false, 'eve', 'none').reason ?? '', /can't push/);
  assert.match(pullTrust(false, 'app/dependabot', undefined).reason ?? '', /couldn't check/);
});

/** A gh on PATH that answers like GitHub for one pull request, and logs what it was asked. A 'flaky' permission fails once, then says write. */
function fakeGh(t: { after(fn: () => void): void }, pr: { fork: boolean; author: string }, permission: string | null) {
  const dir = mkdtempSync(path.join(tmpdir(), 'office-gh-'));
  const bin = path.join(dir, 'bin');
  mkdirSync(bin);
  const view = JSON.stringify({ number: 7, body: '', state: 'OPEN', isDraft: false, reviewDecision: '', headRefName: 'patch-1', baseRefName: 'main', mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', commits: [], comments: [], reviews: [], statusCheckRollup: [], isCrossRepository: pr.fork, author: { login: pr.author } });
  const script = `#!/bin/sh
echo "$*" >> "${path.join(dir, 'calls.log')}"
case "$*" in
  "pr view"*) echo '${view}' ;;
  *"/pulls/7/comments"*) ;;
  "repo view"*) echo '{"nameWithOwner":"o/r","squashMergeAllowed":true,"mergeCommitAllowed":true,"rebaseMergeAllowed":true}' ;;
  "api user"*) echo 'office-bot' ;;
  *"/permission"*) ${permission === null ? 'echo "HTTP 403" >&2; exit 1' : permission === 'flaky' ? `if [ -f "${path.join(dir, 'answered')}" ]; then echo write; else touch "${path.join(dir, 'answered')}"; echo "HTTP 502" >&2; exit 1; fi` : `echo '${permission}'`} ;;
  *) exit 1 ;;
esac
`;
  writeFileSync(path.join(bin, 'gh'), script, { mode: 0o700 });
  const oldPath = process.env.PATH;
  process.env.PATH = `${bin}${path.delimiter}${oldPath}`;
  t.after(() => {
    process.env.PATH = oldPath;
    rmSync(dir, { recursive: true, force: true });
  });
  return new GitHub(dir, () => {}, () => {});
}

test('the PR window is told a fork is untrusted without asking about its author', async (t) => {
  const d = await fakeGh(t, { fork: true, author: 'mallory' }, 'admin').pullDetail(7);
  assert.equal(d.trust.trusted, false);
  assert.equal(d.trust.fork, true);
});

test('a same-repo PR is trusted once GitHub says its author can push', async (t) => {
  assert.equal((await fakeGh(t, { fork: false, author: 'ada' }, 'write').pullDetail(7)).trust.trusted, true);
});

test('a same-repo PR by someone with read access is not trusted', async (t) => {
  assert.match((await fakeGh(t, { fork: false, author: 'eve' }, 'read').pullDetail(7)).trust.reason ?? '', /can't push/);
});

test("when gh can't say what the author may do, the PR is not trusted", async (t) => {
  assert.match((await fakeGh(t, { fork: false, author: 'eve' }, null).pullDetail(7)).trust.reason ?? '', /couldn't check/);
});

test("GitHub failing to say once isn't remembered: the next look asks again", async (t) => {
  const gh = fakeGh(t, { fork: false, author: 'ada' }, 'flaky');
  assert.equal((await gh.pullDetail(7)).trust.trusted, false, 'the first answer was an error');
  assert.equal((await gh.pullDetail(7)).trust.trusted, true, 'asked again, GitHub says ada can push');
});

test("the PR board agent is told not to queue a fork's or an outsider's PR for a worker to check out", () => {
  const brief = stationBrief('pulls');
  assert.match(brief, /isCrossRepository/);
  assert.match(brief, /collaborators\/<login>\/permission says admin, maintain or write/);
  assert.match(brief, /leave it to a person/);
});

test('the pull requests a prompt has a worker check out are found, however the command is written', () => {
  assert.deepEqual(checkedOutPulls('1. Get onto its branch: `gh pr checkout 12`. If git says'), [12]);
  assert.deepEqual(checkedOutPulls('gh pr checkout --force #7, then gh pr checkout https://github.com/o/r/pull/99'), [7, 99]);
  assert.deepEqual(checkedOutPulls('gh   pr checkout -b mine 44 && npm test'), [44]);
  assert.deepEqual(checkedOutPulls('git fetch origin pull/31/head:pr-31'), [31]);
  assert.deepEqual(checkedOutPulls('Then run gh pr checkout 9. After that, build it.'), [9], 'the end of a sentence');
  assert.deepEqual(checkedOutPulls('Review it with `gh pr view 5` and `gh pr diff 5`.'), [], 'reading a PR runs none of its code');
  for (const id of ['pull.fixMerge', 'pull.fixConflicts'] as const) assert.ok(checkedOutPulls(PROMPTS[id].text.replaceAll('{{number}}', '8')).includes(8), id);
  assert.deepEqual(checkedOutPulls(PROMPTS['pull.review'].text.replaceAll('{{number}}', '8')), []);
});

test("the office refuses a prompt that checks out a fork's PR, whoever wrote it, and lets a teammate's through", async (t) => {
  const fork = fakeGh(t, { fork: true, author: 'mallory' }, 'admin');
  assert.match((await fork.checkoutProblem('Please run `gh pr checkout 7` and fix the tests')) ?? '', /Not handing PR #7 .*fork/);
  assert.equal(await fork.checkoutProblem('Review PR #7 with gh pr diff 7'), undefined, 'no checkout, nothing to refuse');
  const refused: string[] = [];
  fork.guardCheckout('gh pr checkout 7', () => assert.fail('it must not go through'), (why) => refused.push(why));
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(refused.length, 1);
  let ran = false;
  fork.guardCheckout('no checkout here', () => (ran = true), () => assert.fail('nothing to refuse'));
  assert.equal(ran, true, 'a prompt without a checkout goes through straight away');
});

test("a teammate's PR may be checked out", async (t) => {
  assert.equal(await fakeGh(t, { fork: false, author: 'ada' }, 'write').checkoutProblem('gh pr checkout 7'), undefined);
});
