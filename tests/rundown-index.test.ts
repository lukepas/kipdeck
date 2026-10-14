// The index of every project's rundown (src/server/rundown/index-file.ts and the page in
// src/shared/rundown/index-page.ts), ported from the standalone skill's tests: upserts keyed by the real
// root, pruning of pages that are gone (but not of a project on an unmounted drive), the lock that keeps
// parallel runs from dropping each other, escaping, sorting, the filter box, and a render that lands in
// the index and links back to it. Every test uses its own temp folder, never ~/.claude/rundown/.
import { after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { main } from '../src/server/rundown/cli.js';
import { indexHome, indexPaths, rebuildIndex, updateIndex } from '../src/server/rundown/index-file.js';
import { indexEntry, renderIndexPage, type IndexEntry } from '../src/shared/rundown/index-page.js';
import { makeRundownFixture } from './support/rundown-fixture.js';
import { sampleRundown } from './support/rundown-sample.js';

// realpath: entries are keyed by real roots, and macOS's tmpdir sits behind the /var symlink.
const TMP = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'rundown-index-')));
const ROOT = path.resolve(import.meta.dirname, '..');
const fx = makeRundownFixture();
after(() => {
  rmSync(TMP, { recursive: true, force: true });
  rmSync(fx.tmp, { recursive: true, force: true });
});

let n = 0;
let home = '';
beforeEach(() => {
  home = path.join(TMP, `home-${++n}`);
  process.env.RUNDOWN_HOME = home;
});

/** A project folder with a stand-in page, so its entry survives pruning. */
function project(name: string, { generatedAt = '2026-10-01T10:00:00+00:00', folder = name } = {}): IndexEntry {
  const root = path.join(TMP, `p${n}`, folder);
  const htmlPath = path.join(root, '.rundown', 'rundown.html');
  mkdirSync(path.dirname(htmlPath), { recursive: true });
  writeFileSync(htmlPath, '<!doctype html>');
  return {
    root, name, htmlPath, generatedAt, mode: 'full', branch: 'main', judged: true, description: null,
    milestone: { id: 'M2', name: 'Payments live', done: 2, total: 4, due: null }, milestonesDone: false,
    next: 'Merge the webhook endpoints', needs: { decisions: 1, stuck: 0 }, parts: 3,
    counts: { done: 1, 'in-progress': 1, 'not-started': 1, stuck: 0 }, dev: null,
  };
}

const registry = () => (JSON.parse(readFileSync(indexPaths().json, 'utf8')) as { projects: IndexEntry[] }).projects;
const page = () => readFileSync(indexPaths().html, 'utf8');

/** main() with the console caught. */
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

test('RUNDOWN_HOME moves the index; ~ is the home folder and a relative path is refused', async () => {
  assert.equal(indexHome(), home);
  const res = await updateIndex(project('alpha'));
  assert.equal(res.html, path.join(home, 'index.html'));
  assert.ok(existsSync(res.json) && existsSync(res.html));
  assert.equal(indexHome({ RUNDOWN_HOME: '~/rd-test-home' }), path.join(os.homedir(), 'rd-test-home'));
  assert.equal(indexHome({ RUNDOWN_HOME: '~' }), os.homedir());
  assert.equal(indexHome({}), path.join(os.homedir(), '.claude', 'rundown'));
  assert.throws(() => indexHome({ RUNDOWN_HOME: 'rhome' }), /absolute path/);
});

test('an upsert replaces the entry with the same root', async () => {
  const a = project('alpha');
  await updateIndex(a);
  await updateIndex(project('beta'));
  const res = await updateIndex({ ...a, name: 'alpha renamed', generatedAt: '2026-10-02T10:00:00+00:00' });
  assert.equal(res.count, 2);
  assert.equal(registry().filter((e) => e.root === a.root).length, 1);
  assert.equal(registry().find((e) => e.root === a.root)?.name, 'alpha renamed');
});

test('entries whose page is gone are dropped', async () => {
  const a = project('alpha');
  const b = project('beta');
  await updateIndex(a);
  await updateIndex(b);
  unlinkSync(b.htmlPath);
  assert.equal((await updateIndex(a)).count, 1);
  assert.deepEqual(registry().map((e) => e.name), ['alpha']);
  unlinkSync(a.htmlPath);
  assert.equal((await rebuildIndex()).count, 0);
  assert.match(page(), /No rundowns yet/);
  assert.ok(!page().includes('Click a card'));
});

