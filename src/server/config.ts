import { randomBytes, scryptSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { AGENT_PROVIDERS, PROVIDER_META } from '../shared/providers.js';
import { MAX_WORKER_LIMIT, parseWorkerLimit } from './machine.js';
import { parseAllowedHosts } from './hosts.js';
import { splitEnvNames, validEnvPattern, type WorkerEnvConfig } from './worker-env.js';
import { readStateJson, stateDirProblem, untrustedState, writeState } from './safefs.js';
import { CHAIN_HELP, chainFlagsFromEnv, takeChainFlag, type ChainFlags } from './chain/flags.js';
import { parseLabList, type LabId } from '../shared/labs.js';
import { commandLineLabs } from './labs.js';
import { telemetryForbidden } from './telemetry.js';
import { brandEnv } from './brandenv.js';
import { freshDemoHome, type DemoWorkspace } from './demo/workspace.js';

export interface Config {
  /** The office's own folder: the building's data lives in its .agent-office. */
  dir: string;
  dataDir: string;
  /** Where new floors are cloned by default, as <projectsDir>/<owner>/<repo>. */
  projectsDir: string;
  /** --projects / AGENT_OFFICE_PROJECTS: picks the projects folder, as Settings in the office does. */
  projects?: string;
  /** Started as `agent-office <dir>`: that checkout is a floor of its own (it's also `dir`). */
  project?: string;
  /** Started from a terminal (with no [dir]) inside a git checkout: its top (cli.ts). The first project of a new office, and the setup card's suggestion. */
  startedIn?: string;
  host: string;
  port: number;
  /** --port or PORT named the port: it's that one or nothing. Otherwise the next free one from 4600 will do. */
  portGiven: boolean;
  /** Open the office in a browser, signed in, when it's started in a terminal (--no-open: don't). */
  open: boolean;
  /** Plaintext password, only when known: from --password, or generated and not yet claimed. */
  password?: string;
  passwordGenerated: boolean;
  /** scrypt(password, salt): what logins are checked against and sessions are keyed on. */
  verifier: Buffer;
  salt: Buffer;
  secret: string;
  /** One-time token that lets the first visitor see the generated password (then never again). */
  claimToken?: string;
  claimed: boolean;
  /** Forget the plaintext password for good once it has been shown. */
  markClaimed(): void;
  agentCmd: string;
  agentArgs: string[];
  /** The DSH profile a DeepSeek Harness worker boots (`--dsh-profile`, default "acp"). */
  dshProfile: string;
  tls?: { cert: string; key: string };
  trustProxy: boolean;
  /** More names the office is reached at, besides localhost, this machine's and the public host (see hosts.ts). */
  allowedHosts: string[];
  /** Which of the office's variables workers get: an allowlist unless --inherit-env (see worker-env.ts). */
  workerEnv: WorkerEnvConfig;
  iceServers: RTCIceServerLike[];
  /** How to run the script that deployed the office, e.g. "deploy/azure.sh --name team2" (set by deploy/provision.sh), for the commands it suggests. */
  deployScript?: string;
  /** Address teammates SSH-tunnel to (set by deploy/provision.sh); enables invites from the office. */
  publicHost?: string;
  /** The office's name on a Tailscale network, e.g. agent-office.tail1234.ts.net (set by deploy/provision.sh --tailscale). */
  tailnet?: string;
  /** Daily tracked Claude Code spend budget, USD. OpenCode/Codex/Grok/Muse spend is excluded. */

  budget?: number;
  /** Refuse new hires for the rest of the day once the budget is spent. */
  budgetPause: boolean;
  /** The most workers the office runs at once, across every floor; Settings can't go past it. */
  maxWorkers?: number;
  /** Slack / Discord webhook to post to when a worker needs input, finishes or gets stuck ('' turns it off). */
  webhook?: string;
  /** Paid tasks over x402 and proof-of-merge attestations, testnets only (see chain/flags.ts). */
  chain: ChainFlags;
  /** Labs held on from the command line (--labs, AGENT_OFFICE_LABS; a chain flag holds proof on). See labs.ts. */
  labs: LabId[];
  /** Labs held off from the command line (--labs -proof, --labs none, or the same in AGENT_OFFICE_LABS). */
  labsOff: LabId[];
  /** Anonymous usage numbers (telemetry.ts): off unless turned on; `forbidden` keeps them off for good. */
  telemetry: { forced: boolean; forbidden?: string; endpoint?: string };
  /** --demo: scripted agents on a throwaway repository (see demo/): `readOnly` the hosted demo, `temp` a home deleted on exit, its workspace once made. */
  demo?: { readOnly: boolean; temp: boolean; workspace?: DemoWorkspace };
}

export interface RTCIceServerLike {
  urls: string | string[];
  username?: string;
  credential?: string;
}

const HELP = `kipdeck - the inbox for your AI coding agents (${AGENT_PROVIDERS.filter((p) => p !== 'custom').map((p) => PROVIDER_META[p].name).join(' / ')}).
(Built on agent-office, MIT. The agent-office command still works.)

Usage:
  kipdeck [options]
  kipdeck [dir] [options]
  kipdeck --demo [--read-only]
  kipdeck open [--print]
  kipdeck attach [--agent claude|codex|cursor] [--session <id>] [--list]
  kipdeck setup [--projects <dir>] [--project <owner/repo>]...
  kipdeck prune [dir] [--dry-run] [--force]
  kipdeck accounts [list|invite|revoke|role|password] ...
  kipdeck tunnel [office@address | url]

Runs the inbox for your coding agents, at http://localhost:4600 (or the next
free port). Each project is a git checkout, and every agent works on a branch of
its own in a worktree of it. Projects come from the folder you start it in, or
from GitHub (cloned with your \`gh\` login into the projects folder).

Started inside a git repository, that repository is its first project. The
browser's setup card does the rest: which agents are installed, GitHub (optional).

Started from anywhere, the office keeps its data in --home. Given a [dir] (or
started in a project where an office already ran), it keeps its data in
<dir>/.agent-office as it always has, and that project starts out as a floor
(an admin can take it off in the elevator like any other).

Commands:
  open                    Open the running office in your browser, signed in
                          (a new sign-in link; see open --help)
  attach                  Move an agent you started in a terminal (Claude Code,
                          Codex, Cursor) into the inbox: its session carries on
                          as one of the office's agents (see attach --help)
  setup                   Pick the folder projects are cloned into and clone
                          projects as floors: a walkthrough in a terminal, or
                          just --projects / --project for scripts (see setup --help)
  prune                   Remove leftover worker worktrees (.agent-office/worktrees/)
                          and their office/* branches. Anything with uncommitted
                          changes or unpushed commits is kept unless --force is given.
  accounts                Invite, list and revoke people's own accounts, and switch
                          the shared password off or on (see accounts --help)
  tunnel                  On your own computer, for an office that runs somewhere
                          else: every web server a worker starts there opens on the
                          same port here, by itself (see tunnel --help)

Options:
      --home <dir>        Where the office keeps its data when no [dir] is given
                          (default ~/agent-office, env AGENT_OFFICE_HOME)
      --projects <dir>    Where new floors are cloned, as <dir>/<owner>/<repo>
                          (default ~/agent-office, env AGENT_OFFICE_PROJECTS).
                          Also settable from Settings in the office
  -p, --port <n>          Port to listen on (env PORT). Without it, 4600 or the
                          next free port after it
  -H, --host <addr>       Address to bind (default 127.0.0.1: only this machine).
                          0.0.0.0 lets other computers on your network in
      --password <pw>     Office password (env AGENT_OFFICE_PASSWORD).
                          Without one, a random password is generated once and
                          saved in <dir>/.agent-office/config.json
      --claim-token <t>   Show the generated password exactly once, at /claim?t=<t>
                          (env AGENT_OFFICE_CLAIM_TOKEN). After that only a hash
                          is kept and the password is never displayed again.
      --reset-password    Forget the generated password (a new one is made on the
                          next start) and exit
      --no-open           Don't open the office in your browser when it starts
                          (env AGENT_OFFICE_NO_OPEN=1)
      --agent <cmd>       Default agent command (default "claude", env AGENT_OFFICE_AGENT)
      --agent-args <str>  Extra args for the configured agent, e.g. "--model opus"
                          Workers can also run Codex or Cursor, and in beta OpenCode,
                          Grok, Muse Code, DeepSeek Harness or Pi (picked in the UI)
      --dsh-profile <n>   DeepSeek Harness profile for its workers, over the ACP
                          server (default "acp", env AGENT_OFFICE_DSH_PROFILE)
      --tls-cert <file>   Serve HTTPS with this certificate (PEM)
      --tls-key <file>    ...and this private key (PEM)
      --self-signed       Serve HTTPS with a generated self-signed certificate
      --trust-proxy       Trust X-Forwarded-* headers (behind Caddy/nginx)
      --allowed-host <n>  Another name the office is reached at (repeatable; env
                          AGENT_OFFICE_ALLOWED_HOSTS, comma separated). It answers
                          to IP addresses, localhost, this machine's name and the
                          public host already; ".example.com" allows every name under it
      --worker-env <names>
                          More of the office's environment variables to pass to
                          workers, comma separated, a trailing * for a prefix
                          ("AWS_PROFILE,SENTRY_*"; repeatable; env
                          AGENT_OFFICE_WORKER_ENV). Workers get an allowlist
                          by default: what a terminal, the usual toolchains and
                          the agents' sign-ins need
      --inherit-env       Pass workers the office's whole environment instead
                          (env AGENT_OFFICE_INHERIT_ENV=1)
      --turn <url>        Add a TURN server for voice (repeatable), e.g.
                          turn:user:pass@turn.example.com:3478 (env
                          AGENT_OFFICE_TURN, several separated by spaces)
      --budget <usd>      Daily budget for tracked Claude Code spend (env
                          AGENT_OFFICE_BUDGET). Everyone is warned when the
                          day's spend passes it. OpenCode/Codex/Grok/Muse spend is excluded
      --budget-pause      ...and no new workers can be hired until the next
                          day (env AGENT_OFFICE_BUDGET_PAUSE=1)
      --max-workers <n>   Run at most this many workers at once, across every
                          floor (env AGENT_OFFICE_MAX_WORKERS). Hiring past it
                          is refused. Admins can lower the limit from 
                          Settings, but not raise it past this
      --webhook <url>     Post to this Slack or Discord webhook when a worker
                          needs input, finishes or gets stuck (env AGENT_OFFICE_WEBHOOK).
                          Also settable from Settings in the office; "" turns it off
      --labs <names>      Hold labs on so admins can't switch them off (env AGENT_OFFICE_LABS):
                          boards, bridge (the Deck), ops, meetings, voice, ambience,
                          proof, or all. All are on by default. A leading minus holds
                          one off instead (--labs -proof,-voice), and none holds all off
      --telemetry         Share anonymous usage numbers (env KIPDECK_TELEMETRY=1):
                          minutes to the first agent, answer and merge, and
                          minutes agents wait in Needs you. Off by default; the
                          setup card turns it on or off. See docs/security.md
      --no-telemetry      Never share them (also DO_NOT_TRACK=1)
      --demo              Five scripted agents on a throwaway repository: no
                          agent CLI, sign-in or model needed (env KIPDECK_DEMO=1)
      --read-only         With --demo, the hosted demo: visitors only watch and a
                          scripted reviewer acts (KIPDECK_DEMO=read-only)
${CHAIN_HELP}  -h, --help              Show this help

Started in a terminal, it opens in your browser already signed in, with a link
that works once; \`kipdeck open\` makes a new one. On this computer there is no
password to type. Only this machine can reach it unless you pass --host, and then
the password (or people's own accounts) is how everyone else signs in.
To run it on a server for your team, see deploy/provision.sh.

Voice and screen sharing need a secure context: use https (a reverse proxy,
--tls-cert/--tls-key or --self-signed) unless everyone is on localhost.
`;

function takeValue(args: string[], i: number, flag: string): string {
  const v = args[i + 1];
  if (v === undefined || v.startsWith('--')) {
    console.error(`agent-office: ${flag} needs a value`);
    process.exit(2);
  }
  return v;
}

function splitArgs(s: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

function parseTurn(url: string): RTCIceServerLike {
  // turn:user:pass@host:port  ->  { urls: 'turn:host:port', username, credential }
  const m = /^(turns?):([^:@]+):([^@]+)@(.+)$/.exec(url);
  if (m) return { urls: `${m[1]}:${m[4]}`, username: decodeURIComponent(m[2]), credential: decodeURIComponent(m[3]) };
  return { urls: url };
}

/** Where the office lives when it isn't started in a project: ~/agent-office, or $AGENT_OFFICE_HOME. */
export function officeHome(): string {
  return path.resolve(process.env.AGENT_OFFICE_HOME || path.join(os.homedir(), 'agent-office'));
}

/** Keep the office's own data (or another `entry` it writes into the project) out of git without touching the project's .gitignore. */
export function excludeFromGit(dir: string, entry = '.agent-office/') {
  try {
    const gitDir = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const exclude = path.resolve(dir, gitDir, 'info', 'exclude');
    const cur = existsSync(exclude) ? readFileSync(exclude, 'utf8') : '';
    if (!cur.split('\n').some((l) => l.trim() === entry || l.trim() === entry.replace(/\/$/, ''))) {
      mkdirSync(path.dirname(exclude), { recursive: true });
      appendFileSync(exclude, `${cur && !cur.endsWith('\n') ? '\n' : ''}${entry}\n`);
    }
  } catch {
    // not a git repo; nothing to exclude
  }
}

export function loadConfig(argv: string[]): Config {
  let project = '';
  let home = officeHome();
  let homeGiven = !!process.env.AGENT_OFFICE_HOME;
  let projects = process.env.AGENT_OFFICE_PROJECTS ? path.resolve(process.env.AGENT_OFFICE_PROJECTS) : '';
  let port = Number(process.env.PORT) || 4600;
  let portGiven = !!Number(process.env.PORT);
  // Loopback unless asked: an office lets whoever signs in run commands on this machine.
  let host = '127.0.0.1';
  let open = !process.env.AGENT_OFFICE_NO_OPEN || process.env.AGENT_OFFICE_NO_OPEN === '0';
  let password = process.env.AGENT_OFFICE_PASSWORD || '';
  let agentCmd = process.env.AGENT_OFFICE_AGENT || 'claude';
  let agentArgs: string[] = splitArgs(process.env.AGENT_OFFICE_AGENT_ARGS || '');
  let dshProfile = process.env.AGENT_OFFICE_DSH_PROFILE || 'acp';
  let tlsCert = '';
  let tlsKey = '';
  let selfSigned = false;
  let trustProxy = false;
  const allowedHosts = parseAllowedHosts(process.env.AGENT_OFFICE_ALLOWED_HOSTS);
  const workerEnvAllow = splitEnvNames(process.env.AGENT_OFFICE_WORKER_ENV || '');
  let inheritEnv = !!process.env.AGENT_OFFICE_INHERIT_ENV && process.env.AGENT_OFFICE_INHERIT_ENV !== '0';
  let claimToken = process.env.AGENT_OFFICE_CLAIM_TOKEN || '';
  let resetPassword = false;
  let budget = process.env.AGENT_OFFICE_BUDGET || '';
  let budgetPause = !!process.env.AGENT_OFFICE_BUDGET_PAUSE && process.env.AGENT_OFFICE_BUDGET_PAUSE !== '0';
  let maxWorkers = process.env.AGENT_OFFICE_MAX_WORKERS || '';
  let webhook = process.env.AGENT_OFFICE_WEBHOOK;
  const chain = chainFlagsFromEnv();
  const labs = parseLabList(process.env.AGENT_OFFICE_LABS);
  const demoEnv = brandEnv('DEMO');
  let demo = !!demoEnv && demoEnv !== '0';
  let readOnly = demoEnv === 'read-only';
  const iceServers: RTCIceServerLike[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  // A container can't take --turn (deploy/container/compose.yaml), so the TURN servers come from the environment too.
  for (const url of (process.env.AGENT_OFFICE_TURN ?? '').split(/\s+/).filter(Boolean)) iceServers.push(parseTurn(url));

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '-h':
      case '--help':
        process.stdout.write(HELP);
        process.exit(0);
      case '-p':
      case '--port':
        port = Number(takeValue(argv, i++, a));
        portGiven = true;
        break;
      case '-H':
      case '--host':
        host = takeValue(argv, i++, a);
        break;
      case '--password':
        password = takeValue(argv, i++, a);
        break;
      case '--agent':
        agentCmd = takeValue(argv, i++, a);
        break;
      case '--agent-args':
        // Its value is flags itself ("--model opus"), so a leading -- doesn't mean the value is missing.
        if (argv[i + 1] === undefined) takeValue(argv, i, a);
        agentArgs = splitArgs(argv[++i]);
        break;
      case '--dsh-profile':
        dshProfile = takeValue(argv, i++, a);
        break;
      case '--tls-cert':
        tlsCert = takeValue(argv, i++, a);
        break;
      case '--tls-key':
        tlsKey = takeValue(argv, i++, a);
        break;
      case '--self-signed':
        selfSigned = true;
        break;
      case '--trust-proxy':
        trustProxy = true;
        break;
      case '--worker-env':
        workerEnvAllow.push(...splitEnvNames(takeValue(argv, i++, a)));
        break;
      case '--inherit-env':
        inheritEnv = true;
        break;
      case '--allowed-host':
        allowedHosts.push(...parseAllowedHosts(takeValue(argv, i++, a)));
        break;
      case '--claim-token':
        claimToken = takeValue(argv, i++, a);
        break;
      case '--reset-password':
        resetPassword = true;
        break;
      case '--no-open':
        open = false;
        break;
      case '--turn':
        iceServers.push(parseTurn(takeValue(argv, i++, a)));
        break;
      case '--budget':
        budget = takeValue(argv, i++, a);
        break;
      case '--budget-pause':
        budgetPause = true;
        break;
      case '--max-workers':
        maxWorkers = takeValue(argv, i++, a);
        break;
      case '--webhook':
        webhook = takeValue(argv, i++, a);
        break;
      case '--home':
        home = path.resolve(takeValue(argv, i++, a));
        homeGiven = true;
        break;
      case '--projects':
        projects = path.resolve(takeValue(argv, i++, a));
        break;
      case '--demo':
        demo = true;
        break;
      case '--read-only':
        readOnly = true;
        break;
      case '--telemetry':
      case '--no-telemetry':
        // Read with the environment below (telemetryForbidden).
        break;
      case '--labs': {
        const more = parseLabList(takeValue(argv, i++, a));
        labs.on.push(...more.on);
        labs.off.push(...more.off);
        labs.unknown.push(...more.unknown);
        break;
      }
      default: {
        const used = takeChainFlag(chain, argv, i);
        if (typeof used === 'string') {
          console.error(`agent-office: ${used}`);
          process.exit(2);
        }
        if (used) {
          i += used - 1;
          break;
        }
        if (a.startsWith('-')) {
          console.error(`agent-office: unknown option ${a}\n`);
          process.stderr.write(HELP);
          process.exit(2);
        }
        project = path.resolve(a);
      }
    }
  }

  if (readOnly && !demo) {
    console.error('agent-office: --read-only goes with --demo (the hosted demo)');
    process.exit(2);
  }
  // The demo never touches a project of yours: a throwaway home of its own unless one is given.
  if (demo && project) {
    console.error('agent-office: --demo makes a throwaway project of its own: start it without a [dir]');
    process.exit(2);
  }
  if (demo && !homeGiven) home = freshDemoHome();
  // An office already runs in this project (started here before there were floors): carry on with
  // it, its workers and its password, rather than open an empty building somewhere else.
  const cwd = process.cwd();
  if (!project && !demo && !homeGiven && cwd !== home && existsSync(path.join(cwd, '.agent-office', 'config.json'))) project = cwd;
  if (project && !existsSync(project)) {
    console.error(`agent-office: directory not found: ${project}`);
    process.exit(2);
  }
  const dir = project || home;
  // New floors go next to the office's data when it has a home of its own, and never into a project.
  const projectsDir = project ? path.join(os.homedir(), 'agent-office') : home;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    console.error('agent-office: invalid --port');
    process.exit(2);
  }
  const budgetUsd = budget ? Number(budget.replace(/^\$/, '')) : undefined;
  if (budgetUsd !== undefined && !(budgetUsd > 0)) {
    console.error('agent-office: --budget needs an amount in dollars, e.g. --budget 20');
    process.exit(2);
  }
  const workerLimit = maxWorkers ? parseWorkerLimit(maxWorkers) : undefined;
  if (maxWorkers && workerLimit === undefined) {
    console.error(`agent-office: --max-workers needs a whole number from 1 to ${MAX_WORKER_LIMIT}, e.g. --max-workers 6`);
    process.exit(2);
  }

  const badEnv = workerEnvAllow.find((n) => !validEnvPattern(n));
  if (badEnv) {
    console.error(`agent-office: --worker-env takes variable names (a trailing * for a prefix), not "${badEnv}"`);
    process.exit(2);
  }

  const dataDir = path.join(dir, '.agent-office');
  // In a project, .agent-office is the checkout's: whatever the repository ships there isn't the office's.
  const unsafe = stateDirProblem(dir);
  if (unsafe) {
    console.error(`agent-office: ${unsafe}`);
    process.exit(2);
  }
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  if (project) excludeFromGit(dir);

  const cfgPath = path.join(dataDir, 'config.json');
  // A config.json the repository ships would carry a password and session secret someone else knows.
  const shipped = existsSync(cfgPath) ? untrustedState(cfgPath) : undefined;
  if (shipped) {
    console.error(`agent-office: refusing ${cfgPath}: ${shipped}. Take it out of the repository and start again.`);
    process.exit(2);
  }
  let stored: { password?: string; verifier?: string; salt?: string; secret?: string; claimedAt?: number } = {};
  try {
    stored = readStateJson(cfgPath) ?? {};
  } catch {
    // first run
  }
  const save = () => writeState(cfgPath, JSON.stringify(stored, null, 2));
  if (!stored.secret) stored.secret = randomBytes(32).toString('hex');
  if (!stored.salt) stored.salt = randomBytes(16).toString('hex');
  const salt = Buffer.from(stored.salt, 'hex');
  const hash = (pw: string) => scryptSync(pw, salt, 32);

  if (resetPassword) {
    delete stored.password;
    delete stored.verifier;
    delete stored.claimedAt;
    save();
    console.log('agent-office: password forgotten - a new one is generated on the next start');
    process.exit(0);
  }

  let verifier: Buffer;
  let passwordGenerated = false;
  if (password) {
    verifier = hash(password);
  } else {
    passwordGenerated = true;
    if (stored.verifier) {
      verifier = Buffer.from(stored.verifier, 'hex');
      password = stored.password ?? '';
    } else {
      // New password (or a legacy plaintext one): keep the plaintext only until it's been shown.
      password = stored.password ?? randomBytes(9).toString('base64url');
      stored.password = password;
      verifier = hash(password);
      stored.verifier = verifier.toString('hex');
      delete stored.claimedAt;
    }
  }
  save();

  let tls: Config['tls'];
  if (tlsCert || tlsKey) {
    if (!tlsCert || !tlsKey) {
      console.error('agent-office: --tls-cert and --tls-key go together');
      process.exit(2);
    }
    tls = { cert: readFileSync(tlsCert, 'utf8'), key: readFileSync(tlsKey, 'utf8') };
  } else if (selfSigned) {
    tls = { cert: '', key: '' }; // filled in by ensureSelfSigned()
  }

  return {
    dir,
    dataDir,
    projectsDir,
    projects: projects || undefined,
    project: project || undefined,
    host,
    port,
    portGiven,
    open,
    password: password || undefined,
    passwordGenerated,
    verifier,
    salt,
    secret: stored.secret,
    claimToken: claimToken || undefined,
    claimed: !!stored.claimedAt,
    markClaimed() {
      stored.claimedAt = Date.now();
      delete stored.password;
      save();
      this.claimed = true;
      this.password = undefined;
    },
    agentCmd,
    agentArgs,
    dshProfile: dshProfile.trim() || 'acp',
    tls,
    trustProxy,
    allowedHosts,
    workerEnv: { policy: inheritEnv ? 'inherit' : 'clean', allow: workerEnvAllow },
    iceServers,
    deployScript: process.env.AGENT_OFFICE_DEPLOY_SCRIPT || undefined,
    publicHost: process.env.AGENT_OFFICE_PUBLIC_HOST || undefined,
    tailnet: process.env.AGENT_OFFICE_TAILSCALE_HOST?.toLowerCase().replace(/\.$/, '') || undefined,
    budget: budgetUsd,
    budgetPause,
    maxWorkers: workerLimit,
    webhook,
    chain,
    ...commandLineLabs(labs, chain),
    ...(demo ? { demo: { readOnly, temp: !homeGiven } } : {}),
    telemetry: {
      forced: !demo && (argv.includes('--telemetry') || brandEnv('TELEMETRY') === '1'),
      forbidden: demo ? 'off in the demo' : telemetryForbidden(process.env, argv),
      endpoint: brandEnv('TELEMETRY_URL') || undefined,
    },
  };
}

export async function ensureSelfSigned(cfg: Config): Promise<void> {
  if (!cfg.tls || cfg.tls.cert) return;
  const certPath = path.join(cfg.dataDir, 'tls-cert.pem');
  const keyPath = path.join(cfg.dataDir, 'tls-key.pem');
  if (existsSync(certPath) && existsSync(keyPath)) {
    cfg.tls = { cert: readFileSync(certPath, 'utf8'), key: readFileSync(keyPath, 'utf8') };
    return;
  }
  const selfsigned = await import('selfsigned');
  const gen = (selfsigned as any).generate ?? (selfsigned as any).default?.generate;
  const pems = await gen([{ name: 'commonName', value: 'agent-office' }], { days: 825, keySize: 2048 });
  writeState(certPath, pems.cert);
  writeState(keyPath, pems.private);
  cfg.tls = { cert: pems.cert, key: pems.private };
}
