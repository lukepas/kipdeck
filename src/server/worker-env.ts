/**
 * Which of the office's environment variables its workers get. Handing every worker the whole
 * environment passes on whatever secrets the office was started with (a cloud key exported for
 * something else, a database URL), so by default workers get an allowlist: what a terminal and the
 * usual toolchains need, and the variables the agents sign in with. `--worker-env` adds names to it,
 * and `--inherit-env` goes back to passing everything (see docs/security.md).
 */

/** 'clean': the allowlist below. 'inherit': everything, as before there was one. 'sandbox': SANDBOX_ENV only. */
export type EnvPolicy = 'clean' | 'inherit' | 'sandbox';

export interface WorkerEnvConfig {
  policy: EnvPolicy;
  /** More names to let through, on top of the policy's own. A trailing * matches a prefix ("AWS_*"). */
  allow: string[];
}

/** Everything, as before there was an allowlist: --inherit-env. */
export const INHERIT_ENV: WorkerEnvConfig = { policy: 'inherit', allow: [] };
/** What a worker's environment is when nothing says otherwise: the allowlist. */
export const CLEAN_ENV: WorkerEnvConfig = { policy: 'clean', allow: [] };

/** A terminal's own variables: all a sandboxed worker gets from the office's environment unless told. */
export const SANDBOX_ENV = ['TERM', 'COLORTERM', 'LANG', 'LANGUAGE', 'LC_*', 'TZ'];

/** What a terminal, a login shell and the usual toolchains need on this machine. */
export const HOST_ENV = [
  ...SANDBOX_ENV,
  'PATH', 'HOME', 'USER', 'LOGNAME', 'USERNAME', 'SHELL', 'TMPDIR', 'TMP', 'TEMP',
  'EDITOR', 'VISUAL', 'PAGER', 'LESS', 'DISPLAY', 'WAYLAND_DISPLAY', 'XAUTHORITY', 'XDG_*', 'DBUS_SESSION_BUS_ADDRESS',
  'SSH_AUTH_SOCK', 'SSH_AGENT_PID', 'SSH_ASKPASS', 'GPG_TTY', 'GNUPGHOME', '__CF_USER_TEXT_ENCODING',
  // Proxies and extra certificate authorities, without which nothing reaches the network.
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'ALL_PROXY', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'REQUESTS_CA_BUNDLE',
  // Version managers and toolchains a login shell sets up.
  'NVM_*', 'VOLTA_HOME', 'ASDF_*', 'MISE_*', 'PNPM_HOME', 'BUN_INSTALL', 'DENO_INSTALL', 'GOPATH', 'GOROOT', 'CARGO_HOME',
  'RUSTUP_HOME', 'JAVA_HOME', 'PYENV_ROOT', 'HOMEBREW_*', 'MANPATH', 'INFOPATH', 'NPM_CONFIG_PREFIX',
  'FNM_*', 'COREPACK_HOME', 'RBENV_ROOT', 'GEM_HOME', 'GEM_PATH', 'VIRTUAL_ENV', 'CONDA_*', 'ANDROID_HOME', 'ANDROID_SDK_ROOT', 'DOTNET_ROOT',
  // Windows keeps its own folders and shell in these.
  'SYSTEMROOT', 'SYSTEMDRIVE', 'WINDIR', 'COMSPEC', 'PATHEXT', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH',
  'PROGRAMFILES', 'PROGRAMFILES(X86)', 'PROGRAMW6432', 'PROGRAMDATA', 'ALLUSERSPROFILE', 'COMMONPROGRAMFILES', 'COMMONPROGRAMFILES(X86)',
  'PUBLIC', 'OS', 'PROCESSOR_ARCHITECTURE', 'NUMBER_OF_PROCESSORS',
];