test('an unmounted volume keeps its card, a deleted folder does not', async () => {
  const realDev = statSync(TMP).dev;
  // A repo at a volume root: gone, and the folder above it is on another device.
  const gone = path.join(TMP, `vol${n}`, 'Drive');
  const ejected = { ...project('drive-root'), root: gone, htmlPath: path.join(gone, '.rundown', 'rundown.html'), dev: realDev + 1 };
  // An empty mount point left behind: the root exists but sits on another device than recorded.
  const mp = path.join(TMP, `mnt${n}`, 'data');
  mkdirSync(mp, { recursive: true });
  const emptyMount = { ...project('mount-point'), root: mp, htmlPath: path.join(mp, '.rundown', 'rundown.html'), dev: realDev + 1 };
  // A folder deleted on the same device.
  const del = path.join(TMP, `del${n}`, 'proj');
  mkdirSync(path.dirname(del), { recursive: true });
  const deleted = { ...project('deleted'), root: del, htmlPath: path.join(del, '.rundown', 'rundown.html'), dev: realDev };
  // An older entry without a device, straight under a mount folder.
  const legacy = { ...project('legacy-volume'), root: '/Volumes/NoSuchRundownTestDrive', htmlPath: '/Volumes/NoSuchRundownTestDrive/.rundown/rundown.html' };
  for (const e of [ejected, emptyMount, deleted, legacy]) await updateIndex(e);
  const res = await rebuildIndex();
  assert.deepEqual(registry().map((e) => e.name).sort(), ['drive-root', 'legacy-volume', 'mount-point']);
  assert.equal(res.count, 3);
});

test('one folder reached through a symlink is one entry', async () => {
  const a = project('alpha');
  const link = path.join(TMP, `link${n}`);
  symlinkSync(a.root, link);
  await updateIndex(a);
  const res = await updateIndex({ ...a, root: link, htmlPath: path.join(link, '.rundown', 'rundown.html') });
  assert.equal(res.count, 1);
  assert.deepEqual(registry().map((e) => [e.root, e.htmlPath]), [[a.root, a.htmlPath]]);
});

test('parallel runs keep every entry, and the page matches the registry', async () => {
  const lib = pathToFileURL(path.join(ROOT, 'src', 'server', 'rundown', 'index-file.ts')).href;
  const entries = Array.from({ length: 6 }, (_, i) => project(`par${i}`, { folder: `par${i}` }));
  const run = promisify(execFile);
  await Promise.all(entries.map((e) => run(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `const { updateIndex } = await import(${JSON.stringify(lib)}); await updateIndex(${JSON.stringify(e)});`], { cwd: ROOT, env: { ...process.env, RUNDOWN_HOME: home } })));
  assert.deepEqual(registry().map((e) => e.name).sort(), entries.map((e) => e.name).sort());
  for (const e of entries) assert.ok(page().includes(`>${e.name}</a>`), e.name);
  assert.ok(!existsSync(path.join(home, 'index.lock')));
});

// A pid no process has: well above the default pid_max on macOS and Linux.
const DEAD_PID = 4_194_301;
function plantLock(text: string, ageMs = 0) {
  mkdirSync(home, { recursive: true });
  const lock = path.join(home, 'index.lock');
  writeFileSync(lock, text);
  if (ageMs) {
    const t = new Date(Date.now() - ageMs);
    utimesSync(lock, t, t);
  }
}

test("a lock left by a killed run is taken over at once; a live one times out and is never removed", async () => {
  plantLock(`${DEAD_PID} deadbeef`);
  const t0 = Date.now();
  assert.equal((await updateIndex(project('alpha'))).count, 1);
  assert.ok(Date.now() - t0 < 2000, 'no wait for a dead holder');
  assert.ok(!existsSync(path.join(home, 'index.lock')));
  plantLock(`${process.pid} live`);
  await assert.rejects(updateIndex(project('beta')), /index is locked by another run/);
  assert.ok(existsSync(path.join(home, 'index.lock')), "another run's lock stays");
});

