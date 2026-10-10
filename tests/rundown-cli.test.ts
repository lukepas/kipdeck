// The /rundown script's own guards and options (src/server/rundown/cli.ts), run from source: a --root
// that isn't a folder stops with exit 2 and is never created, the home folder and / are mapped only when
// named, the saved style and --theme/--accent reach the page, the page is written as rundown.html and
// map.html, an install lists what changes and backs up what was there before replacing it, and a
// repository with no commits yet still has its branch, remote and working tree.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { install, main, parseArgs, planInstall, readStyle, rootProblem } from '../src/server/rundown/cli.js';
import { collect } from '../src/server/rundown/collect.js';
import { accentHex, renderPage } from '../src/shared/rundown/html.js';
import { heatmap, weeksFor } from '../src/shared/rundown/heatmap.js';
import { toolCachePath } from '../src/shared/rundown/paths.js';
import type { Judgement } from '../src/shared/rundown/schema.js';
import { sampleRundown } from './support/rundown-sample.js';

const tmp = mkdtempSync(path.join(tmpdir(), 'rundown-cli-'));
after(() => rmSync(tmp, { recursive: true, force: true }));

/** Runs main() with the console caught. */
async function cli(argv: string[]): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const log = console.log;
  const error = console.error;
  console.log = (...a: unknown[]) => void out.push(a.join(' '));
  console.error = (...a: unknown[]) => void err.push(a.join(' '));
  try {
    return { code: await main(argv), out: out.join('\n'), err: err.join('\n') };
  } finally {
    console.log = log;
    console.error = error;
  }
}

test('a --root that is not a folder exits 2 with one line, and nothing is created', async () => {
  const typo = path.join(tmp, 'no-such', 'dir');
  const r = await cli(['quick', '--no-gh', '--root', typo]);
  assert.equal(r.code, 2);
  assert.equal(r.err, `rundown: no such folder: ${typo}`);
  assert.equal(existsSync(path.join(tmp, 'no-such')), false);
  const file = path.join(tmp, 'a-file');
  writeFileSync(file, 'x');
  assert.equal((await cli(['facts', '--root', file])).code, 2);
});

test('the home folder and / are mapped only when named', () => {
  const home = path.join(tmp, 'home');
  mkdirSync(home, { recursive: true });
  assert.match(rootProblem({ root: home, named: false }, home) ?? '', /home folder, not a project/);
  assert.equal(rootProblem({ root: home, named: true }, home), null);
  assert.match(rootProblem({ root: '/', named: false }, home) ?? '', /filesystem root/);
  assert.equal(rootProblem({ root: tmp, named: false }, home), null);
  const a = parseArgs(['quick'], home);
  assert.equal(a.named, false);
  assert.equal(parseArgs(['quick', '--root', '.'], home).named, true);
  assert.equal(parseArgs(['quick', 'sub'], home).root, path.join(home, 'sub'));
});

