// What the first-run task box suggests (shared/starters.ts turns these facts into chips): read from the
// project's folder without running any of its code. Its test command from its own config, its TODO and
// FIXME comments (`git grep`), which parts its README lacks, and, when gh is signed in, its newest open
// issues. Each look has a short timeout and says nothing rather than fail; the answer is kept a minute.
import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { starterChips, type ReadmePart, type RepoFacts, type Starter } from '../shared/starters.js';

type Run = (cmd: string, args: string[], cwd: string, timeoutMs: number) => Promise<string | undefined>;

const run: Run = (cmd, args, cwd, timeout) =>
  new Promise((resolve) => {
    execFile(cmd, args, { cwd, timeout, maxBuffer: 1024 * 1024, windowsHide: true }, (err, stdout) => resolve(err && !stdout ? undefined : String(stdout)));
  });

const read = (file: string): string | undefined => {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
};

/** The command that runs the project's tests, from its own config files. */
export function testCommand(dir: string): string | undefined {
  const pkg = read(path.join(dir, 'package.json'));
  if (pkg) {
    try {
      const test = (JSON.parse(pkg) as { scripts?: Record<string, string> }).scripts?.test;
      // npm init's placeholder only says there are no tests.
      if (test && !/no test specified/.test(test)) {
        const pm = existsSync(path.join(dir, 'pnpm-lock.yaml')) ? 'pnpm' : existsSync(path.join(dir, 'yarn.lock')) ? 'yarn' : existsSync(path.join(dir, 'bun.lockb')) || existsSync(path.join(dir, 'bun.lock')) ? 'bun run' : 'npm';
        return `${pm} test`;
      }
    } catch {
      // not JSON: look further
    }
  }
  if (existsSync(path.join(dir, 'Cargo.toml'))) return 'cargo test';
  if (existsSync(path.join(dir, 'go.mod'))) return 'go test ./...';
  if (existsSync(path.join(dir, 'pytest.ini')) || /\[tool\.pytest/.test(read(path.join(dir, 'pyproject.toml')) ?? '')) return 'pytest';
  if (/^test:/m.test(read(path.join(dir, 'Makefile')) ?? '')) return 'make test';
  return undefined;
}

const PARTS: Record<ReadmePart, RegExp> = {
  install: /^#+.*\b(install|installation|setup|set up|getting started|requirements)\b/im,
  run: /^#+.*\b(usage|run|running|quick ?start|start|develop|development)\b/im,
  test: /^#+.*\b(test|tests|testing)\b/im,
};

/** The README at the top of the project, and which of install, run and test it has no heading for. */
export function readmeFacts(dir: string): RepoFacts['readme'] {
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return undefined;
  }
  const name = names.find((n) => /^readme(\.(md|markdown|rst|txt))?$/i.test(n));
  if (!name) return { exists: false };
  const text = read(path.join(dir, name)) ?? '';
  return { exists: true, missing: (Object.keys(PARTS) as ReadmePart[]).filter((p) => !PARTS[p].test(text)) };
}

/** `git grep -c` output (file:count per line) as a total and the file with the most. */
export function todoFacts(out: string | undefined): RepoFacts['todos'] {
  if (!out) return undefined;
  let count = 0;
  let top: { file: string; n: number } | undefined;
  for (const line of out.split('\n')) {
    const m = line.match(/^(.+):(\d+)$/);
    if (!m) continue;
    const n = Number(m[2]);
    count += n;
    if (!top || n > top.n) top = { file: m[1], n };
  }
  return count ? { count, file: top?.file, inFile: top?.n } : undefined;
}

/** What the office can tell about a project's folder. `github` says whether to ask gh for issues. */
export async function repoFacts(dir: string, github: boolean, exec: Run = run): Promise<RepoFacts> {
  const [todos, issues] = await Promise.all([
    exec('git', ['grep', '-c', '-I', '-w', '-E', 'TODO|FIXME', '--', '.', ':!node_modules', ':!dist', ':!vendor', ':!*.min.js', ':!*.lock', ':!package-lock.json'], dir, 5_000),
    github ? exec('gh', ['issue', 'list', '--state', 'open', '--limit', '3', '--json', 'number,title'], dir, 10_000) : Promise.resolve(undefined),
  ]);
  let open: RepoFacts['issues'];
  try {
    const list = issues ? (JSON.parse(issues) as { number: number; title: string }[]) : undefined;
    open = Array.isArray(list) ? list.filter((i) => Number.isInteger(i.number) && typeof i.title === 'string') : undefined;
  } catch {
    open = undefined;
  }
  return { test: testCommand(dir), todos: todoFacts(todos), readme: readmeFacts(dir), ...(open?.length ? { issues: open } : {}) };
}

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; chips: Promise<Starter[]> }>();

/** The chips for a project's folder, worked out at most once a minute (unless `fresh`). */
export function starters(dir: string, github: boolean, fresh = false): Promise<Starter[]> {
  const key = `${path.resolve(dir)}|${github}`;
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < TTL_MS) return hit.chips;
  const chips = repoFacts(dir, github).then((f) => starterChips(f));
  cache.set(key, { at: Date.now(), chips });
  return chips;
}
