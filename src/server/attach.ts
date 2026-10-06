// `mergeline attach`: an agent you started in a terminal (Claude Code or Codex in this folder) moves
// into the inbox. It finds that agent's latest session for this folder in the CLI's own session files,
// and the running office carries the session on as one of its agents (`claude --resume <id>`, `codex
// resume <id>`, `cursor-agent --resume=<id>`), so its questions, its changes and the merge are in the
// inbox like any other agent's. The session must not be running anywhere else: quit it in its
// terminal first. Cursor keeps its chats where this can't read them, so it takes --session.
import { closeSync, existsSync, openSync, readdirSync, readSync, realpathSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { CLI, PRODUCT } from '../shared/copy.js';
import { PROVIDER_META, type AgentProvider } from '../shared/providers.js';
import { gitTop } from './checkouts.js';
import { askOffice } from './opencmd.js';

const ATTACH_HELP = `${CLI} attach - move an agent you started in a terminal into the inbox

Usage:
  ${CLI} attach [--agent claude|codex|cursor] [--session <id>] [--list] [--yes]

Run it in the folder the agent works in, after quitting the agent there
(Ctrl+C, or /exit). ${PRODUCT} carries its latest session for this folder on as one
of its agents: the same conversation, now in your inbox with its terminal,
questions, changes and the merge.

Options:
      --agent <name>      Which agent's session (default: the newest of Claude
                          Code's and Codex's for this folder)
      --session <id>      That session, instead of the newest (Cursor needs it:
                          \`cursor-agent ls\` lists them)
      --list              List this folder's sessions and exit
  -y, --yes               Don't stop to ask whether the agent was quit
      --home <dir>        The office to attach to (default ~/agent-office)
  -h, --help              Show this help
`;

/** A session of an agent CLI, found in its own files. */
export interface FoundSession {
  provider: AgentProvider;
  id: string;
  /** Last written. */
  at: number;
  /** What it was asked first, for its row in the inbox. */
  title?: string;
}

/** The first `max` bytes of a file, as lines (the last, maybe cut, dropped). */
function headLines(file: string, max = 256 * 1024): string[] {
  const fd = openSync(file, 'r');
  try {
    const buf = Buffer.alloc(max);
    const n = readSync(fd, buf, 0, max, 0);
    const lines = buf.subarray(0, n).toString('utf8').split('\n');
    if (n === max) lines.pop();
    return lines;
  } finally {
    closeSync(fd);
  }
}

function parse(line: string): Record<string, any> | undefined {
  try {
    const v = JSON.parse(line);
    return v && typeof v === 'object' ? v : undefined;
  } catch {
    return undefined;
  }
}

/** Text a person typed, from a message's content: a string, or the text parts of a list. */
function typed(content: unknown): string | undefined {
  const text = typeof content === 'string' ? content : Array.isArray(content) ? content.map((c) => (typeof c?.text === 'string' ? c.text : '')).join(' ') : '';
  const clean = text.replace(/\s+/g, ' ').trim();
  // Wrappers the CLIs put in as if typed (<command-name>, <environment_context>, ...) aren't the task.
  return clean && !clean.startsWith('<') ? clean.slice(0, 200) : undefined;
}

/** Claude Code keeps a folder's sessions in ~/.claude/projects/<the folder's path, every other character a dash>/. */
export function claudeSessions(dir: string, home = os.homedir(), env: NodeJS.ProcessEnv = process.env): FoundSession[] {
  const root = path.join(env.CLAUDE_CONFIG_DIR || path.join(home, '.claude'), 'projects', dir.replace(/[^A-Za-z0-9]/g, '-'));
  let names: string[] = [];
  try {
    names = readdirSync(root).filter((n) => /^[0-9a-f-]{36}\.jsonl$/.test(n));
  } catch {
    return [];
  }
  return names.map((n) => {
    const file = path.join(root, n);
    let title: string | undefined;
    let summary: string | undefined;
    for (const line of headLines(file)) {
      const r = parse(line);
      if (r?.type === 'summary' && typeof r.summary === 'string') summary ??= r.summary.slice(0, 200);
      if (!title && r?.type === 'user' && !r.isMeta) title = typed(r.message?.content);
      if (title && summary) break;
    }
    return { provider: 'claude' as const, id: n.slice(0, -'.jsonl'.length), at: statSync(file).mtimeMs, title: summary ?? title };
  });
}

/** Codex keeps every session in ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl, its folder in the first line. Looks back `days` days. */
export function codexSessions(dir: string, home = os.homedir(), env: NodeJS.ProcessEnv = process.env, days = 14, now = Date.now()): FoundSession[] {
  const root = path.join(env.CODEX_HOME || path.join(home, '.codex'), 'sessions');
  const out: FoundSession[] = [];
  for (let d = 0; d < days; d++) {
    const day = new Date(now - d * 86_400_000);
    const folder = path.join(root, String(day.getFullYear()), String(day.getMonth() + 1).padStart(2, '0'), String(day.getDate()).padStart(2, '0'));
    let names: string[] = [];
    try {
      names = readdirSync(folder).filter((n) => n.startsWith('rollout-') && n.endsWith('.jsonl'));
    } catch {
      continue;
    }
    for (const n of names) {
      const file = path.join(folder, n);
      const lines = headLines(file, 64 * 1024);
      const meta = parse(lines[0] ?? '');
      const payload = meta?.type === 'session_meta' ? meta.payload : meta;
      if (typeof payload?.id !== 'string' || !samePath(payload.cwd, dir)) continue;
      let title: string | undefined;
      for (const line of lines.slice(1)) {
        const r = parse(line);
        const item = r?.type === 'response_item' ? r.payload : undefined;
        if (item?.type === 'message' && item.role === 'user') title = typed(item.content);
        if (title) break;
      }
      out.push({ provider: 'codex', id: payload.id, at: statSync(file).mtimeMs, title });
    }
  }
  return out;
}

function samePath(a: unknown, b: string): boolean {
  if (typeof a !== 'string' || !a) return false;
  if (path.resolve(a) === path.resolve(b)) return true;
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return false;
  }
}

