// Records the replay demo's tape (docs/demo.md#the-replay-demo): starts the hosted read-only demo
// (`--demo --read-only`, scripted agents and reviewer, no model) on a loopback port in a throwaway
// folder, and keeps what two sockets are sent until the second round starts:
//   - one watches the way a page does and asks for nothing (the tape's `stream`);
//   - one attaches to every terminal, watches every agent's changes and asks for every diff, brief
//     and log as they change (the `answers` a page's own requests are answered from).
// The Deck's city and the inbox's Signal chip are answered from the tape too, though the hosted demo
// never sends them: the recorder works out the demo project's rundown and Signal's gist of it itself,
// with the office's own code (dist/server), when the round starts and after each merge (a shipped record), and the tape's
// welcome has the Deck and Rundown labs on.
// The tape is scrubbed (scrub.mjs): the folders become the hosted demo's, and a secret-shaped string or
// a name of this computer fails the recording. Build first (npm run build). Then:
//
//   node deploy/replay/record.mjs [--port 5460] [--out deploy/replay/tape.json] [--rejected <file>]
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { leaks, scrub } from './scrub.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SERVER = path.join(ROOT, 'dist', 'server', 'server');
const { computeMap } = await import(path.join(SERVER, 'rundown', 'service.js'));
const { signalGist } = await import(path.join(SERVER, 'signal', 'gist.js'));
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const PORT = Number(arg('port', '5460'));
const OUT = path.resolve(arg('out', path.join(ROOT, 'deploy', 'replay', 'tape.json')));
/** Gives up when two rounds haven't started by then. */
const LIMIT_MS = 8 * 60 * 1000;
/** How often the looking socket asks again for the states that don't announce their changes. */
const ASK_MS = 4000;

// Who this computer is, read before the office runs with a home of its own, so none of it reaches the tape.
const gitEmail = (() => {
  try {
    return execFileSync('git', ['config', '--global', 'user.email'], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
})();
const user = os.userInfo().username;
const forbidden = [os.homedir(), user, os.hostname(), os.hostname().split('.')[0], gitEmail];

const scratch = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'kipdeck-replay-')));
const office = path.join(scratch, 'office');
const home = path.join(scratch, 'home');
mkdirSync(home, { recursive: true });