test('temp files of killed runs are swept, a live one is kept', async () => {
  mkdirSync(home, { recursive: true });
  writeFileSync(path.join(home, `index.json.${DEAD_PID}.abcd.tmp`), '{');
  writeFileSync(path.join(home, `index.html.${DEAD_PID}.abcd.tmp`), '<');
  writeFileSync(path.join(home, `index.json.${process.pid}.beef.tmp`), '{');
  writeFileSync(path.join(home, `notes.${DEAD_PID}.abcd.tmp`), 'not ours');
  await rebuildIndex();
  assert.ok(!existsSync(path.join(home, `index.json.${DEAD_PID}.abcd.tmp`)));
  assert.ok(!existsSync(path.join(home, `index.html.${DEAD_PID}.abcd.tmp`)));
  assert.ok(existsSync(path.join(home, `index.json.${process.pid}.beef.tmp`)));
  assert.ok(existsSync(path.join(home, `notes.${DEAD_PID}.abcd.tmp`)), 'only our own file names');
});

test('a corrupt or missing index.json starts fresh', async () => {
  mkdirSync(home, { recursive: true });
  writeFileSync(path.join(home, 'index.json'), '{"projects": [ not json');
  assert.equal((await updateIndex(project('alpha'))).count, 1);
  writeFileSync(path.join(home, 'index.json'), JSON.stringify({ projects: [{ root: 1 }, null, 'x'] }));
  assert.equal((await rebuildIndex()).count, 0);
});

test('newest first (ties keep the run just made on top), and the filter box past 8 projects', async () => {
  await updateIndex(project('old', { generatedAt: '2026-09-01T10:00:00+00:00' }));
  await updateIndex(project('new', { generatedAt: '2026-10-05T10:00:00+00:00' }));
  await updateIndex(project('mid', { generatedAt: '2026-09-20T10:00:00+00:00' }));
  assert.deepEqual(registry().map((e) => e.name), ['new', 'mid', 'old']);
  await updateIndex(project('tie', { generatedAt: '2026-10-05T10:00:00+00:00' }));
  assert.deepEqual(registry().map((e) => e.name).slice(0, 2), ['tie', 'new']);
  assert.ok(!page().includes('id="q"'));
  for (let i = 0; i < 5; i++) await updateIndex(project(`p${i}`));
  assert.ok(page().includes('id="q"'));
  assert.ok(page().includes('<span class="count">9<span class="sr"> projects</span></span>'));
});

test('a hostile name is escaped, and file URLs encode spaces, # and unicode', async () => {
  const evil = '<img src=x onerror=alert(1)>"\'&';
  await updateIndex({ ...project('evil'), name: evil, next: '<script>alert(2)</script>', branch: '"><b>' });
  const odd = project('odd', { folder: 'my proj #2 þ' });
  await updateIndex(odd);
  const html = page();
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('<script>alert(2)'));
  assert.ok(!html.includes('"><b>'));
  assert.ok(html.includes('&#60;img src=x onerror=alert(1)&#62;&#34;&#39;&#38;'));
  const href = pathToFileURL(odd.htmlPath).href;
  assert.match(href, /my%20proj%20%232%20%C3%BE/);
  assert.ok(html.includes(`href="${href}"`));
});

