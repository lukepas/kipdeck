// `mergeline open`: opens the running office in this computer's browser, signed in, with a new
// sign-in link that works once. For a lost tab, a closed browser or an expired sign-in, so nobody on
// their own computer ever needs a password. It asks the office with its local key (see local.ts).
import { openBrowser } from './browser.js';
import { CLI, PRODUCT } from '../shared/copy.js';
import { LOCAL_KEY_HEADER, officeDataDir, readLocalFile } from './local.js';

const OPEN_HELP = `${CLI} open - open the running ${PRODUCT} in your browser, signed in

Usage:
  ${CLI} open [--print] [--home <dir>]

Asks the ${PRODUCT} running on this computer for a sign-in link that works once
and opens it. --print prints the link instead.

Options:
      --print             Print the link, don't open a browser
      --home <dir>        The office to open (default ~/agent-office, env AGENT_OFFICE_HOME)
  -h, --help              Show this help
`;

/** What a command on this computer asks the running office: its answer, or why there is none. */
export async function askOffice(home: string | undefined, route: string, body: unknown = {}): Promise<{ ok: true; url: string; data: Record<string, unknown> } | { ok: false; error: string }> {
  const dataDir = officeDataDir(home);
  const local = readLocalFile(dataDir);
  const notRunning = `${PRODUCT} isn't running here. Start it with \`npx ${CLI}\`.`;
  if (!local) return { ok: false, error: notRunning };
  let res: Response;
  try {
    res = await fetch(new URL(route, local.api), { method: 'POST', headers: { 'content-type': 'application/json', [LOCAL_KEY_HEADER]: local.key }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
  } catch {
    return { ok: false, error: notRunning };
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) return { ok: false, error: typeof data.error === 'string' ? data.error : `The office answered ${res.status}` };
  return { ok: true, url: local.url, data };
}

/** `mergeline open ...`: returns the exit code. */
export async function openCommand(argv: string[]): Promise<number> {
  let print = false;
  let home: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') {
      process.stdout.write(OPEN_HELP);
      return 0;
    } else if (a === '--print') print = true;
    else if (a === '--home' && argv[i + 1]) home = argv[++i];
    else {
      console.error(`${CLI} open: unknown option ${a}\n`);
      process.stderr.write(OPEN_HELP);
      return 2;
    }
  }
  const r = await askOffice(home, '/api/local/link');
  if (!r.ok) {
    console.error(`${CLI} open: ${r.error}`);
    return 1;
  }
  const link = new URL(String(r.data.link), r.url).href;
  if (!print && openBrowser(link)) console.log(`  Opened ${PRODUCT} in your browser, signed in.`);
  else console.log(`  Sign in (the link works once): ${link}`);
  return 0;
}
