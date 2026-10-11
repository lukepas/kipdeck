// `kipdeck rundown`: the project map from the office's own command, with no office running and no
// Claude. `kipdeck rundown [path]` writes or refreshes a checkout's map (the facts and the parts
// inferred from them, or the last judgement of the /rundown skill when it left one) through the same
// script the skill runs (cli.ts, `quick`), and `kipdeck rundown install` puts the /rundown skill into
// ~/.claude/skills/rundown/ from the files this package ships (dist/rundown/rundown.mjs and
// skills/rundown/), with the installer's list, backup and diff.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLI } from '../../shared/copy.js';
import { INFERRED_NOTE } from '../../shared/rundown/infer.js';
import { install, main } from './cli.js';

export const RUNDOWN_HELP = `${CLI} rundown - the project map, without Claude

Usage:
  ${CLI} rundown [path] [--open] [--no-gh]
  ${CLI} rundown install [--dry-run]

Writes or refreshes the map of the git checkout at [path] (default: the current
folder) in <checkout>/.rundown/, kept out of git through .git/info/exclude: the
facts, and the parts inferred from the folders and their activity (or the last
judgement of /rundown, when the skill has run there). Prints a short summary
and where the page is.

install puts the /rundown skill into ~/.claude/skills/rundown/, so Claude Code
has /rundown in every folder. It lists what changes first, backs up what was
there to ~/.claude/backups/rundown-<time>/ and prints a diff command.

Options:
      --open        Open the page when it's written
      --no-gh       Leave out GitHub's open issues and pull requests
  -n, --dry-run     install: show what would change and change nothing
  -h, --help        Show this help
`;

export type RundownArgs = { cmd: 'map'; path?: string; open: boolean; gh: boolean } | { cmd: 'install'; dryRun: boolean } | { cmd: 'help' } | { cmd: 'error'; error: string };

/** What `kipdeck rundown ...` asks for. */
export function parseRundownArgs(argv: readonly string[]): RundownArgs {
  if (argv.some((a) => a === '-h' || a === '--help')) return { cmd: 'help' };
  if (argv[0] === 'install') {
    let dryRun = false;
    for (const a of argv.slice(1)) {
      if (a === '--dry-run' || a === '-n') dryRun = true;
      else return { cmd: 'error', error: `unknown option for install: ${a}` };
    }
    return { cmd: 'install', dryRun };
  }
  let where: string | undefined;
  let open = false;
  let gh = true;
  for (const a of argv) {
    if (a === '--open') open = true;
    else if (a === '--no-gh') gh = false;
    else if (a.startsWith('-')) return { cmd: 'error', error: `unknown option ${a}` };
    else if (where === undefined) where = a;
    else return { cmd: 'error', error: `one path at most (got ${where} and ${a})` };
  }
  return { cmd: 'map', ...(where !== undefined ? { path: where } : {}), open, gh };
}

/** The kipdeck package's top folder, from this file up: in a source checkout or an installed package alike. */
export function packageRoot(from = fileURLToPath(import.meta.url)): string | null {
  let dir = path.dirname(from);
  for (;;) {
    const pkg = path.join(dir, 'package.json');
    if (existsSync(pkg)) {
      try {
        if ((JSON.parse(readFileSync(pkg, 'utf8')) as { name?: unknown }).name === 'kipdeck') return dir;
      } catch {
        // not ours: keep going up
      }
    }
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/** The skill's three files as the package ships them, or what's missing. */
export function packagedFiles(root: string): { script: string; skill: string; readme: string } | { missing: string } {
  const script = path.join(root, 'dist', 'rundown', 'rundown.mjs');
  const skill = path.join(root, 'skills', 'rundown', 'SKILL.md');
  const readme = path.join(root, 'skills', 'rundown', 'README.md');
  if (!existsSync(script)) return { missing: `${script} (run npm run build:rundown in a source checkout)` };
  if (!existsSync(skill)) return { missing: skill };
  return { script, skill, readme };
}

/** Whether `dir` is a folder inside a git checkout: a map is only written into one, never into a home folder or a stray parent. */
export function inGit(dir: string): boolean {
  try {
    execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], { stdio: 'ignore', timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

/** `kipdeck rundown ...`: returns the exit code. `root` is the package's top folder (a test's packed layout). */
export async function rundownCommand(argv: string[], root = packageRoot()): Promise<number> {
  const a = parseRundownArgs(argv);
  if (a.cmd === 'help') {
    process.stdout.write(RUNDOWN_HELP);
    return 0;
  }
  if (a.cmd === 'error') {
    console.error(`${CLI} rundown: ${a.error}\n`);
    process.stderr.write(RUNDOWN_HELP);
    return 2;
  }
  if (a.cmd === 'install') {
    const files = root ? packagedFiles(root) : { missing: 'the kipdeck package' };
    if ('missing' in files) {
      console.error(`${CLI} rundown install: not found: ${files.missing}`);
      return 1;
    }
    const code = install({ skill: files.skill, readme: existsSync(files.readme) ? files.readme : undefined, dryRun: a.dryRun }, undefined, undefined, files.script);
    if (code === 0 && !a.dryRun) console.log('Type /rundown in Claude Code, in any git checkout, for the full map with Claude\'s read.');
    return code;
  }
  // A folder outside git gets nothing written: a missing one or a file the script refuses itself.
  const where = path.resolve(a.path ?? process.cwd());
  if (existsSync(where) && statSync(where).isDirectory() && !inGit(where)) {
    console.error(`${CLI} rundown: ${a.path ?? where} is not inside a git checkout`);
    return 2;
  }
  let inferred = false;
  const code = await main(['quick', ...(a.path !== undefined ? ['--root', a.path] : []), ...(a.open ? ['--open'] : []), ...(a.gh ? [] : ['--no-gh'])], (r) => {
    inferred = r.parts.some((p) => p.statusSource === 'inferred');
  });
  if (code === 0 && inferred) console.log(INFERRED_NOTE);
  return code;
}
