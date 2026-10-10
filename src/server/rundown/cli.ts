// rundown.mjs: the /rundown skill's script, built from this file into one dependency-free ESM file
// (vite.rundown.config.ts, dist/rundown/rundown.mjs, Node 18 or newer). The same collector and page the
// office uses, run in any git checkout:
//
//   node rundown.mjs collect [--root <dir>] [--no-gh]   facts into .rundown/facts.json, and a summary
//   node rundown.mjs facts   [--root <dir>]             the same (the skill's "facts" mode)
//   node rundown.mjs brief   [--root <dir>]             a compact digest for Claude to judge from
//   node rundown.mjs render  [--root <dir>] [--mode full|quick] [--open] [--theme dark|light] [--accent <name|#hex>]
//   node rundown.mjs quick   [--root <dir>] [--open]    collect, then render with the last judgement
//   node rundown.mjs install --skill <SKILL.md> [--readme <README.md>] [--dry-run]
//                                                       itself, SKILL.md and README.md into ~/.claude/skills/rundown/,
//                                                       after a diff and a backup of what was there
//
// Everything it writes is in <git top>/.rundown/ (kept out of git through .git/info/exclude, never
// .gitignore): the page as rundown.html and map.html, rundown.json, state.json and history/. It never
// changes anything else in the checkout, and never runs the checkout's code. A --root that isn't a
// folder is an error (exit 2), never created; the home folder and / are mapped only when named with
// --root, and outside git nothing is listed or opened at all.

import { execFile, spawn, spawnSync } from 'node:child_process';
import { appendFileSync, copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readState, type Since } from '../../shared/rundown/diff.js';
import { accentHex, renderPage, type PageStyle } from '../../shared/rundown/html.js';
import { appendDecisions, writeDecisions, writeMilestones } from '../../shared/rundown/markdown.js';
import { buildRundown, isoLocal, itemsLeft } from '../../shared/rundown/model.js';
import { LIMITS, type Facts, type Judgement, type Rundown, type RundownProject } from '../../shared/rundown/schema.js';
import { validateJudgement } from '../../shared/rundown/validate.js';
import { plural } from '../../shared/rundown/html-sections.js';
import { toState } from '../../shared/rundown/diff.js';
import { collect } from './collect.js';
import { commitsSince, gitRunner } from './git.js';

export const VERSION = '1.0.0';

interface Args {
  cmd: string;
  root: string;
  /** Whether the root was named (--root or a path), not just the current folder. */
  named: boolean;
  mode: 'full' | 'quick';
  open: boolean;
  gh: boolean;
  theme?: 'dark' | 'light';
  accent?: string;
  skill?: string;
  readme?: string;
  dryRun: boolean;
}

export function parseArgs(argv: string[], cwd = process.cwd()): Args {
  const a: Args = { cmd: argv[0] ?? 'help', root: cwd, named: false, mode: 'full', open: false, gh: true, dryRun: false };
  const named = (v: string | undefined) => {
    a.root = path.resolve(cwd, v ?? '.');
    a.named = true;
  };
  for (let i = 1; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--root') named(argv[++i]);
    else if (v === '--mode') a.mode = argv[++i] === 'quick' ? 'quick' : 'full';
    else if (v === '--open') a.open = true;
    else if (v === '--no-gh') a.gh = false;
    else if (v === '--theme') {
      const t = argv[++i];
      if (t === 'dark' || t === 'light') a.theme = t;
    } else if (v === '--accent') a.accent = argv[++i];
    else if (v === '--skill') a.skill = argv[++i];
    else if (v === '--readme') a.readme = argv[++i];
    else if (v === '--dry-run') a.dryRun = true;
    else if (!v.startsWith('-')) named(v);
  }
  return a;
}

