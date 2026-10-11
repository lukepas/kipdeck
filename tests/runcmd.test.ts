import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { homeFlag, launchCommand, localCommand, npxSpec, officeCommand, shellWord, type RunEnv } from '../src/server/runcmd.js';
import { checkAgentsAsync } from '../src/server/firstrun.js';
import { findOnPath, resolveCommandAsync } from '../src/server/workers/process.js';
import { STARTING, addressLines, block, startsOffice } from '../src/server/startup.js';

// The command Kipdeck prints for itself (the banner, `open`, the sign-in page, the demo pill) is one
// that runs today: `kipdeck` only when that name on the PATH is this install, the npx spec when npx
// started it, else node and the install's own bin script. And the terminal says "Starting" at once.

const tmp = mkdtempSync(path.join(tmpdir(), 'kipdeck-runcmd-'));
after(() => rmSync(tmp, { recursive: true, force: true }));

/** An install of Kipdeck at `root`, with its bin script and package.json. */
function install(root: string, name = 'kipdeck') {
  mkdirSync(path.join(root, 'bin'), { recursive: true });
  writeFileSync(path.join(root, 'bin', 'agent-office.js'), '#!/usr/bin/env node\n');
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name }));
  return root;
}

const env = (root: string, find: RunEnv['find'] = () => null): RunEnv => ({ root, find, win: false, home: '/home/ada' });

test('a clone run with node: node and the path to its bin script, from any folder', () => {
  const root = install(path.join(tmp, 'clone'));
  assert.equal(launchCommand(env(root)), `node ${path.join(root, 'bin', 'agent-office.js')}`);
  assert.equal(localCommand(env(root)), launchCommand(env(root)));
});

test('kipdeck itself once that name on the PATH is this install (npm link, a global install)', () => {
  const root = install(path.join(tmp, 'linked'));
  const linkDir = path.join(tmp, 'linked-bin');
  mkdirSync(linkDir);
  symlinkSync(path.join(root, 'bin', 'agent-office.js'), path.join(linkDir, 'kipdeck'));
  const find = (cmd: string) => (cmd === 'kipdeck' ? path.join(linkDir, 'kipdeck') : null);
  assert.equal(launchCommand(env(root, find)), 'kipdeck');
  // A kipdeck on the PATH that is some other install is not this one.
  const other = install(path.join(tmp, 'other'));
  assert.match(launchCommand(env(other, find)), /^node /);
});

test('started by npx: the spec npx installed it from, and node for a command beside it', () => {
  const cache = path.join(tmp, 'npm', '_npx', '182059fedc29ef86');
  const root = install(path.join(cache, 'node_modules', 'kipdeck'));
  writeFileSync(path.join(cache, 'package.json'), JSON.stringify({ dependencies: { kipdeck: 'github:zbagdzevicius/kipdeck' } }));
  assert.equal(npxSpec(root), 'github:zbagdzevicius/kipdeck');
  assert.equal(launchCommand(env(root)), 'npx github:zbagdzevicius/kipdeck');
  // npx again would fetch and build it all over: `open` runs the copy npx already has.
  assert.equal(localCommand(env(root)), `node ${path.join(root, 'bin', 'agent-office.js')}`);
  // npx puts its node_modules/.bin on this process's PATH, never a terminal's: that kipdeck doesn't count.
  const dotBin = path.join(cache, 'node_modules', '.bin');
  mkdirSync(dotBin, { recursive: true });
  symlinkSync(path.join(root, 'bin', 'agent-office.js'), path.join(dotBin, 'kipdeck'));
  const npxPath = (cmd: string) => (cmd === 'kipdeck' ? path.join(dotBin, 'kipdeck') : null);
  assert.equal(localCommand(env(root, npxPath)), `node ${path.join(root, 'bin', 'agent-office.js')}`);
  assert.equal(launchCommand(env(root, npxPath)), 'npx github:zbagdzevicius/kipdeck');
  // From the registry, under a scoped name: the name, not the range npm wrote.
  writeFileSync(path.join(cache, 'package.json'), JSON.stringify({ dependencies: { '@kipdeck/kipdeck': '^0.2.0' } }));
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: '@kipdeck/kipdeck' }));
  assert.equal(launchCommand(env(root)), 'npx @kipdeck/kipdeck');
  assert.equal(npxSpec(path.join(tmp, 'clone')), undefined, 'not under _npx');
  // A tarball from npm pack: npm writes it relative to the _npx folder, the command needs it whole.
  writeFileSync(path.join(cache, 'package.json'), JSON.stringify({ dependencies: { '@kipdeck/kipdeck': 'file:../../../kipdeck-0.1.0.tgz' } }));
  assert.equal(npxSpec(root), `file:${path.join(tmp, 'kipdeck-0.1.0.tgz')}`);
});

