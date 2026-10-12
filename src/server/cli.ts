// Only what's needed to pick a command or say "Starting Kipdeck..." loads before it is said: the
// rest (the server and everything under it) takes a second or more to load on its own.
import { CLI, PRODUCT } from '../shared/copy.js';
import { commandOf } from './commands.js';
import { STARTING, addressLines, block, startsOffice, step } from './startup.js';

const argv = process.argv.slice(2);
// `kipdeck prune`, `kipdeck rundown` and the rest (commands.ts): run it and stop, no office.
const command = commandOf(argv);
if (command) process.exit(await command(argv.slice(1)));
if (startsOffice(argv)) console.log(`\n  ${STARTING}`);

const os = (await import('node:os')).default;
const path = (await import('node:path')).default;
const { loadConfig, ensureSelfSigned } = await import('./config.js');
const { startServer } = await import('./server.js');
const { openBrowser } = await import('./browser.js');
const { loopbackName, passwordless, removeLocalFile, writeLocalFile } = await import('./local.js');
const { freePort } = await import('./port.js');
const { gitTop, within } = await import('./checkouts.js');
const { checkAgentsAsync } = await import('./firstrun.js');
const { PROVIDER_META } = await import('../shared/providers.js');
const { officeCommand } = await import('./runcmd.js');

const cfg = loadConfig(argv);
await ensureSelfSigned(cfg);
// Started inside a git checkout (with no [dir]): that's where you work. The office's own home isn't.
const top = cfg.project || cfg.demo ? undefined : gitTop(process.cwd());
if (top && !within(cfg.dir, top)) cfg.startedIn = top;
// The demo: scripted agents on a throwaway repository of its own (demo/).
if (cfg.demo) {
  step("Setting up the demo's throwaway repository...");
  const { setUpDemo } = await import('./demo/index.js');
  const ws = setUpDemo(cfg);
  if (typeof ws === 'string') {
    console.error(`${CLI}: --demo: ${ws}`);
    process.exit(2);
  }
}
const { interactive } = await import('./setup.js');
const atTerminal = interactive();
// Nobody named a port: 4600, or the next free one, so another office (or anything else) there never
// stops this one from starting.
if (!cfg.portGiven) cfg.port = (await freePort(cfg.host, cfg.port)) || cfg.port;

let office: Awaited<ReturnType<typeof startServer>>;
step(cfg.demo ? 'Opening the demo project...' : 'Opening your projects...');
try {
  office = await startServer(cfg);
} catch (err) {
  const e = err as NodeJS.ErrnoException;
  if (e.code === 'EADDRINUSE') console.error(`${CLI}: port ${cfg.port} is already in use (try another --port)`);
  else console.error(`${CLI}: ${e.message}`);
  process.exit(1);
}

const scheme = cfg.tls ? 'https' : 'http';
const everywhere = cfg.host === '0.0.0.0' || cfg.host === '::';
const loopback = loopbackName(cfg.host);
// Where this machine's browser finds the office: localhost, unless it's bound to one other address.
const here = `${scheme}://${everywhere || loopback ? 'localhost' : cfg.host}:${cfg.port}`;
const urls = new Set<string>([here]);
if (everywhere) {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list ?? []) if (ni.family === 'IPv4' && !ni.internal) urls.add(`${scheme}://${ni.address}:${cfg.port}`);
  }
}
// What commands on this computer (`kipdeck open`, `kipdeck attach`) need to reach it.
const api = `${scheme}://${everywhere ? '127.0.0.1' : cfg.host.includes(':') ? `[${cfg.host}]` : cfg.host}:${cfg.port}`;
writeLocalFile(cfg.dataDir, here, api, cfg.secret);

