// The replay demo's socket (docs/demo.md#the-replay-demo): the same face as net.ts, but nothing is
// live behind it. vite.replay.config.ts puts this file in net.ts's place in the home page's build, so
// the inbox runs unchanged on a recorded round of the hosted demo (tape.json, src/shared/replay.ts):
// the stream plays in real time and loops, the page's requests (a terminal, a diff, a brief, the log)
// are answered from the tape as it stood at that moment, and anything that would change something gets
// the read-only demo's toast. Every recorded time is moved to now, so the waits read as they did.
// The few HTTP calls the page makes are answered here too, and there is no service worker.
// The Deck (bridge.html, at /deck) is built with this socket as well, so the 3D view plays the same
// round, with the project's city over the mission table; on a phone it goes to the inbox instead.
import type { ClientMsg, ServerMsg } from '../../shared/protocol';
import { READ_ONLY_ALLOWS, READ_ONLY_QUIET, READ_ONLY_REFUSAL } from '../../shared/demo';
import { isDeckPath } from '../../shared/deck';
import { Follows, REPLAY_ALSO_ANSWERS, answer, isPhone, shiftTimes, tapePosition, type Tape } from '../../shared/replay';
import type { Profile, Spot } from '../state';

export { loginUrl } from '../net';

/** Where the tape is, next to the page. */
const TAPE_URL = 'replay/tape.json';
/** How often the player looks for what's due. */
const TICK_MS = 100;
/** The least time between two read-only toasts. */
const TOLD_GAP_MS = 4000;

type Handler = (msg: ServerMsg) => void;

// The Deck on a phone: the inbox is the demo there, before the 3D starts loading.
if ((isDeckPath(location.pathname) || location.pathname.endsWith('/bridge.html')) && isPhone({ coarse: matchMedia('(pointer: coarse)').matches, width: innerWidth, height: innerHeight })) location.replace('/');

let tape: Promise<Tape> | undefined;
const loadTape = () => (tape ??= fetch(TAPE_URL, { cache: 'no-cache' }).then((r) => (r.ok ? (r.json() as Promise<Tape>) : Promise.reject(new Error(`tape: ${r.status}`)))));

// The page's HTTP calls: who you are comes from the tape, and nothing else has an office to reach.
const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url, location.href);
  if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return realFetch(input, init);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  if (url.pathname === '/api/whoami') return json((await loadTape()).whoami);
  return json({ error: READ_ONLY_REFUSAL }, (init?.method ?? 'GET').toUpperCase() === 'GET' ? 404 : 403);
};
// No service worker: a static page has no pushes to receive, and a cached tape would go stale.
if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.reject(new Error('not in the replay demo'));

export class Net {
  private handlers: Handler[] = [];
  private statusHandlers: ((up: boolean) => void)[] = [];
  private follows = new Follows();
  private streamed = new Set<string>();
  private tape?: Tape;
  /** When the page connected (performance.now) and its wall-clock time. */
  private t0 = 0;
  private wall0 = 0;
  /** How far each list has been played, in the current pass. */
  private pass = -1;
  private nextStream = 0;
  private nextAnswer = 0;
  private toldAt = -Infinity;
  up = false;

  constructor(
    _profile: () => Profile,
    _where: () => Spot | null,
    _lite = false,
  ) {}

  onMessage(h: Handler) {
    this.handlers.push(h);
  }

  onStatus(h: (up: boolean) => void) {
    this.statusHandlers.push(h);
  }

  connect() {
    void loadTape().then(
      (t) => {
        this.tape = t;
        for (const e of t.stream) this.streamed.add(e.msg.t);
        this.t0 = performance.now();
        this.wall0 = Date.now();
        this.up = true;
        this.statusHandlers.forEach((h) => h(true));
        const welcome = shiftTimes(t.welcome, this.wall0 - t.recordedAt, t);
        if (welcome.t === 'welcome' && welcome.demo) welcome.demo = { ...welcome.demo, replay: true };
        this.emit(welcome);
        this.tick();
        setInterval(() => this.tick(), TICK_MS);
      },
      () => this.statusHandlers.forEach((h) => h(false)),
    );
  }

  expectRestart() {}

  send(msg: ClientMsg) {
    const t = this.tape;
    if (!t) return;
    if (msg.t === 'ping') return this.emit({ t: 'pong', at: msg.at, now: Date.now() });
    if (!READ_ONLY_ALLOWS.has(msg.t) && !REPLAY_ALSO_ANSWERS.has(msg.t)) {
      if (READ_ONLY_QUIET.has(msg.t)) return;
      const now = performance.now();
      if (now - this.toldAt < TOLD_GAP_MS) return;
      this.toldAt = now;
      return this.emit({ t: 'toast', text: READ_ONLY_REFUSAL, level: 'warn' });
    }
    this.follows.note(msg);
    const pos = this.position();
    for (const m of answer(t, msg, pos.at)) this.emit(shiftTimes(m, pos.delta, t));
  }

  /** Where on the tape the page is now, and how far its times move. */
  private position() {
    const t = this.tape!;
    const p = tapePosition(t, performance.now() - this.t0);
    // A tape time `at` in this pass happened at wall0 + began + (at - start).
    return { ...p, delta: this.wall0 + p.began - p.start - t.recordedAt };
  }

  /** Plays what's due: the stream, and the answers to what the page follows. */
  private tick() {
    const t = this.tape!;
    const pos = this.position();
    if (pos.pass !== this.pass) {
      this.pass = pos.pass;
      this.nextStream = t.stream.findIndex((e) => e.at >= pos.start);
      this.nextAnswer = t.answers.findIndex((e) => e.at >= pos.start);
      if (this.nextStream < 0) this.nextStream = t.stream.length;
      if (this.nextAnswer < 0) this.nextAnswer = t.answers.length;
    }
    while (this.nextStream < t.stream.length && t.stream[this.nextStream].at <= pos.at) this.emit(shiftTimes(t.stream[this.nextStream++].msg, pos.delta, t));
    while (this.nextAnswer < t.answers.length && t.answers[this.nextAnswer].at <= pos.at) {
      const m = t.answers[this.nextAnswer++].msg;
      if (this.follows.wants(m, this.streamed)) this.emit(shiftTimes(m, pos.delta, t));
    }
  }

  private emit(msg: ServerMsg) {
    for (const h of this.handlers) h(msg);
  }
}
