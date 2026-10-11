// The command that runs this Kipdeck, as the person can type it today: whatever the banner, the
// sign-in page, `kipdeck open` and the demo print. Kipdeck is not on npm yet, so `kipdeck` alone is
// only right when it is on the PATH (npm link, or a global install later). Otherwise it is the npx
// spec it was started with, or node and the path to this install's bin/agent-office.js.
import { readFileSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLI } from '../shared/copy.js';
import { binScript, findOnPath, WIN } from './workers/process.js';

/** Where this install is, how it was started and what is on the PATH: all a command depends on. */
export interface RunEnv {
  /** The install's root folder (where its package.json is). */
  root: string;
  /** Finds a command on the PATH (no shell is asked). */
  find: (cmd: string) => string | null;
  /** Whether it is Windows, whose shells quote with double quotes and do not expand ~. */
  win: boolean;
  /** The home folder, for writing paths as ~/... */
  home: string;
}

/** The install this code runs from: two folders up from src/server under tsx, three from dist/server/server. */
function installRoot(): string {
  const bin = binScript('agent-office.js');
  if (bin) return path.dirname(path.dirname(bin));
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

export function runEnv(): RunEnv {
  return { root: installRoot(), find: findOnPath, win: WIN, home: os.homedir() };
}

function real(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

function readJson(file: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** One word of a command line, quoted only when it has to be, with the home folder as ~ where that's safe. */
export function shellWord(word: string, env: Pick<RunEnv, 'win' | 'home'>): string {
  if (env.win) return /^[\w@%+=:,./\\-]+$/.test(word) ? word : `"${word}"`;
  const short = word === env.home || word.startsWith(env.home + '/') ? `~${word.slice(env.home.length)}` : word;
  if (/^[\w@%+=:,./~-]+$/.test(short)) return short;
  return `'${word.replace(/'/g, `'\\''`)}'`;
}

/** A semver range or tag, as npm writes a registry package in the dependencies (not a git or file spec). */
const registryRange = (v: string) => /^(latest|next|[\d^~<>=*xX. |-]+)$/.test(v.trim());

/**
 * Started by npx: the spec npx installed it from (github:owner/repo, a tarball, or the package's
 * name once it's on npm), read from the package.json npx writes next to its node_modules.
 */
export function npxSpec(root: string): string | undefined {
  const m = /^(.*[\\/]_npx[\\/][^\\/]+)[\\/]node_modules[\\/]/.exec(root + path.sep);
  if (!m) return undefined;
  const name = String(readJson(path.join(root, 'package.json'))?.name ?? CLI);
  const deps = (readJson(path.join(m[1], 'package.json'))?.dependencies ?? {}) as Record<string, unknown>;
  const spec = typeof deps[name] === 'string' ? (deps[name] as string) : '';
  if (!spec || registryRange(spec)) return name;
  // A local tarball or folder: npm writes it relative to its own folder, not to where you are.
  const local = /^file:(.*)$/.exec(spec);
  return local && !path.isAbsolute(local[1]) ? `file:${path.resolve(m[1], local[1])}` : spec;
}

/** `kipdeck` itself, when that name on the PATH runs this very install (npm link, a global install). */
function onPath(env: RunEnv): string | undefined {
  const bin = real(path.join(env.root, 'bin', 'agent-office.js'));
  for (const name of [CLI, 'agent-office']) {
    const found = env.find(name);
    // npx and npm scripts put a node_modules/.bin on the PATH for this process only: a terminal won't have it.
    if (found && !/node_modules[\\/]\.bin$/.test(path.dirname(found)) && real(found) === bin) return name;
  }
  return undefined;
}

/** node and this install's bin script: works from any folder, with nothing on the PATH. */
function nodeCommand(env: RunEnv): string {
  return `node ${shellWord(path.join(env.root, 'bin', 'agent-office.js'), env)}`;
}

/**
 * How to start Kipdeck again the way it was started this time: `kipdeck` when that is on the PATH,
 * the same `npx <spec>` when npx started it, else `node <path>/bin/agent-office.js`.
 */
export function launchCommand(env: RunEnv = runEnv()): string {
  const spec = npxSpec(env.root);
  if (spec) return `npx ${spec}`;
  return onPath(env) ?? nodeCommand(env);
}

/**
 * The quickest command that runs this same install, for a command beside a running office
 * (`open`, `attach`, `accounts`). Started by npx, that is node and the copy npx installed: running
 * npx again would fetch and build it all over, which takes a minute or more for a GitHub spec.
 */
export function localCommand(env: RunEnv = runEnv()): string {
  return onPath(env) ?? nodeCommand(env);
}

/** For --help: `kipdeck` is on the PATH only once linked or installed, so it says what to type instead. */
export function startedAs(env: RunEnv = runEnv()): string {
  const run = launchCommand(env);
  return run === CLI ? '' : `\nNot on your PATH as ${CLI}: you started it as \`${run}\`. Type that where this help says ${CLI}.\n`;
}

/** The office folder `open` and the other commands find without being told: ~/agent-office. */
export function defaultOfficeDir(home = os.homedir()): string {
  return path.join(home, 'agent-office');
}

/** `--home <dir>` for an office anywhere but the default folder, so the command finds this one. */
export function homeFlag(officeDir: string | undefined, env: Pick<RunEnv, 'win' | 'home'> = runEnv()): string {
  if (!officeDir || path.resolve(officeDir) === path.resolve(defaultOfficeDir(env.home))) return '';
  return ` --home ${shellWord(path.resolve(officeDir), env)}`;
}

/** A command for the office in `officeDir`, as typed beside it: `node .../agent-office.js open --home ~/x`. */
export function officeCommand(sub: string, officeDir?: string, env: RunEnv = runEnv()): string {
  return `${localCommand(env)}${sub ? ` ${sub}` : ''}${homeFlag(officeDir, env)}`;
}
