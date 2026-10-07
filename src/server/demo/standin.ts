// The demo's stand-in agent (see script.ts): a small Node program that plays Claude Code, Codex or
// Cursor in a worker's terminal without a model. It follows its task's steps from the plan the demo
// workspace writes next to it, tells the office over that agent's own hook route what it's doing (so
// the office reads it exactly as it reads the real CLI), does real git work in its worktree so Review
// and Merge have a diff, and waits for an answer when a step asks. Everything it prints says demo.
//
// It's written out as `standin.cjs` with one sh wrapper per agent command (claude, codex,
// cursor-agent), each passing which agent it plays.

/** What each command reports as: its hook route, and its hook events' names when they differ from Claude Code's. */
export const PLAYS = {
  claude: { route: 'claude', label: 'Claude Code', events: {} as Record<string, string> },
  codex: { route: 'codex', label: 'Codex', events: {} as Record<string, string> },
  'cursor-agent': {
    route: 'cursor',
    label: 'Cursor',
    events: { SessionStart: 'sessionStart', UserPromptSubmit: 'beforeSubmitPrompt', PreToolUse: 'preToolUse', PostToolUse: 'postToolUse', Stop: 'stop' } as Record<string, string>,
  },
} as const;

/** A task's file-name slug, as the stand-in makes it for an improvised task. */
export function slugOf(task: string): string {
  return task.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'task';
}

/** The placeholders an improvised task's steps carry in the plan, filled in by the stand-in. */
export const TASK_MARK = '@@TASK@@';
export const SLUG_MARK = '@@SLUG@@';

