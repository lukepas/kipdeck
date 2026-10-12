// The review brief (src/shared/brief/, src/server/brief/): the risk flags a diff raises and the
// dependencies its manifests add, the verdict (one confident Merge only when verified with nothing
// flagged, else the gap in words), reading an agent's last message from its transcript, bundling line
// comments into Send back, the journal kept from hook events, and the brief the office builds from both.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { addedDependencies, isTestPath, riskFlags, sensitiveKind } from '../src/shared/brief/risk.js';
import { testState, verdict } from '../src/shared/brief/verdict.js';
import { askedAnswers, askedQuestions, lastAssistantText, lastQuestion } from '../src/shared/brief/transcript.js';
import { anchor, bundleComments } from '../src/shared/brief/comments.js';
import { BriefLog, transcriptSummary } from '../src/server/brief/log.js';
import { buildBrief, type BriefChanges } from '../src/server/brief/build.js';
import { handlers } from '../src/server/ws/handlers/index.js';
import { READ_ONLY_ALLOWS } from '../src/server/demo/readonly.js';
import type { ChangedFile, ReviewBrief } from '../src/shared/protocol.js';

const file = (p: string, status: ChangedFile['status'] = 'M', additions = 3, deletions = 1): ChangedFile => ({ path: p, status, additions, deletions, binary: false, uncommitted: false, sig: '' });

test('sensitive paths: CI, lockfiles, migrations, sign-in code, secrets and deploy config; ordinary files are not', () => {
  const cases: [string, string | undefined][] = [
    ['.github/workflows/ci.yml', 'ci'],
    ['.gitlab-ci.yml', 'ci'],
    ['package-lock.json', 'lockfile'],
    ['web/pnpm-lock.yaml', 'lockfile'],
    ['go.sum', 'lockfile'],
    ['db/migrations/0042_add_index.sql', 'migration'],
    ['prisma/schema.prisma', 'migration'],
    ['src/auth/session.ts', 'auth'],
    ['api/login.js', 'auth'],
    ['src/server/oauth.ts', 'auth'],
    ['.env.production', 'secrets'],
    ['certs/server.pem', 'secrets'],
    ['Dockerfile', 'infra'],
    ['infra/main.tf', 'infra'],
    ['src/client/styles/tokens.css', undefined],
    ['src/author.ts', undefined],
    ['README.md', undefined],
    ['web/checkout.js', undefined],
  ];
  for (const [p, kind] of cases) assert.equal(sensitiveKind(p), kind, p);
  assert.ok(isTestPath('tests/brief.test.ts'));
  assert.ok(isTestPath('web/checkout.test.js'));
  assert.ok(isTestPath('pkg/api_test.go'));
  assert.ok(!isTestPath('src/attest.ts'));
});

test('risk flags: a large diff, each sensitive kind once, deleted or gutted tests, and new dependencies', () => {
  assert.deepEqual(riskFlags([file('web/checkout.js'), file('README.md')]), []);
  const flags = riskFlags(
    [file('.github/workflows/ci.yml'), file('package-lock.json', 'M', 400, 200), file('api/login.js'), file('tests/old.test.ts', 'D', 0, 40), file('tests/cart.test.ts', 'M', 2, 30), file('web/a.js')],
    ['left-pad'],
  );
  assert.deepEqual(
    flags.map((f) => f.kind),
    ['large', 'ci', 'lockfile', 'auth', 'tests-deleted', 'tests-deleted', 'deps'],
  );
  assert.match(flags[0].text, /^Large change: 6 files, \+411 -273\./);
  assert.equal(flags[1].text, 'Touches CI config: .github/workflows/ci.yml.');
  assert.equal(flags[4].text, 'Deletes test file: tests/old.test.ts.');
  assert.equal(flags[5].text, 'Removes more test lines than it adds in tests/cart.test.ts.');
  assert.equal(flags[6].text, 'Adds a dependency: left-pad.');
  // Many files of one kind are named three at a time, the rest counted.
  const many = riskFlags(['a', 'b', 'c', 'd', 'e'].map((n) => file(`db/migrations/${n}.sql`)));
  assert.equal(many[0].text, 'Touches database migrations: db/migrations/a.sql, db/migrations/b.sql, db/migrations/c.sql and 2 more.');
  assert.equal(riskFlags(Array.from({ length: 30 }, (_, i) => file(`src/f${i}.ts`, 'M', 1, 0)))[0].kind, 'large');
});