test('paths are quoted only when they must be, and the home folder is ~', () => {
  const unix = { win: false, home: '/home/ada' };
  assert.equal(shellWord('/home/ada/code/kipdeck/bin/agent-office.js', unix), '~/code/kipdeck/bin/agent-office.js');
  assert.equal(shellWord('/opt/my apps/kipdeck', unix), "'/opt/my apps/kipdeck'");
  assert.equal(shellWord("/home/ada/it's here", unix), "'/home/ada/it'\\''s here'", 'quoted in full, ~ only expands unquoted');
  const win = { win: true, home: 'C:\\Users\\ada' };
  assert.equal(shellWord('C:\\Users\\ada\\kipdeck\\bin\\agent-office.js', win), 'C:\\Users\\ada\\kipdeck\\bin\\agent-office.js');
  assert.equal(shellWord('C:\\Program Files\\kipdeck', win), '"C:\\Program Files\\kipdeck"');
});

test('--home only for an office outside the default folder, so the command finds this one', () => {
  const e = { win: false, home: '/home/ada' };
  assert.equal(homeFlag('/home/ada/agent-office', e), '');
  assert.equal(homeFlag(undefined, e), '');
  assert.equal(homeFlag('/tmp/kipdeck-demo-x', e), ' --home /tmp/kipdeck-demo-x');
  assert.equal(homeFlag('/home/ada/code/shop', e), ' --home ~/code/shop');
  const root = install(path.join(tmp, 'office-cmd'));
  assert.equal(officeCommand('open', '/home/ada/agent-office', env(root)), `node ${path.join(root, 'bin', 'agent-office.js')} open`);
  assert.equal(officeCommand('open', '/srv/office', env(root)), `node ${path.join(root, 'bin', 'agent-office.js')} open --home /srv/office`);
});

test('this checkout: the command that runs it is real (the bin script is there)', () => {
  const cmd = launchCommand();
  assert.ok(cmd === 'kipdeck' || cmd === 'agent-office' || /^node \S+\/bin\/agent-office\.js$/.test(cmd), cmd);
});

test('agent CLIs are looked for all at once without blocking, the same answer as one by one', async () => {
  const asked: string[] = [];
  const agents = await checkAgentsAsync(async (cmd) => (asked.push(cmd), cmd === 'claude' ? '/usr/local/bin/claude' : null), {}, tmp);
  assert.ok(asked.includes('claude') && asked.includes('codex'));
  assert.equal(new Set(asked).size, asked.length, 'each command once');
  assert.equal(agents.find((a) => a.provider === 'claude')?.installed, true);
  assert.equal(agents.find((a) => a.provider === 'codex')?.installed, false);
});

test('a command on the PATH is found without a shell; a missing one comes back null', async () => {
  assert.ok(findOnPath('node'));
  assert.equal(await resolveCommandAsync('node'), findOnPath('node'));
  const shell = process.env.SHELL;
  process.env.SHELL = '/bin/sh';
  try {
    if (process.platform !== 'win32') assert.equal(await resolveCommandAsync('kipdeck-no-such-command-x9'), null);
  } finally {
    if (shell === undefined) delete process.env.SHELL;
    else process.env.SHELL = shell;
  }
});

test('the terminal: Starting at once (not for help), then the address and the command for a new link', () => {
  assert.equal(STARTING, 'Starting Kipdeck...');
  assert.ok(startsOffice([]));
  assert.ok(startsOffice(['--demo']));
  assert.ok(!startsOffice(['--help']));
  assert.ok(!startsOffice(['-h']));
  assert.ok(!startsOffice(['--reset-password']));
  const lines = addressLines({ urls: ['http://localhost:4600'], signIn: 'http://localhost:4600/login#key=k', opened: false, openCmd: 'node ~/k/bin/agent-office.js open' });
  assert.match(block(lines), /running at http:\/\/localhost:4600\n {2}Sign in \(the link works once\): http:\/\/localhost:4600\/login#key=k\n {2}Lost the tab\? Run `node ~\/k\/bin\/agent-office\.js open` for a new link\./);
  assert.equal(block(['', '', 'a', '', '', 'b']), '\na\n\nb');
});