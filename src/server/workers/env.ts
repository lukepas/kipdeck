// The environment the workers start with: the office's own, through the allowlist (see
// worker-env.ts), minus a parent agent session's.
import { PROVIDERS } from '../providers/index.js';
import { CLEAN_ENV, pickEnv, type WorkerEnvConfig } from '../worker-env.js';

// Env vars from a parent agent session (e.g. starting the office from inside Claude Code) that
// would make a worker think it is a child session — that silently turns off transcript saving,
// which breaks resume. Each provider names its own (see ProviderAdapter.scrubEnv).
const SCRUB_ENV = new Set([
  ...Object.values(PROVIDERS).flatMap((p) => p.scrubEnv ?? []),
  'NO_COLOR', 'FORCE_COLOR', 'VSCODE_INJECTION', 'TERM_PROGRAM', 'TERM_PROGRAM_VERSION',
]);
const SCRUB_PREFIXES = [...Object.values(PROVIDERS).flatMap((p) => p.scrubPrefixes ?? []), 'NEBULA_', 'AGENT_OFFICE_'];
const scrubbed = (k: string) => SCRUB_ENV.has(k) || SCRUB_PREFIXES.some((p) => k.startsWith(p));

/** Which of the office's variables workers get: the allowlist, unless the office was told otherwise. */
let policy: WorkerEnvConfig = CLEAN_ENV;

/** Set once as the office starts, from --worker-env and --inherit-env (see config.ts). */
export function setWorkerEnv(cfg: WorkerEnvConfig) {
  policy = cfg;
}

/** The office's environment as a worker gets it: the allowlist, minus anything that would make it think it's a nested session. */
export function childEnv(cfg: WorkerEnvConfig = policy, source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  return pickEnv(source, cfg, scrubbed);
}