const server = spawn(process.execPath, [path.join(ROOT, 'bin', 'agent-office.js'), '--demo', '--read-only', '--home', office, '--host', '127.0.0.1', '--port', String(PORT), '--no-open'], {
  cwd: scratch,
  env: { PATH: process.env.PATH, HOME: home, TMPDIR: scratch, LANG: 'C.UTF-8', AGENT_OFFICE_NO_OPEN: '1', KIPDECK_TELEMETRY: '0' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
server.stdout.on('data', (d) => (log += d));
server.stderr.on('data', (d) => (log += d));

function stop(code, why) {
  if (why) console.error(`record: ${why}`);
  server.kill('SIGTERM');
  setTimeout(() => {
    rmSync(scratch, { recursive: true, force: true });
    process.exit(code);
  }, 1500);
}

const base = `http://localhost:${PORT}`;
async function up() {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return;
    } catch {
      // not yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`the demo didn't start:\n${log}`);
}

async function main() {
  await up();
  // In the way a visitor gets in: the home page hands out a session cookie.
  const first = await fetch(`${base}/`, { redirect: 'manual' });
  const cookie = String(first.headers.get('set-cookie') ?? '').split(';')[0];
  if (!cookie) throw new Error('the read-only demo gave no cookie');
  const headers = { cookie, origin: base };
  const whoami = await (await fetch(`${base}/api/whoami`, { headers })).json();

  const t0 = Date.now();
  const stream = [];
  const answers = [];
  let welcome;
  let rounds = [];
  const q = new URLSearchParams({ name: 'Visitor', color: '#6aa7ff', skin: '0', hair: '0', style: '0', lite: '1' });
  const open = () => new WebSocket(`ws://localhost:${PORT}/ws?${q}`, { headers });

  // The watching socket: a page that asks for nothing.
  const watch = open();
  watch.on('message', (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.t === 'welcome') return void (welcome ??= msg);
    if (msg.t === 'pong') return;
    const at = Date.now() - t0;
    stream.push({ at, msg });
    // Each round starts with an empty shipped log (server/demo/director.ts).
    if (msg.t === 'inbox.log' && msg.records.length === 0) {
      rounds.push(at);
      console.log(`record: round ${rounds.length} starts at ${(at / 1000).toFixed(1)} s`);
      if (rounds.length === 1) map();
      if (rounds.length === 2) finish();
    }
  });

  // The looking socket: everything a page could ask about, as it changes.
  const look = open();
  const seen = new Map();
  const sigs = new Map();
  let floor;
  const send = (m) => look.readyState === WebSocket.OPEN && look.send(JSON.stringify(m));
  const askStates = () => {
    for (const t of ['spend.get', 'approvals.get', 'team.get', 'inbox.log']) send({ t });
    send({ t: 'timeline.get' });
    if (floor) send({ t: 'pace.get', floor });
  };
  const workerSeen = (w) => {
    const before = seen.get(w.id);
    seen.set(w.id, w.status);
    if (before === undefined) {
      send({ t: 'worker.attach', workerId: w.id });
      send({ t: 'changes.watch', workerId: w.id });
    }
    if (before !== w.status) {
      send({ t: 'worker.worktree', workerId: w.id });
      if (w.kind === 'agent') send({ t: 'brief.get', workerId: w.id });
    }
  };
  look.on('message', (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.t === 'pong') return;
    if (msg.t === 'welcome') {
      floor = msg.floor ?? msg.floors?.[0]?.id;
      for (const w of msg.workers ?? []) workerSeen(w);
      askStates();
    }
    answers.push({ at: Date.now() - t0, msg });
    if (msg.t === 'worker.update') workerSeen(msg.worker);
    if (msg.t === 'worker.remove') seen.delete(msg.workerId);
    if (msg.t === 'inbox.record' || msg.t === 'inbox.merged') send({ t: 'inbox.log' });
    if (msg.t === 'changes') {
      for (const f of msg.state.files) {
        const key = `${msg.state.workerId}\0${f.path}`;
        if (sigs.get(key) === `${f.sig}/${msg.state.ahead}`) continue;
        sigs.set(key, `${f.sig}/${msg.state.ahead}`);
        send({ t: 'changes.diff', workerId: msg.state.workerId, path: f.path });
      }
      // A brief reads the changed files too.
      send({ t: 'brief.get', workerId: msg.state.workerId });
    }
  });
  // The demo project's map and Signal's gist of it, as the office would send them to a page watching it
  // (server/rundown/service.ts computeMap, server/signal/gist.ts), one at a time, onto the answers.
  let mapping = Promise.resolve();
  let shown;
  const map = () => {
    const def = shown?.floors?.find((f) => f.id === (shown.floor ?? shown.floors[0]?.id));
    if (!def) return;
    mapping = mapping.then(async () => {
      const floor = { id: def.id, dir: def.dir, def, workers: { list: () => [] }, github: { pulls: { fetchedAt: 0, items: [] }, issues: { fetchedAt: 0, items: [] } } };
      const { rundown } = await computeMap(floor, new Map(), Date.now());
      const gist = await signalGist({ ...floor, mission: { state: () => shown.mission }, timeline: { list: () => ({ events: [] }) } }, { ops: false, rundown: true }, Date.now(), rundown);
      const at = Date.now() - t0;
      answers.push({ at, msg: { t: 'rundown.state', floor: def.id, rundown, computing: false } }, { at, msg: { t: 'signal.gist', gist } });
    }).catch((err) => stop(1, `the demo project's rundown: ${err.message}`));
  };
  look.on('message', (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.t === 'welcome') shown = msg;
    if (msg.t === 'welcome' || msg.t === 'inbox.record') map();
  });
  const asking = setInterval(askStates, ASK_MS);
  const limit = setTimeout(() => stop(1, `two rounds didn't start in ${LIMIT_MS / 60000} minutes`), LIMIT_MS);
  for (const s of [watch, look]) s.on('error', (err) => stop(1, `socket: ${err.message}`));

  function finish() {
    clearInterval(asking);
    clearTimeout(limit);
    // A moment more for the answers asked for at the boundary, and the last map.
    setTimeout(async () => {
      await mapping;
      watch.close();
      look.close();
      const [loopFrom, loopTo] = rounds;
      // The Deck and its city are on in the replay (the hosted demo is the inbox alone).
      const labs = { ...welcome.labs, on: { ...welcome.labs.on, bridge: true, rundown: true } };
      const tape = { version: 1, recordedAt: t0, loopFrom, loopTo, welcome: { ...welcome, labs }, whoami, stream: stream.filter((e) => e.at < loopTo), answers: answers.filter((e) => e.at <= loopTo + 1000) };
      // The folders this recording ran in read as the hosted demo's (deploy/demo/Dockerfile).
      const tmp = os.tmpdir();
      const text = scrub(JSON.stringify(tape), [
        [office, '/home/demo/office'],
        [home, '/home/demo'],
        [scratch, '/home/demo'],
        [path.dirname(process.execPath), '/usr/local/bin'],
        [ROOT, '/opt/kipdeck'],
        [tmp, '/tmp'],
        [realpathSync(tmp), '/tmp'],
        [cookie.split('=')[1] ?? '', 'session'],
        // The office names who added the project by this computer's user, as the image's is `demo`.
        [user.length >= 3 ? `"${user}"` : '', '"demo"'],
      ]);
      const found = leaks(text, forbidden);
      if (found.length) {
        // --rejected <file> keeps the rejected tape on this computer, to see where it came from.
        if (arg('rejected')) writeFileSync(path.resolve(arg('rejected')), text);
        return stop(1, `not written, the tape would publish:\n  ${found.join('\n  ')}`);
      }
      writeFileSync(OUT, `${text}\n`);
      console.log(`record: ${OUT}, ${stream.length} + ${answers.length} messages, a loop of ${((loopTo - loopFrom) / 1000).toFixed(1)} s, ${(text.length / 1024).toFixed(0)} kB`);
      stop(0);
    }, 1500);
  }
}

main().catch((err) => stop(1, err.message));
