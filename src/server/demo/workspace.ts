// The demo's throwaway workspace (see script.ts): a git repository with the seed files, and the
// stand-in agents as `claude`, `codex` and `cursor-agent` with the plan they follow. `mergeline --demo`
// makes it in a fresh temporary folder each time and deletes it when it stops; the hosted demo keeps it
// in its --home and starts it over (director.ts).
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEMO_AUTHOR, DEMO_PROJECT, FLEET, SEED_FILES, improvised, type DemoStep } from './script.js';
import { PLAYS, SLUG_MARK, STANDIN_SOURCE, TASK_MARK } from './standin.js';

export interface DemoWorkspace {
  /** The throwaway repository: the demo's one project. */
  repo: string;
  /** Where the stand-ins are: first on the office's PATH. */
  bin: string;
  /** The repository's first commit, which every new round of the hosted demo starts from. */
  seed: string;
  /** How many times faster than written the script plays (MERGELINE_DEMO_PACE; 1 as written). */
  pace: number;
}

/** MERGELINE_DEMO_PACE as a pace: 1 (as written) up to 20 times faster, for tests and quick looks. */
export function demoPace(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 20) : 1;
}

/** A fresh temporary folder for a demo office's home (`--demo` without `--home`): `<tmp>/mergeline-demo-XXXX/office`. */
export function freshDemoHome(): string {
  return path.join(mkdtempSync(path.join(os.tmpdir(), 'mergeline-demo-')), 'office');
}

/** git, quietly, with nothing of the person's own config that could get in the way (hooks, signing). */
export function demoGit(args: string[], cwd: string): string {
  return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

/** Makes the repository (once) and writes the stand-ins and their plan (every start) under `home`. */
export function prepareDemo(home: string, pace = 1): DemoWorkspace {
  const repo = path.join(home, DEMO_PROJECT);
  const bin = path.join(home, '.agent-office', 'demo-bin');
  mkdirSync(bin, { recursive: true, mode: 0o700 });
  if (!existsSync(path.join(repo, '.git'))) {
    mkdirSync(repo, { recursive: true });
    demoGit(['init', '-q', '-b', 'main'], repo);
    for (const [file, text] of Object.entries(SEED_FILES)) {
      mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
      writeFileSync(path.join(repo, file), text);
    }
    demoGit(['add', '-A'], repo);
    demoGit(['-c', `user.name=${DEMO_AUTHOR.name}`, '-c', `user.email=${DEMO_AUTHOR.email}`, 'commit', '-q', '-m', '[demo] acme-shop, made up for the Mergeline demo'], repo);
  }
  const seed = demoGit(['rev-list', '--max-parents=0', 'HEAD'], repo).split('\n')[0];

  const paced = (steps: DemoStep[]) => steps.map((s) => ({ ...s, after: s.after / pace }));
  writeFileSync(path.join(bin, 'plan.json'), JSON.stringify({ author: DEMO_AUTHOR, fleet: FLEET.map(({ task, steps }) => ({ task, steps: paced(steps) })), improvised: paced(improvised(TASK_MARK, SLUG_MARK)) }));
  writeFileSync(path.join(bin, 'standin.cjs'), STANDIN_SOURCE);
  // Its own package.json, so the .cjs is CommonJS whatever folder the demo is in.
  writeFileSync(path.join(bin, 'package.json'), '{"type":"commonjs"}\n');
  const node = process.execPath.replace(/'/g, `'\\''`);
  const script = path.join(bin, 'standin.cjs').replace(/'/g, `'\\''`);
  for (const command of Object.keys(PLAYS)) {
    const file = path.join(bin, command);
    writeFileSync(file, `#!/bin/sh\n# [demo] Mergeline's stand-in for ${command}: no model runs.\nexec '${node}' '${script}' ${command} "$@"\n`);
    chmodSync(file, 0o755);
  }
  return { repo, bin, seed, pace };
}
