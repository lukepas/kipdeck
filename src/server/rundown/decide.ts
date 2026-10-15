// `kipdeck decide "question" --options A,B --default A`: an agent asks a person to decide something,
// and goes on with the default meanwhile. Inside Kipdeck (an agent it started, with its hook address
// and token in the environment) the ask goes to the office (POST /office/decide, decide-hook.ts),
// which writes it into the project's .rundown/decisions.md with the agent's name, shows it in Needs
// you, and later sends the answer back into the agent's session. Anywhere else it is written straight
// into the decisions.md of the checkout it runs in, for the next /rundown and Kipdeck to pick up.

import { execFileSync } from 'node:child_process';
import http from 'node:http';
import { CLI } from '../../shared/copy.js';
import { readAsk, type DecisionAsk } from '../../shared/rundown/answer.js';
import { raiseInFile } from './answer.js';
import { excludeOutput } from './cli.js';

export const DECIDE_HELP = `${CLI} decide - ask a person to make a call

Usage:
  ${CLI} decide "<question>" --options <A,B[,C...]> [--default <A>] [--part <id>]

Adds the question to the project's .rundown/decisions.md as an open decision.
Go on with the default meanwhile, and say in your summary what you assumed.

Run by an agent inside Kipdeck, it shows in the inbox's Needs you with Keep
default and Choose..., and the answer comes back as a message in the agent's
session. Run anywhere else, it is written into the checkout of the current folder.

Options:
      --options <A,B>   Two to six choices, separated by commas
      --default <A>     The one you go on with until someone answers (default:
                        the first option)
      --part <id>       The part of the project map it is about
  -h, --help            Show this help
`;

export type DecideArgs = { cmd: 'help' } | { cmd: 'error'; error: string } | { cmd: 'ask'; ask: DecisionAsk };

/** What `kipdeck decide ...` asks for. */
export function parseDecideArgs(argv: readonly string[]): DecideArgs {
  if (!argv.length || argv.some((a) => a === '-h' || a === '--help')) return { cmd: 'help' };
  const words: string[] = [];
  const o: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const eq = /^--(options|default|part)=(.*)$/s.exec(a);
    if (eq) o[eq[1]] = eq[2];
    else if (a === '--options' || a === '--default' || a === '--part') {
      const v = argv[++i];
      if (v === undefined) return { cmd: 'error', error: `${a} needs a value` };
      o[a.slice(2)] = v;
    } else if (a.startsWith('-')) return { cmd: 'error', error: `unknown option ${a}` };
    else words.push(a);
  }
  const ask = readAsk({ question: words.join(' '), options: o.options ?? '', default: o.default, partId: o.part });
  return typeof ask === 'string' ? { cmd: 'error', error: ask } : { cmd: 'ask', ask };
}

/** The office this agent runs in, from the environment Kipdeck starts its agents with. */
export function officeOf(env: NodeJS.ProcessEnv): { url: URL; token: string } | null {
  const base = env.AGENT_OFFICE_HOOK_URL;
  const worker = env.AGENT_OFFICE_WORKER_ID;
  const token = env.AGENT_OFFICE_HOOK_TOKEN;
  if (!base || !worker || !token) return null;
  try {
    const url = new URL('/office/decide', base);
    url.searchParams.set('worker', worker);
    return { url, token };
  } catch {
    return null;
  }
}

function post(url: URL, token: string, body: object): Promise<{ status: number; json: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(url, { method: 'POST', timeout: 10_000, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => (text += c));
      res.on('end', () => {
        let json: Record<string, unknown> = {};
        try {
          json = JSON.parse(text || '{}') as Record<string, unknown>;
        } catch {
          // not JSON: the status says enough
        }
        resolve({ status: res.statusCode ?? 0, json });
      });
    });
    req.on('timeout', () => req.destroy(new Error('Kipdeck did not answer in 10 seconds')));
    req.on('error', reject);
    req.end(data);
  });
}

/** The git top of `dir`, or `dir` outside a repository. */
function topOf(dir: string): string {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || dir;
  } catch {
    return dir;
  }
}

export async function decideCommand(argv: string[], env = process.env, cwd = process.cwd(), out = console.log, err = console.error): Promise<number> {
  const a = parseDecideArgs(argv);
  if (a.cmd === 'help') return (out(DECIDE_HELP), 0);
  if (a.cmd === 'error') return (err(`${CLI} decide: ${a.error}\n\nSee ${CLI} decide --help`), 2);
  const office = officeOf(env);
  if (office) {
    try {
      const r = await post(office.url, office.token, a.ask);
      if (r.status !== 200) return (err(`${CLI} decide: ${typeof r.json.error === 'string' ? r.json.error : `Kipdeck said ${r.status}`}`), 1);
      out(`Raised ${String(r.json.id)} on ${String(r.json.project)}. Go on with the default (${a.ask.default}) for now; the answer comes back as a message in this session.`);
      return 0;
    } catch (e) {
      return (err(`${CLI} decide: couldn't reach Kipdeck: ${e instanceof Error ? e.message : String(e)}`), 1);
    }
  }
  const root = topOf(cwd);
  const raised = raiseInFile(root, a.ask);
  if ('error' in raised) return (err(`${CLI} decide: ${raised.error}`), 1);
  await excludeOutput(root).catch(() => {});
  out(`Raised ${raised.id} in ${raised.file}. Go on with the default (${a.ask.default}) for now.`);
  return 0;
}
