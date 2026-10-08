import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// This product is a fork of agent-office by webdevcody (MIT). The MIT license only holds while its
// notice ships with every copy, so the attribution files are checked here: a rename, a cleanup or a
// stray delete in a checkout must never take them out of the tree or the package.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');

test('LICENSE is the MIT license with the upstream copyright kept', () => {
  assert.ok(existsSync(path.join(ROOT, 'LICENSE')), 'LICENSE is missing');
  const license = read('LICENSE');
  assert.match(license, /^MIT License/);
  assert.match(license, /Copyright \(c\) 2026 AgentSystemLabs/);
  assert.match(license, /The above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software\./);
});

test('NOTICE names the upstream project and its author', () => {
  assert.ok(existsSync(path.join(ROOT, 'NOTICE')), 'NOTICE is missing');
  const notice = read('NOTICE');
  assert.match(notice, /fork of agent-office \(https:\/\/github\.com\/AgentSystemLabs\/agent-office\)/);
  assert.match(notice, /created by webdevcody, released under the MIT License/);
});

test('the package says it is MIT, credits upstream and ships NOTICE (npm adds LICENSE by itself)', () => {
  const pkg = JSON.parse(read('package.json')) as { license: string; description: string; files: string[] };
  assert.equal(pkg.license, 'MIT');
  assert.match(pkg.description, /agent-office by webdevcody \(MIT\)/);
  assert.ok(pkg.files.includes('NOTICE'), 'NOTICE is not in the published files');
});