test('new dependencies are read off a manifest diff: added names, not bumps, scripts or fields', () => {
  const pkg = [
    'diff --git a/package.json b/package.json',
    '--- a/package.json',
    '+++ b/package.json',
    '@@ -5,9 +5,11 @@',
    '   "scripts": {',
    '-    "test": "node --test"',
    '+    "test": "node --test --watch",',
    '+    "lint": "eslint ."',
    '   },',
    '-  "version": "1.0.0",',
    '+  "version": "1.1.0",',
    '   "dependencies": {',
    '-    "express": "^4.18.0",',
    '+    "express": "^4.19.0",',
    '+    "left-pad": "^1.3.0",',
    '+    "@acme/pay": "workspace:*",',
    '+    "node": ">=20"',
  ].join('\n');
  assert.deepEqual(addedDependencies('package.json', pkg), ['@acme/pay', 'left-pad']);
  assert.deepEqual(addedDependencies('api/requirements.txt', '@@ -1 +1,3 @@\n flask==3.0\n+Requests>=2.31\n+# a comment\n+-r base.txt\n'), ['requests']);
  assert.deepEqual(addedDependencies('go.mod', '@@ -3,4 +3,5 @@\n require (\n+\tgithub.com/acme/kit v1.2.0\n-\tgolang.org/x/net v0.1.0\n+\tgolang.org/x/net v0.2.0\n'), ['github.com/acme/kit']);
  assert.deepEqual(addedDependencies('Cargo.toml', '@@ -1,4 +1,6 @@\n-version = "0.1.0"\n+version = "0.2.0"\n+serde = { version = "1", features = ["derive"] }\n+anyhow = "1.0"\n'), ['anyhow', 'serde']);
});

const brief = (over: Partial<ReviewBrief> = {}): ReviewBrief => ({ workerId: 'w1', followUps: [], qa: [], runs: [], flags: [], files: 1, additions: 3, deletions: 1, at: 0, ...over });

test('the verdict: verified with nothing flagged is ready; anything else says the gap plainly', () => {
  const pass = { command: 'npm test', passed: true, at: 200 };
  const ready = verdict(brief({ runs: [pass], lastEditAt: 100 }), undefined);
  assert.equal(ready.ready, true);
  assert.deepEqual(ready.good, ['npm test passed']);
  assert.deepEqual(ready.gaps, []);
  // Nothing run, nothing in CI.
  const none = verdict(brief(), undefined);
  assert.equal(none.ready, false);
  assert.deepEqual(none.gaps, ['No tests were run, and there are no CI checks.']);
  // The last run decides: an earlier failure fixed since is fine, a failure last is not.
  assert.equal(verdict(brief({ runs: [{ ...pass, passed: false, at: 50 }, pass] }), undefined).ready, true);
  assert.deepEqual(verdict(brief({ runs: [pass, { ...pass, command: 'npm run build', passed: false, at: 300 }] }), undefined).gaps, ['Its last test run failed: npm run build.']);
  // Edited after its last run: stale.
  assert.equal(testState(brief({ runs: [pass], lastEditAt: 250 })).tests, 'stale');
  assert.deepEqual(verdict(brief({ runs: [pass], lastEditAt: 250 }), undefined).gaps, ['It edited files after its last test run (npm test passed) and did not run it again.']);
  // CI alone verifies; CI failing or running is a gap.
  assert.equal(verdict(brief(), 'pass').ready, true);
  assert.deepEqual(verdict(brief({ runs: [pass] }), 'fail').gaps, ['CI checks are failing.']);
  assert.deepEqual(verdict(brief(), 'pending').gaps, ['It ran no tests itself.', 'CI checks are still running.']);
  // Verified, but flagged: not ready, the flag is the gap.
  const flagged = verdict(brief({ runs: [pass], flags: riskFlags([file('.github/workflows/ci.yml')]) }), 'pass');
  assert.equal(flagged.ready, false);
  assert.deepEqual(flagged.good, ['npm test passed', 'CI checks passing']);
  assert.deepEqual(flagged.gaps, ['Touches CI config: .github/workflows/ci.yml.']);
});

test('transcripts: the last thing said, from Claude Code or Codex, and the question it ends on', () => {
  const claude = [
    JSON.stringify({ type: 'user', message: { role: 'user', content: 'Fix it' } }),
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Fixed the selector.\n\nShould I also update the snapshot?' }] } }),
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Bash', input: {} }] } }),
    'not json',
    '',
  ];
  assert.equal(lastAssistantText(claude), 'Fixed the selector.\n\nShould I also update the snapshot?');
  const codex = [
    JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Done: tests pass.' }] } }),
    JSON.stringify({ type: 'event_msg', payload: { type: 'token_count' } }),
  ];
  assert.equal(lastAssistantText(codex), 'Done: tests pass.');
  assert.equal(lastAssistantText([JSON.stringify({ type: 'event_msg', payload: { type: 'agent_message', message: 'All set.' } })]), 'All set.');
  assert.equal(lastAssistantText(['{}', 'x']), undefined);
  assert.equal(lastQuestion('Fixed the selector.\n\nShould I also update the snapshot? Or leave it.'), 'Should I also update the snapshot?');
  assert.equal(lastQuestion('Why? Because.\n\nDone.'), undefined);
  assert.equal(lastQuestion(undefined), undefined);
  assert.deepEqual(askedQuestions({ questions: [{ question: 'Round to cents?' }, { question: '' }, {}] }), ['Round to cents?']);
  assert.deepEqual(askedAnswers(['Round to cents?', 'Keep tax?'], { answers: { 'Round to cents?': 'Yes', 'Keep tax?': ['A', 'B'] } }), ['Yes', 'A, B']);
  assert.deepEqual(askedAnswers(['Q?'], { answers: ['No'] }), ['No']);
  assert.deepEqual(askedAnswers(['Q?'], 'Maybe'), ['Maybe']);
  assert.deepEqual(askedAnswers(['Q?'], undefined), [undefined]);
});

