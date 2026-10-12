// What in an agent's diff is worth a second look before it merges: a change too large to read in one
// sitting, files that guard sign-in, CI, lockfiles, migrations, secrets and deploy config, tests it
// deleted, and dependencies it added. Pure, so the tests read it directly; the office runs it over
// a worker's changed files when a browser asks for its review brief (server/brief/build.ts).

import type { ChangedFile, RiskFlag, RiskKind } from '../protocol.js';

/** A diff over either of these reads as large: hard to review well in one sitting. */
export const LARGE_LINES = 500;
export const LARGE_FILES = 25;

/** The most paths a flag names; the rest are counted. */
const NAMED = 3;

/** Paths by the kind of risk they carry, first match wins. */
const SENSITIVE: [Exclude<RiskKind, 'large' | 'tests-deleted' | 'deps'>, RegExp][] = [
  ['secrets', /(?:^|\/)(?:\.env(?:\.[\w.-]+)?|\.npmrc|\.netrc|id_rsa[\w.]*|[^/]+\.(?:pem|key|p12|pfx|keystore))$/i],
  ['ci', /^(?:\.github\/(?:workflows|actions)\/|\.gitlab-ci\.yml$|\.circleci\/|\.buildkite\/|\.travis\.yml$|Jenkinsfile$|azure-pipelines\.ya?ml$|bitbucket-pipelines\.yml$|\.husky\/)/],
  ['lockfile', /(?:^|\/)(?:package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|poetry\.lock|Pipfile\.lock|uv\.lock|go\.sum|Gemfile\.lock|composer\.lock|mix\.lock|Podfile\.lock|flake\.lock)$/],
  ['migration', /(?:^|\/)(?:migrations?|migrate|alembic)\/|(?:^|\/)prisma\/schema\.prisma$|\.sql$/i],
  ['auth', /(?:^|\/)(?:auth(?:n|z|entication|orization)?|login|logout|signin|sign-in|sessions?|oauth2?|sso|permissions?|acl|rbac|security|crypto|passwords?|credentials?|secrets?|csrf|jwt)(?:[/._-]|$)/i],
  ['infra', /(?:^|\/)(?:Dockerfile[\w.-]*|docker-compose[\w.-]*\.ya?ml|compose\.ya?ml|[^/]+\.tf|[^/]+\.tfvars|helm\/|k8s\/|kubernetes\/|Procfile|fly\.toml|vercel\.json|netlify\.toml|nginx[\w.-]*\.conf)$|(?:^|\/)(?:helm|k8s|kubernetes|terraform|deploy)\//i],
];

/** A test file, by its folder or its name. */
const TEST_PATH = /(?:^|\/)(?:tests?|__tests__|spec|specs|e2e)\/|(?:\.|_|-)(?:test|spec)\.[cm]?[jt]sx?$|_test\.(?:go|py|rb|exs?)$|(?:^|\/)test_[^/]+\.py$|Test\.(?:java|kt|cs)$/;

/** What each sensitive kind is called in a flag's sentence. */
const WORDS: Record<(typeof SENSITIVE)[number][0], [string, string]> = {
  secrets: ['a secrets or key file', 'secrets or key files'],
  ci: ['CI config', 'CI config'],
  lockfile: ['a lockfile', 'lockfiles'],
  migration: ['a database migration', 'database migrations'],
  auth: ['sign-in or permission code', 'sign-in or permission code'],
  infra: ['deploy or infrastructure config', 'deploy or infrastructure config'],
};

export function isTestPath(p: string): boolean {
  return TEST_PATH.test(p);
}

/** The sensitive kind a path is, if any. */
export function sensitiveKind(p: string): RiskKind | undefined {
  return SENSITIVE.find(([, re]) => re.test(p))?.[0];
}

/** "a.ts, b.ts and 3 more". */
export function namePaths(paths: readonly string[]): string {
  const shown = paths.slice(0, NAMED);
  const more = paths.length - shown.length;
  if (more > 0) return `${shown.join(', ')} and ${more} more`;
  return shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}` : (shown[0] ?? '');
}

/** The flags for a diff: its files as the Changes window lists them, and the dependencies it adds. */
export function riskFlags(files: readonly Pick<ChangedFile, 'path' | 'status' | 'additions' | 'deletions'>[], addedDeps: readonly string[] = []): RiskFlag[] {
  const flags: RiskFlag[] = [];
  const additions = files.reduce((n, f) => n + f.additions, 0);
  const deletions = files.reduce((n, f) => n + f.deletions, 0);
  if (additions + deletions > LARGE_LINES || files.length > LARGE_FILES) {
    flags.push({ kind: 'large', text: `Large change: ${files.length} file${files.length === 1 ? '' : 's'}, +${additions} -${deletions}. Hard to review well in one pass.`, paths: [] });
  }
  for (const [kind] of SENSITIVE) {
    const paths = files.filter((f) => sensitiveKind(f.path) === kind).map((f) => f.path);
    if (!paths.length) continue;
    const [one, many] = WORDS[kind];
    flags.push({ kind, text: `Touches ${paths.length === 1 ? one : many}: ${namePaths(paths)}.`, paths });
  }
  const deleted = files.filter((f) => f.status === 'D' && isTestPath(f.path)).map((f) => f.path);
  // A test file that lost far more than it gained: tests taken out rather than changed.
  const gutted = files.filter((f) => f.status !== 'D' && isTestPath(f.path) && f.deletions >= 10 && f.deletions > f.additions * 2).map((f) => f.path);
  if (deleted.length) flags.push({ kind: 'tests-deleted', text: `Deletes test file${deleted.length === 1 ? '' : 's'}: ${namePaths(deleted)}.`, paths: deleted });
  if (gutted.length) flags.push({ kind: 'tests-deleted', text: `Removes more test lines than it adds in ${namePaths(gutted)}.`, paths: gutted });
  if (addedDeps.length) flags.push({ kind: 'deps', text: `Adds ${addedDeps.length === 1 ? 'a dependency' : `${addedDeps.length} dependencies`}: ${namePaths(addedDeps)}.`, paths: [] });
  return flags;
}

/** The dependency manifests whose diff `addedDependencies` reads. */
export const MANIFEST = /(?:^|\/)(?:package\.json|requirements[\w.-]*\.txt|go\.mod|Cargo\.toml)$/;

/** A version as package.json writes one (a range, a tag, a protocol), not a script or a field. */
const VERSION = /^(?:[~^<>=v]*\s*\d|\*$|x$|latest$|next$|workspace:|npm:|file:|link:|portal:|git\+|git:|github:|https?:\/\/)/;
/** package.json keys that are fields of the package or its engines, not dependencies. */
const NOT_A_DEP = new Set(['version', 'node', 'npm', 'pnpm', 'yarn', 'bun', 'deno']);
/** Cargo.toml keys that are fields of the package, not dependencies. */
const CARGO_FIELDS = new Set(['version', 'edition', 'name', 'rust-version', 'license', 'description', 'authors', 'readme', 'repository', 'homepage', 'documentation', 'resolver', 'publish', 'build']);

/**
 * The dependencies a manifest's unified diff adds: names on added lines that no removed line had (a
 * version bump is not a new dependency). Reads package.json, requirements*.txt, go.mod and Cargo.toml.
 */
export function addedDependencies(file: string, diff: string): string[] {
  const added = new Set<string>();
  const removed = new Set<string>();
  const name = file.slice(file.lastIndexOf('/') + 1);
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++') || raw.startsWith('---')) continue;
    const sign = raw[0];
    if (sign !== '+' && sign !== '-') continue;
    const dep = depOn(name, raw.slice(1));
    if (dep) (sign === '+' ? added : removed).add(dep);
  }
  return [...added].filter((d) => !removed.has(d)).sort();
}

function depOn(manifest: string, line: string): string | undefined {
  const s = line.trim();
  if (manifest === 'package.json') {
    const m = /^"([^"]+)"\s*:\s*"([^"]*)"/.exec(s);
    return m && !NOT_A_DEP.has(m[1]) && VERSION.test(m[2]) ? m[1] : undefined;
  }
  if (manifest === 'go.mod') {
    const m = /^(?:require\s+)?([\w.-]+\.[\w.-]+\/[\w./-]+)\s+v\d/.exec(s);
    return m?.[1];
  }
  if (manifest === 'Cargo.toml') {
    const m = /^([\w-]+)\s*=\s*(?:"[^"]*\d[^"]*"|\{[^}]*\b(?:version|git|path)\s*=)/.exec(s);
    return m && !CARGO_FIELDS.has(m[1]) ? m[1] : undefined;
  }
  // requirements*.txt: a package name, before its version or extras; not a comment or an option.
  if (!s || s.startsWith('#') || s.startsWith('-')) return undefined;
  const m = /^([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(s);
  return m?.[1].toLowerCase();
}