/** What the agents and git sign in with: a worker on the office's own sign-ins needs them. */
export const AGENT_ENV = [
  // Claude Code's own settings (CLAUDE_CODE_USE_BEDROCK, CLAUDE_CODE_MAX_OUTPUT_TOKENS ...); the ones a
  // parent session sets are scrubbed separately (workers.ts scrubbed).
  'ANTHROPIC_*', 'CLAUDE_CONFIG_DIR', 'CLAUDE_CODE_*', 'DISABLE_AUTOUPDATER', 'DISABLE_TELEMETRY', 'DISABLE_ERROR_REPORTING', 'MAX_THINKING_TOKENS',
  'OPENAI_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_ORG_ID', 'OPENAI_PROJECT_ID', 'CODEX_HOME', 'OPENCODE_*', 'XAI_API_KEY', 'GROK_HOME', 'DEEPSEEK_API_KEY',
  // The providers OpenCode is most often pointed at.
  'OPENROUTER_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'GROQ_API_KEY', 'MISTRAL_API_KEY',
  // The other agents the office runs: Grok, Muse, Pi and dsh keep their homes and settings in these.
  'XAI_*', 'GROK_*', 'MUSE_*', 'PI_*', 'DSH_*',
  'GH_TOKEN', 'GITHUB_TOKEN', 'GH_HOST', 'GH_CONFIG_DIR', 'GIT_AUTHOR_*', 'GIT_COMMITTER_*', 'GIT_SSH_COMMAND', 'GIT_SSH', 'GIT_ASKPASS', 'GIT_CONFIG_GLOBAL',
];

/**
 * What Claude Code on a cloud provider signs in with, passed only when the office's environment
 * turns that provider on: AWS_* for everyone would hand every worker the office's AWS keys.
 */
export const CLOUD_ENV: { when: string; names: string[] }[] = [
  { when: 'CLAUDE_CODE_USE_BEDROCK', names: ['AWS_*'] },
  { when: 'CLAUDE_CODE_USE_VERTEX', names: ['CLOUD_ML_REGION', 'VERTEX_REGION_*', 'GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_CLOUD_PROJECT', 'GCLOUD_PROJECT', 'CLOUDSDK_*'] },
];

/** Whether an environment value turns something on (CLAUDE_CODE_USE_BEDROCK=1, not =0 or empty). */
function on(v: string | undefined): boolean {
  return !!v && v !== '0' && v.toLowerCase() !== 'false';
}

/** A name `--worker-env` takes: a variable's name, optionally ending in * for a prefix. */
export function validEnvPattern(p: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_()]*\*?$/.test(p);
}

/** Splits "A,B C" (the way AGENT_OFFICE_WORKER_ENV and --worker-env take them) into names. */
export function splitEnvNames(s: string): string[] {
  return s.split(/[\s,]+/).filter(Boolean);
}

/** Whether `name` is one of `patterns`. Case doesn't matter: Windows spells PATH as Path. */
export function envAllowed(name: string, patterns: readonly string[]): boolean {
  const n = name.toUpperCase();
  return patterns.some((p) => {
    const u = p.toUpperCase();
    return u.endsWith('*') ? n.startsWith(u.slice(0, -1)) : n === u;
  });
}

/** The names a policy lets through from `source`, before `allow`. Undefined: every name. */
export function policyNames(policy: EnvPolicy, source: NodeJS.ProcessEnv = {}): readonly string[] | undefined {
  if (policy === 'inherit') return undefined;
  if (policy === 'sandbox') return SANDBOX_ENV;
  return [...HOST_ENV, ...AGENT_ENV, ...CLOUD_ENV.filter((c) => on(source[c.when])).flatMap((c) => c.names)];
}

/** The variables of `source` a worker gets under `cfg`, minus whatever `drop` says to leave out. */
export function pickEnv(source: NodeJS.ProcessEnv, cfg: WorkerEnvConfig, drop: (name: string) => boolean = () => false): Record<string, string> {
  const names = policyNames(cfg.policy, source);
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(source)) {
    if (v === undefined || drop(k)) continue;
    if (names && !envAllowed(k, names) && !envAllowed(k, cfg.allow)) continue;
    env[k] = v;
  }
  return env;
}