test('line comments bundle into a Send back note, anchored to file and line, in order', () => {
  assert.equal(bundleComments([]), '');
  assert.equal(anchor({ path: 'a.ts', line: 3, removed: true }), 'a.ts:3 (removed line)');
  assert.equal(
    bundleComments([
      { path: 'web/b.js', line: 9, text: 'Keep the guard', removed: true, code: '  if (!order) return;' },
      { path: 'web/a.js', line: 12, text: ' Name this total ', code: 'const t = sum(items);' },
    ]),
    'Comments on your diff:\n- web/a.js:12 `const t = sum(items);`: Name this total\n- web/b.js:9 (removed line) `if (!order) return;`: Keep the guard\n\n',
  );
});

test('the journal: prompts, questions and answers, test runs, edits and the last message, from hook events', () => {
  let now = 1000;
  const log = new BriefLog(undefined, () => now);
  const tick = (ms = 10) => (now += ms);
  log.observe('w1', 'UserPromptSubmit', { prompt: 'Add the checkout total' });
  tick();
  log.observe('w1', 'PreToolUse', { tool_name: 'AskUserQuestion', tool_input: { questions: [{ question: 'Round to cents?' }] } });
  tick();
  log.observe('w1', 'PostToolUse', { tool_name: 'AskUserQuestion', tool_response: { answers: { 'Round to cents?': 'Yes, to cents' } } });
  tick();
  log.observe('w1', 'PostToolUse', { tool_name: 'Bash', tool_input: { command: 'npm test' }, tool_response: { stdout: '# tests 3\n# pass 2\n# fail 1' } });
  tick();
  log.observe('w1', 'PreToolUse', { tool_name: 'Edit', tool_input: { file_path: 'total.js' } });
  const editAt = now;
  tick();
  log.observe('w1', 'PostToolUseFailure', { tool_name: 'Bash', tool_input: { command: 'npm run build' }, error: 'exit 1' });
  tick();
  log.observe('w1', 'PostToolUse', { tool_name: 'Bash', tool_input: { command: ['bash', '-lc', 'npm test'] }, tool_response: { stdout: '# pass 3\n# fail 0', exit_code: 0 } });
  log.observe('w1', 'PostToolUse', { tool_name: 'Bash', tool_input: { command: 'ls -la' } });
  tick();
  log.observe('w1', 'Stop', { last_assistant_message: 'Added total.js; tests pass.\n\nShould I round tax too?' });
  tick();
  // The first thing said after a turn that ended on a question is its answer, not a new task.
  log.observe('w1', 'UserPromptSubmit', { prompt: 'No, leave tax alone' });
  tick();
  log.observe('w1', 'UserPromptSubmit', { prompt: 'Also add a test for zero items' });
  // Events it doesn't read change nothing, and nothing breaks on junk.
  log.observe('w1', 'Notification', { notification_type: 'idle_prompt' });
  log.observe('w1', 'PostToolUse', null);
  const j = log.journal('w1')!;
  assert.deepEqual(j.prompts.map((p) => p.text), ['Add the checkout total', 'Also add a test for zero items']);
  assert.deepEqual(j.qa.map((q) => [q.question, q.answer]), [['Round to cents?', 'Yes, to cents'], ['Should I round tax too?', 'No, leave tax alone']]);
  assert.deepEqual(j.runs.map((r) => [r.command, r.passed]), [['npm test', false], ['npm run build', false], ['npm test', true]]);
  assert.equal(j.lastEditAt, editAt);
  assert.equal(j.summary?.text, 'Added total.js; tests pass.\n\nShould I round tax too?');
  // A tool line some CLIs send ("Bash: npm test") is read the same way.
  log.observe('w2', 'PostToolUse', { tool_name: 'Bash: npm test -- web', tool_response: { stdout: 'ok' } });
  log.observe('w2', 'PreToolUse', { tool_name: 'Edit: web/a.js' });
  assert.deepEqual(log.journal('w2')!.runs.map((r) => r.command), ['npm test -- web']);
  assert.ok(log.journal('w2')!.lastEditAt);
  // A call that names no question (Codex's) still has its answers keyed by question.
  log.observe('w2', 'PreToolUse', { tool_name: 'request_user_input', tool_input: {} });
  log.observe('w2', 'PostToolUse', { tool_name: 'request_user_input', tool_response: { answers: { 'How should I fix the test?': 'Fix the selector' } } });
  assert.deepEqual(log.journal('w2')!.qa.map((q) => [q.question, q.answer]), [['How should I fix the test?', 'Fix the selector']]);
  // An event it doesn't read starts no journal.
  log.observe('w3', 'Notification', { notification_type: 'permission_prompt' });
  assert.equal(log.journal('w3'), undefined);
  // A /clear starts the task over.
  log.observe('w1', 'SessionStart', { source: 'clear' });
  assert.equal(log.journal('w1'), undefined);
});

