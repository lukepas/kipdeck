// The in-app upgrade runs its git and build steps in the install's folder, found by the package
// name. The package was renamed from agent-office to kipdeck; both names must still be found, or the
// upgrade falls back to the working directory ($RUN_DIR on a provisioned server) and runs there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_PACKAGE_NAMES, findAppDir } from '../src/server/upgrade.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function install(name: string): { root: string; server: string } {
  const root = mkdtempSync(path.join(tmpdir(), 'upgrade-appdir-'));
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name }));
  const server = path.join(root, 'dist', 'server', 'server');
  mkdirSync(server, { recursive: true });
  return { root, server };
}

test('the upgrade finds an install named kipdeck, the package name today', () => {
  const { root, server } = install('kipdeck');
  assert.equal(findAppDir(server), root);
});

test('the upgrade still finds an install from before the rename (agent-office)', () => {
  const { root, server } = install('agent-office');
  assert.equal(findAppDir(server), root);
});

test('another package is not taken for the install', () => {
  const { server } = install('some-other-app');
  assert.equal(findAppDir(server), undefined);
});

test("the names it accepts include this repository's own package name", () => {
  const name = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).name;
  assert.ok(APP_PACKAGE_NAMES.includes(name), `${name} is not in ${APP_PACKAGE_NAMES.join(', ')}`);
  assert.equal(findAppDir(path.join(ROOT, 'src', 'server')), ROOT);
});
