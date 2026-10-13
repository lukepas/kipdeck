// Claims in the docs that the code has moved past before: each is checked against what the code does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f: string) => readFileSync(path.join(root, f), 'utf8');

test('README and docs/features.md quote the inbox ceiling tests/home-budget.test.ts holds, not an old size', () => {
  assert.match(read('tests/home-budget.test.ts'), /const HOME_BUDGET_BYTES = 250_000;/);
  for (const f of ['README.md', 'docs/features.md']) {
    const doc = read(f);
    assert.match(doc, /loads under 250 kB before it draws/, f);
    assert.doesNotMatch(doc, /draws after about \d+ kB/, f);
  }
});

test('docs/how-it-works.md says hire, home and tell from an agent go through the agent gate', () => {
  const src = read('src/server/hooks/office-workers.ts');
  assert.ok((src.match(/gateOrRun\(/g) ?? []).length >= 3, 'office-workers.ts sends hire, home and tell through gateOrRun');
  const bullet = read('docs/how-it-works.md').split('\n').find((l) => l.startsWith('- **Workers managing workers.**'));
  assert.ok(bullet);
  assert.match(bullet, /`POST`, `POST \/home` and `POST \/tell` go through \[the agent gate\]\(agent-gate\.md\)/);
  assert.match(bullet, /`202` with `\{proposed, proposal, message\}`/);
  assert.match(bullet, /src\/server\/gate\/flow\.ts/);
});