test('the journal reads the last message off the transcript when the Stop hook carries none, and keeps itself on disk', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'brief-'));
  try {
    const transcript = path.join(dir, 'session.jsonl');
    writeFileSync(transcript, `${JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Rate limit added.' }] } })}\n`);
    assert.equal(transcriptSummary(transcript), 'Rate limit added.');
    assert.equal(transcriptSummary(path.join(dir, 'missing.jsonl')), undefined);
    assert.equal(transcriptSummary(dir), undefined, 'a folder is not read');
    assert.equal(transcriptSummary(path.join(dir, 'notes.txt')), undefined, 'only a .jsonl transcript');
    const log = new BriefLog(dir);
    log.observe('w1', 'UserPromptSubmit', { prompt: 'Add a rate limit' });
    log.observe('w1', 'Stop', { transcript_path: transcript });
    assert.equal(log.journal('w1')?.summary?.text, 'Rate limit added.');
    log.flush();
    const again = new BriefLog(dir);
    assert.equal(again.journal('w1')?.summary?.text, 'Rate limit added.');
    assert.deepEqual(again.journal('w1')?.prompts.map((p) => p.text), ['Add a rate limit']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the brief: the task and what came after, the journal, and the flags its changed files raise', async () => {
  const log = new BriefLog(undefined, () => 500);
  log.observe('w1', 'UserPromptSubmit', { prompt: 'Add left-pad to the receipt (with the office note first)' });
  log.observe('w1', 'UserPromptSubmit', { prompt: 'Use two spaces' });
  log.observe('w1', 'PostToolUse', { tool_name: 'Bash', tool_input: { command: 'npm test' }, tool_response: { stdout: '# fail 0' } });
  log.observe('w1', 'Stop', { last_assistant_message: 'Receipt padded.' });
  const asked: string[] = [];
  const changes: BriefChanges = {
    summary: async () => ({ files: [file('package.json'), file('package-lock.json', 'M', 30, 2), file('web/receipt.js')] }),
    diff: async (_id, p) => (asked.push(p), { diff: '@@ -1,3 +1,4 @@\n   "dependencies": {\n+    "left-pad": "^1.3.0",\n' }),
  };
  const b = await buildBrief({ id: 'w1', prompt: 'Add left-pad to the receipt' }, log.journal('w1'), changes, 900);
  assert.equal(b.task, 'Add left-pad to the receipt');
  assert.deepEqual(b.followUps, ['Use two spaces']);
  assert.equal(b.summary, 'Receipt padded.');
  assert.deepEqual(b.runs.map((r) => r.passed), [true]);
  assert.deepEqual(asked, ['package.json'], 'only manifests are read for dependencies');
  assert.deepEqual(b.flags.map((f) => f.kind), ['lockfile', 'deps']);
  assert.deepEqual([b.files, b.additions, b.deletions, b.at], [3, 36, 4, 900]);
  // No journal and no checkout: a brief with the task alone, never an error.
  const bare = await buildBrief({ id: 'w9', prompt: 'Do a thing' }, undefined, { summary: async () => undefined, diff: async () => 'No such worker' });
  assert.equal(bare.task, 'Do a thing');
  assert.deepEqual([bare.flags, bare.qa, bare.runs, bare.followUps], [[], [], [], []]);
  const broken = await buildBrief({ id: 'w9' }, undefined, { summary: async () => Promise.reject(new Error('git died')), diff: async () => 'x' });
  assert.equal(broken.files, 0);
});

test('brief.get is a message the office takes, and the read-only demo lets visitors look at briefs', () => {
  assert.ok(Object.hasOwn(handlers, 'brief.get'));
  assert.ok(READ_ONLY_ALLOWS.has('brief.get'));
});