/** Why `a.root` can't be mapped, or null when it can: not a folder, or a home or filesystem root nobody named. */
export function rootProblem(a: Pick<Args, 'root' | 'named'>, home = os.homedir()): string | null {
  let isDir = false;
  try {
    isDir = statSync(a.root).isDirectory();
  } catch {
    // missing
  }
  if (!isDir) return `no such folder: ${a.root}`;
  const wide = a.root === path.parse(a.root).root || path.resolve(a.root) === path.resolve(home);
  if (wide && !a.named) return `${a.root} is your ${a.root === home ? 'home folder' : 'filesystem root'}, not a project: cd into one, or name it with --root if you really mean it`;
  return null;
}

/** The style shared with the project-map agent, ~/.claude/agent-memory/project-map/style.md, under --theme and --accent. */
export function readStyle(a: Pick<Args, 'theme' | 'accent'>, file = path.join(os.homedir(), '.claude', 'agent-memory', 'project-map', 'style.md')): PageStyle {
  const text = read(file) ?? '';
  const theme = /^style:\s*(dark|light)\s*$/m.exec(text)?.[1] as PageStyle['theme'] | undefined;
  const accent = /^accent:\s*([#\w-]+)\s*$/m.exec(text)?.[1];
  return { theme: a.theme ?? theme ?? 'dark', accent: (a.accent && accentHex(a.accent) ? a.accent : undefined) ?? accent ?? 'orange' };
}

const tildify = (p: string) => {
  const home = os.homedir();
  return p === home || p.startsWith(home + path.sep) ? `~${p.slice(home.length)}` : p;
};

/** The git top of `dir`, or `dir` itself outside a repository. */
async function topOf(dir: string): Promise<{ root: string; repo: boolean }> {
  const git = gitRunner(dir, () => {});
  const top = (await git(['rev-parse', '--show-toplevel']))?.trim();
  return top ? { root: top, repo: true } : { root: dir, repo: false };
}

/** .rundown/ out of git for every worktree: one line in the common info/exclude, never .gitignore. */
async function excludeOutput(root: string) {
  const git = gitRunner(root, () => {});
  const common = (await git(['rev-parse', '--git-common-dir']))?.trim();
  if (!common) return;
  const info = path.join(path.resolve(root, common), 'info');
  const file = path.join(info, 'exclude');
  const have = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (/^\/?\.rundown\/?\s*$/m.test(have)) return;
  mkdirSync(info, { recursive: true });
  appendFileSync(file, `${have && !have.endsWith('\n') ? '\n' : ''}# The /rundown skill's project map\n/.rundown/\n`);
}

const read = (file: string): string | null => {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
};

const readJson = (file: string): unknown => {
  const t = read(file);
  if (t === null) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
};

/** A file written whole or not at all: a failed run leaves the old one. */
function writeAtomic(file: string, text: string) {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}

/** The first run after the project-map agent: its milestones and decisions come along, once. */
function migrate(root: string, out: string) {
  const old = path.join(root, '.project-map');
  if (!existsSync(old) || existsSync(path.join(out, 'state.json'))) return;
  for (const f of ['milestones.md', 'decisions.md']) if (existsSync(path.join(old, f)) && !existsSync(path.join(out, f))) copyFileSync(path.join(old, f), path.join(out, f));
}

/** GitHub's open issues and pull requests, if gh is there and signed in (15 s at most). */
function github(root: string): Promise<Facts['github']> {
  const gh = (args: string[]) =>
    new Promise<string | null>((resolve) =>
      execFile('gh', args, { cwd: root, timeout: 15_000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1' }, windowsHide: true }, (err, stdout) => resolve(err ? null : stdout)),
    );
  return Promise.all([gh(['issue', 'list', '--state', 'open', '--limit', '100', '--json', 'number']), gh(['pr', 'list', '--state', 'open', '--limit', '30', '--json', 'number,title,headRefName,isDraft'])]).then(([issues, prs]) => {
    if (issues === null && prs === null) return null;
    try {
      const pr = (prs ? JSON.parse(prs) : []) as { number: number; title: string; headRefName: string; isDraft: boolean }[];
      return { openIssues: issues ? (JSON.parse(issues) as unknown[]).length : 0, openPrs: pr.map((p) => ({ number: p.number, title: String(p.title).slice(0, 200), branch: p.headRefName, draft: !!p.isDraft })) };
    } catch {
      return null;
    }
  });
}

async function runCollect(a: Args, root: string, out: string): Promise<{ facts: Facts; project: RundownProject }> {
  const [c, gh] = await Promise.all([collect(root, { budgetMs: LIMITS.skillMs, shownRoot: tildify(root) }), a.gh ? github(root) : Promise.resolve(null)]);
  if (a.gh && !gh) c.facts.gaps.push('gh: not available or not signed in (issues and pull requests left out)');
  c.facts.github = gh;
  writeAtomic(path.join(out, 'facts.json'), `${JSON.stringify(c, null, 1)}\n`);
  return c;
}

function factsSummary(c: { facts: Facts; project: RundownProject }, out: string): string {
  const f = c.facts;
  const g = f.git;
  const lines = [
    `Facts: ${tildify(path.join(out, 'facts.json'))} (${f.durationMs} ms${f.truncated ? ', partial' : ''})`,
    `${c.project.name}${c.project.head ? ` on ${c.project.head.branch ?? 'detached'} ${c.project.head.sha.slice(0, 7)}` : ''}: ${plural(f.files.total, 'file')}, ${plural(Object.values(f.files.languages).reduce((a, l) => a + l.lines, 0), 'line')}, ${plural(f.files.tests.files, 'test file')}`,
    `Top folders: ${f.files.byTopFolder.slice(0, 8).map((t) => `${t.folder} ${t.lines.toLocaleString('en-US')}`).join(', ')}`,
  ];
  if (g) lines.push(`Git: ${plural(g.totalCommits, 'commit')}, ${plural(g.branches.length, 'branch', 'branches')}, ${plural(g.worktrees.length, 'worktree')}, ${g.uncommitted.modified + g.uncommitted.untracked + g.uncommitted.staged} uncommitted`);
  if (f.gaps.length) lines.push(`Gaps: ${f.gaps.join('; ')}`);
  return lines.join('\n');
}

/** What Claude reads before judging: compact, never file contents. */
function brief(root: string, out: string, c: { facts: Facts; project: RundownProject }): string {
  const f = c.facts;
  const prev = readState(readJson(path.join(out, 'state.json')) ?? readJson(path.join(root, '.project-map', 'state.json')));
  const judgement = readJson(path.join(out, 'judgement.json'));
  const L: string[] = [factsSummary(c, out), ''];
  if (c.project.description) L.push(`README: ${c.project.description}`, '');
  L.push('Folders (lines, files, tests, commits 30d):');
  for (const d of f.files.dirs.filter((x) => x.path.split('/').length <= 2).slice(0, 30)) L.push(`  ${d.path || '.'}  ${plural(d.lines, 'line')}, ${plural(d.files, 'file')}, ${plural(d.tests, 'test')}, ${plural(d.commits30d, 'commit')}`);
  if (prev) L.push('', `Previous run ${prev.generatedAt} at ${prev.head?.slice(0, 7) ?? '?'}: parts ${prev.parts.map((p) => `${p.id}=${p.status}`).join(', ')}`);
  if (judgement && typeof judgement === 'object') L.push(`Previous part ids (reuse them): ${((judgement as Judgement).parts ?? []).map((p) => p.id).join(', ')}`);
  const ms = read(path.join(out, 'milestones.md'));
  L.push('', ms ? `milestones.md exists (${ms.split('\n').filter((l) => /^- \[/.test(l.trim())).length} items): edit only by ticking clearly done items` : 'No milestones.md yet: propose milestones in judgement.json');
  const dec = read(path.join(out, 'decisions.md'));
  L.push(dec ? `decisions.md exists: answers there are the user's; raise only new decisions (new ids)` : 'No decisions.md yet');
  if (f.git) {
    L.push('', 'Recent commits:');
    for (const cm of f.git.recentCommits.slice(0, 15)) L.push(`  ${cm.sha.slice(0, 7)} ${cm.date.slice(0, 10)} ${cm.subject}`);
    L.push('', `Branches: ${f.git.branches.slice(0, 15).map((b) => `${b.name}${b.merged ? ' (merged)' : ` +${b.ahead}/-${b.behind}`}`).join(', ')}`);
  }
  if (f.github) L.push(`GitHub: ${f.github.openIssues} open issues; open PRs: ${f.github.openPrs.map((p) => `#${p.number} ${p.title}`).join('; ') || 'none'}`);
  L.push(`TODO ${f.files.todo.todo}, FIXME ${f.files.todo.fixme}, HACK ${f.files.todo.hack}; test frameworks: ${f.files.tests.frameworks.join(', ') || 'none found'}`);
  return L.join('\n');
}

async function render(a: Args, root: string, out: string, repo: boolean, collected?: { facts: Facts; project: RundownProject }): Promise<Rundown> {
  if (a.accent && !accentHex(a.accent)) console.error(`--accent ${a.accent}: not a colour name or #rrggbb, the saved accent is used`);
  const c = collected ?? ((readJson(path.join(out, 'facts.json')) as { facts: Facts; project: RundownProject } | null) || (await runCollect(a, root, out)));
  let judgement: Judgement | null = null;
  const raw = readJson(path.join(out, 'judgement.json'));
  if (raw) {
    const v = validateJudgement(raw);
    if (v.ok) judgement = v.value;
    else console.error(`judgement.json left out: ${v.error}`);
  }
  const statePath = path.join(out, 'state.json');
  const prev = readState(readJson(statePath) ?? readJson(path.join(root, '.project-map', 'state.json')));
  const since: Since | null = repo && prev?.head ? await commitsSince(gitRunner(root, () => {}), prev.head) : null;
  const msPath = path.join(out, 'milestones.md');
  const decPath = path.join(out, 'decisions.md');
  const r = buildRundown({ facts: c.facts, project: c.project, generator: { name: 'rundown-skill', version: VERSION, mode: a.mode }, judgement, milestonesMd: read(msPath), decisionsMd: read(decPath), prev, since, now: new Date() });
  writeAtomic(path.join(out, 'rundown.json'), `${JSON.stringify(r, null, 1)}\n`);
  const page = renderPage(r, new Date(), readStyle(a));
  writeAtomic(path.join(out, 'rundown.html'), page);
  writeAtomic(path.join(out, 'map.html'), page);
  // The person's files: written once, then only theirs to change (a new decision is added, nothing else).
  if (!existsSync(msPath) && r.milestones.length) writeAtomic(msPath, writeMilestones(r.milestones, { proposed: r.milestones.some((m) => m.source === 'proposed') }));
  const decMd = read(decPath);
  if (decMd === null) {
    if (r.decisions.length) writeAtomic(decPath, writeDecisions(r.decisions));
  } else {
    const next = appendDecisions(decMd, r.decisions.filter((d) => !d.answer));
    if (next !== decMd) writeAtomic(decPath, next);
  }
  // Last, once the page is written: a failed run never moves the diff base.
  if (existsSync(statePath)) {
    const hist = path.join(out, 'history');
    mkdirSync(hist, { recursive: true });
    const stamp = isoLocal(new Date()).slice(0, 19).replace(/[-:]/g, '');
    renameSync(statePath, path.join(hist, `${stamp}.json`));
    const old = readdirSync(hist).filter((f) => f.endsWith('.json')).sort();
    for (const f of old.slice(0, Math.max(0, old.length - 20))) unlinkSync(path.join(hist, f));
  }
  writeAtomic(statePath, `${JSON.stringify(toState(r), null, 1)}\n`);
  return r;
}

/** The reply's shape: where the map is, the next milestone, the next step, what changed, what's open. */
export function summary(r: Rundown, mapPath: string): string {
  const L = [`Rundown: ${mapPath}`];
  const ms = r.milestones.find((m) => m.id === r.nextMilestone);
  L.push(ms ? `Next milestone: ${ms.id} ${ms.name}, ${itemsLeft(r)} item${itemsLeft(r) === 1 ? '' : 's'} left${ms.due ? ` (due ${ms.due})` : ''}${ms.source === 'proposed' ? ' [proposed: edit .rundown/milestones.md]' : ''}` : 'Next milestone: none');
  L.push(r.nextStep ? `Next step: ${r.nextStep.text} (${r.nextStep.why})` : 'Next step: none yet (run the full /rundown for one)');
  L.push(r.previous ? (r.changes.length ? `Changed since ${r.previous.generatedAt.slice(0, 16).replace('T', ' ')}:\n${r.changes.slice(0, 8).map((c) => `  - ${c.text}`).join('\n')}` : 'Nothing changed since the last rundown') : 'First rundown');
  const open = r.decisions.filter((d) => !d.answer);
  L.push(open.length ? `Your call:\n${open.map((d) => `  - ${d.id}. ${d.question} Default: ${d.default}`).join('\n')}` : 'Your call: nothing open');
  const parts = r.parts.map((p) => `${p.name} ${p.status}${p.waitingOn ? ` (waiting on ${p.waitingOn})` : ''}`).join('; ');
  L.push(`Parts: ${parts}${r.parts.some((p) => p.statusSource === 'inferred') ? ' [inferred]' : ''}`);
  if (r.facts.gaps.length) L.push(`Gaps: ${r.facts.gaps.join('; ')}`);
  return L.join('\n');
}

function openFile(file: string) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
  try {
    spawn(cmd, [file], { detached: true, stdio: 'ignore' }).unref();
  } catch {
    // Nothing to open it with: the path is printed anyway.
  }
}

/** Every file under `dir`, relative, with '/'. */
function filesUnder(dir: string, rel = ''): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap((e) => {
    const r = rel ? `${rel}/${e.name}` : e.name;
    return e.isDirectory() ? filesUnder(dir, r) : e.isFile() ? [r] : [];
  });
}

export interface InstallPlan {
  dir: string;
  /** What goes in, by its path in the skill. */
  files: Map<string, string>;
  added: string[];
  changed: string[];
  same: string[];
  /** There now and not in this build (the old scripts): backed up, then taken out. Screenshots in examples/ stay. */
  stale: string[];
}

/** What installing would do to `dir`: nothing is written. */
export function planInstall(dir: string, files: Map<string, string>): InstallPlan {
  const plan: InstallPlan = { dir, files, added: [], changed: [], same: [], stale: [] };
  for (const [rel, src] of files) {
    const dst = path.join(dir, rel);
    if (!existsSync(dst)) plan.added.push(rel);
    else if (readFileSync(dst).equals(readFileSync(src))) plan.same.push(rel);
    else plan.changed.push(rel);
  }
  plan.stale = filesUnder(dir).filter((rel) => !files.has(rel) && !rel.startsWith('examples/') && !rel.endsWith('.DS_Store'));
  return plan;
}

/**
 * Puts this build, SKILL.md and README.md into ~/.claude/skills/rundown/ (or `dir`). It says first what
 * changes; with --dry-run that's all, and SKILL.md's diff is shown. Otherwise the whole folder is copied
 * to ~/.claude/backups/rundown-<time>/ before anything in it changes, the stale scripts of an older
 * install go (they're in the backup), and the backup's path and a diff command are printed.
 */
export function install(a: Pick<Args, 'skill' | 'readme' | 'dryRun'>, dir = path.join(os.homedir(), '.claude', 'skills', 'rundown'), backups = path.join(os.homedir(), '.claude', 'backups'), self = fileURLToPath(import.meta.url)): number {
  const files = new Map<string, string>([['scripts/rundown.mjs', self]]);
  for (const [rel, src] of [['SKILL.md', a.skill], ['README.md', a.readme]] as const) {
    if (!src) continue;
    if (!existsSync(src)) {
      console.error(`rundown: no such file: ${src}`);
      return 2;
    }
    files.set(rel, path.resolve(src));
  }
  const plan = planInstall(dir, files);
  const list = (label: string, xs: string[]) => xs.length && console.log(`  ${label}: ${xs.join(', ')}`);
  console.log(`${a.dryRun ? 'Would install' : 'Installing'} into ${tildify(dir)}:`);
  list('new', plan.added);
  list('changed', plan.changed);
  list('unchanged', plan.same);
  list('taken out (an older install, kept in the backup)', plan.stale);
  if (a.dryRun) {
    if (plan.changed.includes('SKILL.md') && a.skill) {
      const d = spawnSync('diff', ['-u', path.join(dir, 'SKILL.md'), path.resolve(a.skill)], { encoding: 'utf8', timeout: 10_000 });
      if (d.stdout) console.log(d.stdout.split('\n').slice(0, 80).join('\n'));
    }
    return 0;
  }
  if (!plan.added.length && !plan.changed.length && !plan.stale.length) {
    console.log('Nothing to change.');
    return 0;
  }
  if (existsSync(dir) && (plan.changed.length || plan.stale.length)) {
    const backup = path.join(backups, `rundown-${isoLocal(new Date()).slice(0, 19).replace(/[-:]/g, '')}`);
    mkdirSync(backups, { recursive: true });
    cpSync(dir, backup, { recursive: true, errorOnExist: true, force: false });
    console.log(`Backed up the old copy to ${tildify(backup)}  (diff -ru ${tildify(backup)} ${tildify(dir)})`);
  }
  for (const [rel, src] of files) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    copyFileSync(src, path.join(dir, rel));
  }
  for (const rel of plan.stale) unlinkSync(path.join(dir, rel));
  console.log(`Installed ${tildify(dir)}`);
  return 0;
}

export async function main(argv: string[]): Promise<number> {
  const a = parseArgs(argv);
  if (a.cmd === 'install') return install(a);
  if (!['collect', 'facts', 'brief', 'render', 'quick'].includes(a.cmd)) {
    console.log(`rundown ${VERSION}: collect | facts | brief | render [--mode full|quick] | quick | install  [--root <dir>] [--open] [--no-gh] [--theme dark|light] [--accent <name|#hex>]`);
    return a.cmd === 'help' || a.cmd === '--help' ? 0 : 2;
  }
  const problem = rootProblem(a);
  if (problem) {
    console.error(`rundown: ${problem}`);
    return 2;
  }
  const { root, repo } = await topOf(a.root);
  if (!a.named && rootProblem({ root, named: false })) {
    console.error(`rundown: ${rootProblem({ root, named: false })}`);
    return 2;
  }
  const out = path.join(root, '.rundown');
  mkdirSync(out, { recursive: true });
  if (repo) await excludeOutput(root);
  migrate(root, out);
  if (a.cmd === 'collect' || a.cmd === 'facts') {
    console.log(factsSummary(await runCollect(a, root, out), out));
    return 0;
  }
  if (a.cmd === 'brief') {
    const c = (readJson(path.join(out, 'facts.json')) as { facts: Facts; project: RundownProject } | null) ?? (await runCollect(a, root, out));
    console.log(brief(root, out, c));
    return 0;
  }
  const collected = a.cmd === 'quick' ? await runCollect(a, root, out) : undefined;
  const r = await render({ ...a, mode: a.cmd === 'quick' ? 'quick' : a.mode }, root, out, repo, collected);
  const map = path.join(out, 'rundown.html');
  console.log(summary(r, tildify(map)));
  if (a.open) openFile(map);
  return 0;
}