test('the style: the saved file, then --theme and --accent over it; an unknown accent falls back', () => {
  const file = path.join(tmp, 'style.md');
  assert.deepEqual(readStyle({}, file), { theme: 'dark', accent: 'orange' });
  writeFileSync(file, 'style: light\naccent: blue\n');
  assert.deepEqual(readStyle({}, file), { theme: 'light', accent: 'blue' });
  assert.deepEqual(readStyle({ theme: 'dark', accent: '#112233' }, file), { theme: 'dark', accent: '#112233' });
  assert.deepEqual(readStyle({ accent: 'not-a-colour' }, file), { theme: 'light', accent: 'blue' });
  assert.equal(accentHex('Teal'), '#2dd4bf');
  assert.equal(accentHex('#ABCDEF'), '#abcdef');
  assert.equal(accentHex('url(x)'), null);
  const r = sampleRundown();
  const page = renderPage(r, new Date('2026-10-07T12:00:00Z'), { theme: 'light', accent: 'blue' });
  assert.match(page, /<html lang="en" data-theme="light">/);
  assert.match(page, /--accent:#60a5fa/);
  const plain = renderPage(r, new Date('2026-10-07T12:00:00Z'));
  assert.match(plain, /<html lang="en">/);
  assert.doesNotMatch(plain, /--accent:#60a5fa/);
});

test('the page: stuck parts and what they wait on, whole, over the map; no "1 lines"', () => {
  const r = sampleRundown({
    judgement: {
      parts: [
        { id: 'server', name: 'Server', summary: 'API', paths: ['src/server/**'], status: 'stuck', waitingOn: 'a funded devnet wallet from the finance team, after the audit', evidence: [] },
        { id: 'client', name: 'Client', summary: 'View', paths: ['src/client/**'], status: 'in-progress', waitingOn: null, evidence: [] },
      ],
    } as unknown as Judgement,
  });
  const stuck = r.parts.find((p) => p.status === 'stuck');
  assert.ok(stuck?.waitingOn, 'the sample has a stuck part');
  const page = renderPage(r, new Date('2026-10-07T12:00:00Z'));
  assert.match(page, /class="needs"/);
  assert.ok(page.includes(`waiting on ${stuck.waitingOn}`));
  const one = { ...r, parts: r.parts.map((p, i) => (i === 0 ? { ...p, metrics: { ...p.metrics, lines: 1 } } : p)) };
  assert.doesNotMatch(renderPage(one), /\b1 lines\b/);
});

test('the heatmap is as many weeks as the repository is old, 8 at least, 26 at most', () => {
  const today = new Date('2026-10-07T12:00:00');
  assert.equal(weeksFor('2026-09-30T10:00:00Z', today), 8);
  assert.equal(weeksFor('2026-06-01T10:00:00Z', today), 20);
  assert.equal(weeksFor('2020-01-01T10:00:00Z', today), 26);
  assert.equal(weeksFor(null, today), 26);
  assert.equal(heatmap({}, today, 8).weeks.length, 8);
});

test("tools' caches are not the project's code", () => {
  assert.ok(toolCachePath('.playwright-mcp/page-2026.yml'));
  assert.ok(toolCachePath('pkg/.turbo/log.txt'));
  assert.ok(!toolCachePath('src/cache.ts'));
  assert.ok(!toolCachePath('.github/workflows/ci.yml'));
});

test('a repository with no commits yet: its branch, remote and untracked files are still facts', async () => {
  const repo = path.join(tmp, 'unborn');
  mkdirSync(repo);
  execFileSync('git', ['init', '-q', '-b', 'trunk'], { cwd: repo });
  execFileSync('git', ['remote', 'add', 'origin', 'https://example.invalid/team/app.git'], { cwd: repo });
  writeFileSync(path.join(repo, 'index.js'), 'console.log(1);\n');
  mkdirSync(path.join(repo, '.playwright-mcp'));
  writeFileSync(path.join(repo, '.playwright-mcp', 'snap.yml'), 'a: 1\n'.repeat(500));
  const c = await collect(repo, { budgetMs: 10_000 });
  assert.ok(c.facts.git, 'git facts, not "no git"');
  assert.equal(c.facts.git.uncommitted.untracked >= 1, true);
  assert.equal(c.project.remote, 'team/app');
  assert.ok(c.facts.gaps.includes('git: no commits yet on trunk'), c.facts.gaps.join('; '));
  assert.ok(!c.facts.gaps.some((g) => /no default branch/.test(g)));
  assert.ok(!c.facts.files.byTopFolder.some((t) => t.folder === '.playwright-mcp'));
  // And the script maps it: the page under both names.
  const r = await cli(['quick', '--no-gh', '--root', repo]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /Rundown: .*rundown\.html/);
  for (const f of ['rundown.html', 'map.html']) assert.ok(existsSync(path.join(repo, '.rundown', f)), f);
  assert.equal(readFileSync(path.join(repo, '.rundown', 'rundown.html'), 'utf8'), readFileSync(path.join(repo, '.rundown', 'map.html'), 'utf8'));
});

test('install: lists what changes, a dry run writes nothing, a real one backs up first and takes out stale scripts', () => {
  const dir = path.join(tmp, 'skills', 'rundown');
  const backups = path.join(tmp, 'backups');
  const src = path.join(tmp, 'src');
  mkdirSync(path.join(dir, 'scripts', 'lib'), { recursive: true });
  mkdirSync(path.join(dir, 'examples'), { recursive: true });
  mkdirSync(src, { recursive: true });
  writeFileSync(path.join(dir, 'SKILL.md'), 'old skill\n');
  writeFileSync(path.join(dir, 'scripts', 'rundown.mjs'), 'old script\n');
  writeFileSync(path.join(dir, 'scripts', 'lib', 'html.mjs'), 'old lib\n');
  writeFileSync(path.join(dir, 'examples', 'shot.png'), 'png');
  const skill = path.join(src, 'SKILL.md');
  const readme = path.join(src, 'README.md');
  const self = path.join(src, 'rundown.mjs');
  writeFileSync(skill, 'new skill\n');
  writeFileSync(readme, 'readme\n');
  writeFileSync(self, 'new script\n');

  const plan = planInstall(dir, new Map([['scripts/rundown.mjs', self], ['SKILL.md', skill], ['README.md', readme]]));
  assert.deepEqual(plan.added, ['README.md']);
  assert.deepEqual(plan.changed.sort(), ['SKILL.md', 'scripts/rundown.mjs']);
  assert.deepEqual(plan.stale, ['scripts/lib/html.mjs']);

  const log = console.log;
  const out: string[] = [];
  console.log = (...a: unknown[]) => void out.push(a.join(' '));
  try {
    assert.equal(install({ skill, readme, dryRun: true }, dir, backups, self), 0);
    assert.equal(readFileSync(path.join(dir, 'SKILL.md'), 'utf8'), 'old skill\n', 'a dry run changes nothing');
    assert.equal(existsSync(backups), false);
    assert.match(out.join('\n'), /taken out .*scripts\/lib\/html\.mjs/);
    assert.equal(install({ skill, readme, dryRun: false }, dir, backups, self), 0);
  } finally {
    console.log = log;
  }
  const [backup] = readdirSync(backups);
  assert.match(backup, /^rundown-\d{8}T\d{6}$/);
  assert.equal(readFileSync(path.join(backups, backup, 'SKILL.md'), 'utf8'), 'old skill\n');
  assert.equal(readFileSync(path.join(backups, backup, 'scripts', 'lib', 'html.mjs'), 'utf8'), 'old lib\n');
  assert.equal(readFileSync(path.join(dir, 'SKILL.md'), 'utf8'), 'new skill\n');
  assert.equal(readFileSync(path.join(dir, 'scripts', 'rundown.mjs'), 'utf8'), 'new script\n');
  assert.equal(existsSync(path.join(dir, 'scripts', 'lib', 'html.mjs')), false);
  assert.ok(existsSync(path.join(dir, 'examples', 'shot.png')), 'screenshots stay');
});