let closing = false;
// SIGTERM is a restart (tsx watch reloading, a plain `kill`, systemd): workers keep running in their
// terminal host and the next office picks them back up. Ctrl+C closes the office and stops them.
// (Under systemd that needs KillMode=process, or stopping the service stops the host with it; see
// deploy/provision.sh. Workers cut off that way are resumed and carry on.)
const stop = (signal: NodeJS.Signals) => {
  if (closing) process.exit(1);
  closing = true;
  // The demo's agents never outlive it: its home goes with it (demo/index.ts).
  const keep = signal === 'SIGTERM' && !cfg.demo;
  console.log(keep ? `\n  closing ${PRODUCT} - agents keep running for the next start...` : `\n  closing ${PRODUCT}...`);
  removeLocalFile(cfg.dataDir);
  office.shutdown(keep);
  setTimeout(() => {
    if (cfg.demo) void import('./demo/index.js').then((d) => d.removeDemoHome(cfg)).finally(() => process.exit(0));
    else process.exit(0);
  }, 300);
};
// Last line of defense: one bad request must never take down every running worker.
process.on('unhandledRejection', (err) => console.error(`${CLI}: unhandled rejection`, err));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

// The command that gets a new sign-in link, as it can be typed here: `kipdeck` is on the PATH only
// after npm link, so it's often node and this install's path, with --home for an office elsewhere.
const openCmd = officeCommand('open', cfg.dir);

function passwordLine() {
  if (!office.accounts.sharedPassword) return `off - everyone signs in with their own account (${officeCommand('accounts', cfg.dir)})`;
  if (!cfg.passwordGenerated) return '(from --password / AGENT_OFFICE_PASSWORD)';
  if (cfg.claimToken && !cfg.claimed) return 'shown exactly once to whoever opens the claim link (/claim?t=...)';
  if (cfg.claimed || !cfg.password) return '(already claimed - never shown again; reset with --reset-password)';
  return cfg.password;
}

// A link that signs this computer's browser in once, opened there, so there's no password to copy.
// Not for an office that's claimed from a link (deploy/provision.sh) or signed in to with accounts only.
let signIn = '';
let opened = false;
if (office.accounts.sharedPassword && !cfg.claimToken && (atTerminal || loopback)) {
  signIn = here + office.signInLink();
  if (cfg.open && atTerminal) opened = openBrowser(signIn);
}
const noPassword = passwordless(cfg);

const floors = office.floors();
const here_ = (dir: string) => [cfg.project, cfg.startedIn].some((d) => d && path.resolve(dir) === path.resolve(d));
const projectLine = floors.length
  ? floors.map((f) => `${f.def.name}${here_(f.def.dir) ? ' (this folder)' : ''}`).join(', ')
  : `none yet - add one in the browser${cfg.startedIn ? '' : ' (start inside a git repository to use it)'}`;
// The address and the way in first: finding the agent CLIs can take seconds (a login shell each).
console.log(block(addressLines({ urls: [...urls], signIn, opened, openCmd })));
if (!cfg.demo) step('Looking for agent CLIs...');
const agents = cfg.demo ? [] : await checkAgentsAsync();
const usable = agents.filter((a) => a.installed && a.signedIn !== false);
const agentsLine = usable.length
  ? usable.map((a) => PROVIDER_META[a.provider].label).join(', ')
  : agents.some((a) => a.installed)
    ? 'found, but not signed in - the browser says how'
    : `none found - install Claude Code, Codex or Cursor (e.g. ${agents.find((a) => a.provider === 'claude')?.fix ?? 'npm install -g @anthropic-ai/claude-code'})`;

const demoLines = cfg.demo
  ? [
      cfg.demo.readOnly ? '  Demo, read only: visitors are signed in to watch; a scripted reviewer answers and merges.' : '  Demo: five scripted agents on a throwaway repository. No model runs and your code is not touched.',
      `  project   ${cfg.demo.workspace?.repo ?? ''}${cfg.demo.temp ? ' (deleted when you stop it)' : ''}`,
    ]
  : [`  project   ${projectLine}`, `  agents    ${agentsLine}`];
const lines = [
  '',
  ...demoLines,
  noPassword || cfg.demo?.readOnly ? '' : `  password  ${passwordLine()}`,
  '',
  loopback ? '  Only this computer can reach it (--host 0.0.0.0 lets your network in). Ctrl+C stops it.' : '  Ctrl+C stops it.',
  cfg.tls || loopback ? '' : '  Tip: voice and screen share need https off localhost: use a reverse proxy or --self-signed.',
  '',
];
console.log(block(lines));

