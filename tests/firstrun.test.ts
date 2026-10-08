// The setup card (src/server/firstrun.ts and ws/handlers/setup.ts): the agent CLIs found and whether
// each is signed in, GitHub as optional, the checkout the office was started in as a project
// (Building.addFolder), and who may add it or switch the usage numbers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkAgents, checkGithub, signedIn } from '../src/server/firstrun.js';
import { Building } from '../src/server/building.js';
import { Telemetry } from '../src/server/telemetry.js';
import { setupHandlers } from '../src/server/ws/handlers/setup.js';

const tmp = () => mkdtempSync(path.join(tmpdir(), 'firstrun-'));

test('Claude Code, Codex and Cursor are always listed, the beta agents only when installed', () => {
  const home = tmp();
  const found = new Set(['claude', 'opencode']);
  const agents = checkAgents((cmd) => (found.has(cmd) ? `/usr/bin/${cmd}` : null), {}, home);
  assert.deepEqual(
    agents.map((a) => [a.provider, a.certified, a.installed]),
    [
      ['claude', true, true],
      ['codex', true, false],
      ['cursor', true, false],
      ['opencode', false, true],
    ],
  );
  // Not installed: the one line that installs it. Installed and signed out: the one that signs it in.
  assert.equal(agents.find((a) => a.provider === 'codex')?.fix, 'npm install -g @openai/codex');
  assert.equal(agents.find((a) => a.provider === 'claude')?.signedIn, false);
  assert.equal(agents.find((a) => a.provider === 'claude')?.fix, 'claude auth login');
});

test("sign-in is read from each CLI's own files and keys, and left unsaid where it can't be told", () => {
  const home = tmp();
  assert.equal(signedIn('claude', {}, home), false);
  assert.equal(signedIn('claude', { ANTHROPIC_API_KEY: 'x' }, home), true);
  writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: 'a@example.invalid' } }));
  assert.equal(signedIn('claude', {}, home), true, 'a Mac keeps the token in the keychain and the account here');
  assert.equal(signedIn('codex', {}, home), false);
  mkdirSync(path.join(home, '.codex'));
  writeFileSync(path.join(home, '.codex', 'auth.json'), '{}');
  assert.equal(signedIn('codex', {}, home), true);
  assert.equal(signedIn('cursor', {}, home), undefined);
  assert.equal(signedIn('cursor', { CURSOR_API_KEY: 'x' }, home), true);
});

test('GitHub: signed in, not installed, signed out or failing, never asking anything', async () => {
  type Run = Parameters<typeof checkGithub>[1];
  const fake = (err: Partial<NodeJS.ErrnoException> | null, stdout: string, stderr = ''): Run =>
    ((_cmd: string, _args: string[], _opts: unknown, cb: (e: unknown, out: string, errOut: string) => void) => cb(err ? Object.assign(new Error(err.message ?? 'x'), err) : null, stdout, stderr)) as unknown as Run;
  assert.deepEqual(await checkGithub('/', fake(null, 'octocat\n')), { state: 'ok', login: 'octocat' });
  assert.equal((await checkGithub('/', fake({ code: 'ENOENT' }, ''))).state, 'missing');
  assert.deepEqual(await checkGithub('/', fake({ message: 'exit 4' }, '', 'To get started with GitHub CLI, please run:  gh auth login')), { state: 'signed-out', fix: 'gh auth login' });
  assert.equal((await checkGithub('/', fake({ message: 'exit 1' }, '', 'error connecting to api.github.com'))).state, 'error');
});

function repo(dir: string, origin?: string) {
  mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: dir });
  if (origin) execFileSync('git', ['remote', 'add', 'origin', origin], { cwd: dir });
  return dir;
}

test('a checkout already on this computer becomes a project where it is, once', () => {
  const root = tmp();
  const data = path.join(root, 'data');
  mkdirSync(data);
  const b = new Building(data, path.join(root, 'projects'));
  const api = repo(path.join(root, 'api'), 'git@github.com:acme/api.git');
  const first = b.addFolder(api, 'Ada');
  assert.equal(typeof first, 'object');
  if (typeof first === 'string') return;
  assert.equal(first.name, 'api');
  assert.equal(first.repo, 'acme/api');
  assert.equal(b.addFolder(api, 'Ada'), first, 'the same folder is the same project');
  mkdirSync(path.join(api, 'src'));
  assert.match(String(b.addFolder(path.join(api, 'src'), 'Ada')), /overlaps the api project/);
  assert.match(String(b.addFolder(path.join(root, 'nope'), 'Ada')), /isn't a folder/);
  assert.match(String(b.addFolder(repo(path.join(root, 'api-copy'), 'https://github.com/acme/api'), 'Ada')), /acme\/api is a project already/);
  assert.equal(new Building(data, path.join(root, 'projects')).list().length, 1, 'kept in floors.json');
});

/** Just enough of the office for the setup handlers. */
function fakeCtx(admin: boolean, startedIn?: string) {
  const root = tmp();
  const data = path.join(root, 'data');
  mkdirSync(data);
  const sent: { t: string; [k: string]: unknown }[] = [];
  const warned: string[] = [];
  const opened: string[] = [];
  const ctx = {
    cfg: { dataDir: data, startedIn },
    building: new Building(data, path.join(root, 'projects')),
    floors: new Map(),
    telemetry: new Telemetry(data),
    meOf: () => ({ admin }),
    warn: (_c: unknown, e: string | undefined) => e && warned.push(e),
    sendTo: (_c: unknown, m: { t: string }) => sent.push(m),
    broadcast: (m: { t: string }) => sent.push(m),
    toastAll: () => {},
    floorsChanged: () => {},
    openFloor: (def: { id: string }) => (opened.push(def.id), {}),
  };
  return { ctx: ctx as never, root, sent, warned, opened, c: { peer: { name: 'Ada' } } as never };
}

test('only admins add the folder the office was started in, or switch the usage numbers', () => {
  const member = fakeCtx(false, '/somewhere');
  setupHandlers['setup.useFolder'](member.ctx, member.c, { t: 'setup.useFolder' });
  setupHandlers['setup.telemetry'](member.ctx, member.c, { t: 'setup.telemetry', on: true });
  assert.deepEqual(member.warned, ['Only admins can add a project', 'Only admins can change this']);

  const admin = fakeCtx(true);
  setupHandlers['setup.useFolder'](admin.ctx, admin.c, { t: 'setup.useFolder' });
  assert.deepEqual(admin.warned, ['The office was not started inside a git repository']);

  const here = fakeCtx(true);
  const dir = repo(path.join(here.root, 'web'));
  (here.ctx as unknown as { cfg: { startedIn: string } }).cfg.startedIn = dir;
  setupHandlers['setup.useFolder'](here.ctx, here.c, { t: 'setup.useFolder' });
  assert.deepEqual(here.warned, []);
  assert.equal(here.opened.length, 1, 'its project opens');
  setupHandlers['setup.telemetry'](here.ctx, here.c, { t: 'setup.telemetry', on: true });
  assert.equal((here.ctx as unknown as { telemetry: Telemetry }).telemetry.on, true);
});