/** Every session of this folder the office can find, newest first. */
export function folderSessions(dir: string, only?: AgentProvider): FoundSession[] {
  const all = [...(only && only !== 'claude' ? [] : claudeSessions(dir)), ...(only && only !== 'codex' ? [] : codexSessions(dir))];
  return all.sort((a, b) => b.at - a.at);
}

const ago = (at: number) => {
  const min = Math.round((Date.now() - at) / 60_000);
  return min < 1 ? 'just now' : min < 60 ? `${min}m ago` : min < 48 * 60 ? `${Math.round(min / 60)}h ago` : `${Math.round(min / 1440)}d ago`;
};

/** `mergeline attach ...`: returns the exit code. */
export async function attachCommand(argv: string[]): Promise<number> {
  let agent: AgentProvider | undefined;
  let session = '';
  let list = false;
  let yes = false;
  let home: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => argv[++i] ?? '';
    if (a === '-h' || a === '--help') {
      process.stdout.write(ATTACH_HELP);
      return 0;
    } else if (a === '--agent') {
      const v = value();
      if (v !== 'claude' && v !== 'codex' && v !== 'cursor') {
        console.error(`${CLI} attach: --agent takes claude, codex or cursor`);
        return 2;
      }
      agent = v;
    } else if (a === '--session') session = value();
    else if (a === '--list') list = true;
    else if (a === '-y' || a === '--yes') yes = true;
    else if (a === '--home') home = value();
    else {
      console.error(`${CLI} attach: unknown option ${a}\n`);
      process.stderr.write(ATTACH_HELP);
      return 2;
    }
  }

  const cwd = process.cwd();
  const dir = existsSync(cwd) ? realpathSync(cwd) : cwd;
  const top = gitTop(dir);
  const found = folderSessions(dir, agent);
  if (list) {
    if (!found.length) console.log(`  No Claude Code or Codex sessions for ${dir}.`);
    for (const s of found) console.log(`  ${PROVIDER_META[s.provider].label.padEnd(12)} ${s.id}  ${ago(s.at).padEnd(9)} ${s.title ?? ''}`.trimEnd());
    return 0;
  }
  let pick: FoundSession | undefined;
  if (session) pick = found.find((s) => s.id === session) ?? { provider: agent ?? 'claude', id: session, at: Date.now() };
  else if (agent === 'cursor') {
    console.error(`${CLI} attach: Cursor keeps its chats where ${PRODUCT} can't read them. Run \`cursor-agent ls\`, then ${CLI} attach --agent cursor --session <chat id>`);
    return 2;
  } else pick = found[0];
  if (!pick) {
    const sub = top && top !== dir && folderSessions(top, agent).length ? ` (there are some for ${top}: run it there)` : '';
    console.error(`${CLI} attach: no ${agent ? PROVIDER_META[agent].label : 'Claude Code or Codex'} session for this folder${sub}. Run it in the folder the agent works in.`);
    return 1;
  }

  const label = PROVIDER_META[pick.provider].label;
  console.log(`\n  ${label} session ${pick.id.slice(0, 8)}, ${ago(pick.at)}${pick.title ? `: ${pick.title}` : ''}`);
  if (!yes && process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`  Quit it in its own terminal first (two programs on one session garble it). Done? [Y/n] `);
    rl.close();
    if (/^n/i.test(answer.trim())) return 1;
  }
  const r = await askOffice(home, '/api/local/attach', { dir, provider: pick.provider, session: pick.id, title: pick.title });
  if (!r.ok) {
    console.error(`${CLI} attach: ${r.error}`);
    return 1;
  }
  console.log(`  In your inbox now: ${String(r.data.name)} on ${String(r.data.project)}. ${r.url}\n`);
  return 0;
}