export const STANDIN_SOURCE = String.raw`'use strict';
// [demo] Mergeline's stand-in agent: no model runs here. See src/server/demo/standin.ts.
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');
const { randomBytes } = require('crypto');

const PLAYS = ${JSON.stringify(PLAYS)};
const as = process.argv[2];
const play = PLAYS[as] || PLAYS.claude;
const task = (process.argv[process.argv.length - 1] || '').trim();
const plan = JSON.parse(fs.readFileSync(path.join(__dirname, 'plan.json'), 'utf8'));
const slug = ${slugOf.toString()};
const scripted = plan.fleet.find((a) => a.task === task);
const steps = scripted ? scripted.steps : JSON.parse(JSON.stringify(plan.improvised).split(${JSON.stringify(TASK_MARK)}).join(task.replace(/["\\\u0000-\u001f]/g, ' ')).split(${JSON.stringify(SLUG_MARK)}).join(slug(task)));
const session = randomBytes(16).toString('hex');
const dim = (s) => '\x1b[2m' + s + '\x1b[0m';
const bold = (s) => '\x1b[1m' + s + '\x1b[0m';
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
let tool = 0;

function post(event, payload) {
  const url = process.env.AGENT_OFFICE_HOOK_URL;
  if (!url || !process.env.AGENT_OFFICE_WORKER_ID) return Promise.resolve();
  const name = play.events[event] || event;
  const body = JSON.stringify(Object.assign(play.route === 'cursor' ? { conversation_id: session } : { session_id: session }, payload));
  const u = new URL(url + '/hooks/' + play.route);
  u.searchParams.set('worker', process.env.AGENT_OFFICE_WORKER_ID);
  u.searchParams.set('event', name);
  return new Promise((resolve) => {
    const req = http.request(u, { method: 'POST', timeout: 3000, headers: { authorization: 'Bearer ' + (process.env.AGENT_OFFICE_HOOK_TOKEN || ''), 'content-type': 'application/json' } }, (res) => {
      res.resume();
      res.on('end', resolve);
    });
    req.on('error', resolve);
    req.on('timeout', () => req.destroy());
    req.end(body);
  });
}

/** A tool call: "Bash: npm test" is the Bash tool on "npm test". */
async function use(line) {
  const at = line.indexOf(': ');
  const name = at > 0 ? line.slice(0, at) : line;
  const detail = at > 0 ? line.slice(at + 2) : '';
  const id = 'demo_' + ++tool;
  console.log(bold('● ' + name) + (detail ? '(' + detail + ')' : ''));
  if (play.route === 'claude') {
    const input = detail ? { [name === 'Bash' ? 'command' : 'file_path']: detail } : {};
    await post('PreToolUse', { tool_name: name, tool_input: input });
    await post('PostToolUse', { tool_name: name, tool_input: input, tool_response: { stdout: '' } });
  } else {
    await post('PreToolUse', { tool_name: line, tool_use_id: id });
    await post('PostToolUse', { tool_name: line, tool_use_id: id });
  }
}

function git(args) {
  try {
    execFileSync('git', args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function commit(message) {
  git(['add', '-A']);
  git(['-c', 'user.name=' + plan.author.name, '-c', 'user.email=' + plan.author.email, 'commit', '-q', '-m', '[demo] ' + message]);
}

// Lines typed into the terminal: an answer, or more to do once it has finished.
const lines = [];
let waiting;
let typed = '';
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  // A paste comes wrapped in bracketed-paste markers: keep the words only.
  for (const ch of chunk.replace(/\x1b\[20[01]~/g, '')) {
    if (ch === '\x03') process.exit(130);
    if (ch === '\r' || ch === '\n') {
      process.stdout.write('\r\n');
      const line = typed.trim();
      typed = '';
      if (!line) continue;
      if (waiting) {
        const w = waiting;
        waiting = undefined;
        w(line);
      } else lines.push(line);
    } else if (ch === '\x7f' || ch === '\b') {
      if (typed) {
        typed = typed.slice(0, -1);
        process.stdout.write('\b \b');
      }
    } else if (ch >= ' ') {
      typed += ch;
      process.stdout.write(ch);
    }
  }
});
const nextLine = () => (lines.length ? Promise.resolve(lines.shift()) : new Promise((r) => (waiting = r)));

async function run() {
  console.log(dim(play.label + ' (demo stand-in: no model runs here)'));
  await post('SessionStart', { source: 'startup' });
  await sleep(0.5);
  console.log(bold('> ') + task);
  await post('UserPromptSubmit', { prompt: task });
  const started = Date.now();
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    await sleep(step.after);
    if (step.tool) await use(step.tool);
    if (step.write) {
      for (const [file, text] of Object.entries(step.write)) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, text);
      }
    }
    for (const line of step.say || []) console.log('  ' + line);
    if (step.ask) {
      const id = 'demo_ask_' + ++tool;
      const ask = play.route === 'codex' ? 'request_user_input' : 'AskUserQuestion';
      console.log('');
      console.log(bold('? ' + step.ask));
      process.stdout.write(bold('> '));
      await post('PreToolUse', { tool_name: ask, tool_use_id: id, tool_input: {} });
      const answer = await nextLine();
      console.log(dim('  (answered: ' + answer + ')'));
      await post('PostToolUse', { tool_name: ask, tool_use_id: id, tool_input: {} });
    }
    if (step.finish) {
      commit(step.finish);
      for (const line of [''].concat(step.say ? [] : ['Done (demo).'])) console.log(line);
      await post('Stop', {});
      break;
    }
    // Two hours at most, then it stops by itself.
    if (step.again && Date.now() - started < 2 * 3600 * 1000) i = -1;
  }
  // More to do, typed in (a send-back note): another commit and another finish for each.
  for (;;) {
    const more = await nextLine();
    await post('UserPromptSubmit', { prompt: more });
    await sleep(3);
    fs.appendFileSync('NOTES.md', '- [demo] ' + more + '\n');
    commit(more);
    console.log('Done (demo): noted in NOTES.md.');
    await post('Stop', {});
  }
}
run().catch((err) => {
  console.error(String(err && err.stack || err));
  process.exit(1);
});
`;
