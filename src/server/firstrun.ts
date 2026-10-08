// What the home page's setup card shows (protocol/setup.ts): the agent CLIs on this computer and
// whether each is signed in, the checkout the office was started in, and GitHub, which is optional:
// without it, review reads the local diff and Merge merges on this machine (localmerge.ts).
//
// Sign-in is read from where each CLI keeps it, without running anything: a credentials file or an
// API key in the environment. Where that can't tell (Cursor keeps its login in the keychain), it
// says nothing rather than guess.

import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AGENT_PROVIDERS, PROVIDER_META, type AgentProvider } from '../shared/providers.js';
import type { SetupAgent, SetupGithub } from '../shared/protocol.js';
import { resolveCommand } from './workers/process.js';

/** The agents the inbox is built and tested with; the others are beta. */
export const CERTIFIED: readonly AgentProvider[] = ['claude', 'codex', 'cursor'];

/** How to install each certified agent, in one line. */
const INSTALL: Partial<Record<AgentProvider, string>> = {
  claude: 'npm install -g @anthropic-ai/claude-code',
  codex: 'npm install -g @openai/codex',
  cursor: 'curl https://cursor.com/install -fsS | bash',
};

/** How to sign each one in, in one line. */
const SIGN_IN: Partial<Record<AgentProvider, string>> = {
  claude: 'claude auth login',
  codex: 'codex login',
  cursor: 'cursor-agent login',
};

const has = (env: NodeJS.ProcessEnv, ...names: string[]) => names.some((n) => !!env[n]);

function readJson(file: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** Whether a provider's CLI is signed in on this computer, from its own files; undefined when that can't be told. */
export function signedIn(provider: AgentProvider, env: NodeJS.ProcessEnv = process.env, home = os.homedir()): boolean | undefined {
  switch (provider) {
    case 'claude': {
      if (has(env, 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN')) return true;
      const dir = env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
      if (existsSync(path.join(dir, '.credentials.json'))) return true;
      // On a Mac the token is in the keychain; the account it belongs to is in .claude.json.
      const cfg = readJson(env.CLAUDE_CONFIG_DIR ? path.join(env.CLAUDE_CONFIG_DIR, '.claude.json') : path.join(home, '.claude.json'));
      return !!cfg?.oauthAccount;
    }
    case 'codex': {
      if (has(env, 'OPENAI_API_KEY', 'CODEX_API_KEY')) return true;
      return existsSync(path.join(env.CODEX_HOME || path.join(home, '.codex'), 'auth.json'));
    }
    case 'cursor':
      return has(env, 'CURSOR_API_KEY') ? true : undefined;
    default:
      return undefined;
  }
}

/**
 * The agent CLIs: the certified three always (installed or not, with the line that fixes it), and
 * the beta ones only when they're installed. `find` says where a command is on the PATH.
 */
export function checkAgents(find: (cmd: string) => string | null = resolveCommand, env: NodeJS.ProcessEnv = process.env, home = os.homedir()): SetupAgent[] {
  const out: SetupAgent[] = [];
  for (const provider of AGENT_PROVIDERS) {
    const bin = PROVIDER_META[provider].bin;
    if (provider === 'custom' || !bin) continue;
    const certified = CERTIFIED.includes(provider);
    const installed = !!find(bin);
    if (!installed && !certified) continue;
    const signed = installed ? signedIn(provider, env, home) : undefined;
    const fix = !installed ? INSTALL[provider] : signed === false ? SIGN_IN[provider] : undefined;
    out.push({ provider, certified, installed, ...(signed !== undefined ? { signedIn: signed } : {}), ...(fix ? { fix } : {}) });
  }
  return out.sort((a, b) => Number(b.certified) - Number(a.certified) || CERTIFIED.indexOf(a.provider) - CERTIFIED.indexOf(b.provider));
}

/** Who `gh` is signed in as, or why it isn't. Never asks anything. */
export function checkGithub(cwd: string, run: typeof execFile = execFile): Promise<SetupGithub> {
  return new Promise((resolve) => {
    run('gh', ['api', 'user', '--jq', '.login'], { cwd, timeout: 15_000 }, (err, stdout, stderr) => {
      const login = String(stdout ?? '').trim();
      if (!err && login) return resolve({ state: 'ok', login });
      if ((err as NodeJS.ErrnoException | null)?.code === 'ENOENT') {
        const how = process.platform === 'darwin' ? 'brew install gh' : process.platform === 'win32' ? 'winget install GitHub.cli' : 'sudo apt install gh';
        return resolve({ state: 'missing', fix: how });
      }
      const why = String(stderr || err?.message || '').trim();
      if (/auth login|not logged in|authentication|bad credentials|HTTP 401/i.test(why)) return resolve({ state: 'signed-out', fix: 'gh auth login' });
      resolve({ state: 'error', error: why.split('\n').filter(Boolean).slice(-1)[0]?.slice(0, 200) ?? 'gh failed' });
    });
  });
}