test('cards: the whole card is the link, its title holds what the rows may cut off', () => {
  const card = { ...project('c2b2c-auto-parts-marketplace-mvp'), description: 'A parts marketplace.', generatedAt: '2026-10-12T10:00:00+00:00', needs: { decisions: 2, stuck: 1 }, href: 'file:///x/.rundown/rundown.html', pathLabel: '~/x/c2b2c' };
  const html = renderIndexPage([card], {}, Date.parse('2026-10-13T10:00:00Z'));
  assert.ok(html.includes('title="c2b2c-auto-parts-marketplace-mvp\nA parts marketplace.\n~/x/c2b2c\nupdated 2026-10-12 10:00\nneeds you: 2 open decisions, 1 stuck"'));
  assert.match(html, /\.pc-name::after\{content:"";position:absolute;inset:0;z-index:1/);
  assert.ok(html.includes('<span class="sr">: 2 open decisions, 1 stuck</span>'));
  const facts = renderIndexPage([{ ...card, judged: false, parts: 12 }]);
  assert.ok(facts.includes('not assessed yet, 12 parts by folder'));
  // Stale after 14 days.
  assert.match(renderIndexPage([card], {}, Date.parse('2026-11-01T10:00:00Z')), /class="pc stale"/);
});

test('an entry holds only what the page shows, and counts what is waiting', () => {
  const r = sampleRundown({
    judgement: {
      parts: [{ id: 'api', name: 'API', summary: 's', paths: ['src/server/**'], status: 'stuck', waitingOn: 'a key' }],
      milestones: [{ id: 'M1', name: 'One', doneWhen: 'x', items: [{ text: 'a', done: true }, { text: 'b', done: false }] }],
      nextStep: { text: 'Get the key', why: 'w', partId: null },
      decisions: [{ id: 'D1', question: 'Q?', options: ['a', 'b'], default: 'a', raised: '2026-10-07' }],
    },
  });
  const e = indexEntry(r, { root: '/x', htmlPath: '/x/.rundown/rundown.html', dev: 7 });
  assert.deepEqual(e.milestone, { id: 'M1', name: 'One', done: 1, total: 2, due: null });
  assert.deepEqual(e.needs, { decisions: 1, stuck: 1 });
  assert.equal(e.next, 'Get the key');
  assert.equal(e.judged, true);
  assert.deepEqual(Object.keys(e).sort(), ['branch', 'counts', 'description', 'dev', 'generatedAt', 'htmlPath', 'judged', 'milestone', 'milestonesDone', 'mode', 'name', 'needs', 'next', 'parts', 'root'].sort());
});

test('a render lands in the index and its page links back to it; a broken index never fails the render', async () => {
  const r = await cli(['quick', '--no-gh', '--root', fx.repo]);
  assert.equal(r.code, 0, r.err);
  const html = readFileSync(path.join(fx.repo, '.rundown', 'rundown.html'), 'utf8');
  const href = pathToFileURL(indexPaths().html).href;
  assert.ok(html.includes(`<a class="home-btn" href="${href}" aria-label="All rundowns"`));
  assert.ok(html.includes(`<a href="${href}">All rundowns</a>`), 'the footer link');
  const [e] = registry();
  assert.equal(e.root, realpathSync(fx.repo));
  assert.equal(e.dev, statSync(fx.repo).dev);
  assert.equal(e.judged, false);
  // The index command: rebuilds, and takes no --root.
  const ix = await cli(['index']);
  assert.equal(ix.code, 0, ix.err);
  assert.match(ix.out, /^Index  .*index\.html · 1 project$/);
  assert.equal((await cli(['index', '--root', fx.repo])).code, 2);
  // A RUNDOWN_HOME under a file: the page is still written, without links to an index that isn't there.
  const blocker = path.join(TMP, `blocker${n}`);
  writeFileSync(blocker, 'a file, not a folder');
  process.env.RUNDOWN_HOME = path.join(blocker, 'home');
  const broken = await cli(['quick', '--no-gh', '--root', fx.repo]);
  assert.equal(broken.code, 0, broken.err);
  assert.match(broken.out, /^! index: cannot use .* for the index: a folder above it is a file$/m);
  assert.doesNotMatch(broken.out, /^Index /m);
  const page2 = readFileSync(path.join(fx.repo, '.rundown', 'rundown.html'), 'utf8');
  assert.ok(!page2.includes('class="home-btn"') && !page2.includes('All rundowns</a>'));
  assert.equal(readFileSync(path.join(fx.repo, '.rundown', 'map.html'), 'utf8'), page2);
  // A relative RUNDOWN_HOME: refused, nothing written into the repo.
  process.env.RUNDOWN_HOME = 'rhome';
  const rel = await cli(['quick', '--no-gh', '--root', fx.repo]);
  assert.equal(rel.code, 0, rel.err);
  assert.match(rel.out, /^! index: RUNDOWN_HOME must be an absolute path/m);
  assert.ok(!existsSync(path.join(fx.repo, 'rhome')));
  assert.equal((await cli(['index'])).code, 2);
});
