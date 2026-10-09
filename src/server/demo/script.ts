// The demo's script (see shared/demo.ts): the throwaway repository, the five agents and what each does
// second by second, and, for the hosted demo, when the scripted reviewer answers and merges. It's
// data, so the stand-in agents (standin.ts) and the director (director.ts) only follow it, and the
// tests read it directly. Every file it writes says it's demo data.
import type { AgentProvider } from '../../shared/providers.js';

/** The throwaway project, as its folder and floor are named. */
export const DEMO_PROJECT = 'acme-shop';
/** Who the stand-ins commit as. */
export const DEMO_AUTHOR = { name: 'demo agent', email: 'demo-agent@example.invalid' };

/**
 * One thing an agent does, `after` seconds after the step before it. A `tool` is reported to the
 * office as a tool call (its activity line); `say` is printed in its terminal; `write` puts files in
 * its worktree; `ask` asks the person and waits for a line typed back (or one digit, with `choices`); `finish` commits everything
 * with that message and ends its turn (To review); `again` starts its steps over (it never finishes).
 */
export interface DemoStep {
  after: number;
  tool?: string;
  say?: string[];
  write?: Record<string, string>;
  ask?: string;
  /** The numbered choices under `ask`, so the question card offers a button for each; one digit picks one. */
  choices?: string[];
  finish?: string;
  again?: true;
}

export interface DemoAgent {
  /** How the director and the tests name it. */
  key: string;
  provider: Extract<AgentProvider, 'claude' | 'codex' | 'cursor'>;
  deskId: string;
  /** Its task: the prompt it's started with, and how its stand-in finds these steps. */
  task: string;
  steps: DemoStep[];
  /**
   * Its first wait on the person (a question, or a change to review) shown as already this many
   * minutes old: display data, so a demo that has run for a minute still shows the deck's ranking and
   * wait tones (fresh, aging past 5 minutes, stale past 30) as a real team's morning would. The demo's
   * own labels still say it's a demo.
   */
  waited?: number;
}

const LOGIN = `// [demo] acme-shop's login route: made up for the Kipdeck demo.
import { findUser, checkPassword, startSession } from './users.js';

export async function login(req, res) {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password, please' });
  const user = await findUser(email);
  if (!user || !(await checkPassword(user, password))) {
    return res.status(401).json({ error: 'Wrong email or password' });
  }
  const session = await startSession(user);
  res.cookie('session', session.id, { httpOnly: true, sameSite: 'lax' });
  return res.json({ ok: true });
}
`;

const LOGIN_LIMITED = `// [demo] acme-shop's login route: made up for the Kipdeck demo.
import { findUser, checkPassword, startSession } from './users.js';
import { rateLimit } from './rate-limit.js';

/** Five tries a minute for each address and each email, whichever runs out first. */
const tries = rateLimit({ max: 5, windowMs: 60_000 });

export async function login(req, res) {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password, please' });
  const wait = tries.take(req.ip) ?? tries.take(String(email).toLowerCase());
  if (wait) {
    res.set('Retry-After', String(Math.ceil(wait / 1000)));
    return res.status(429).json({ error: 'Too many tries. Wait a minute and try again.' });
  }
  const user = await findUser(email);
  if (!user || !(await checkPassword(user, password))) {
    return res.status(401).json({ error: 'Wrong email or password' });
  }
  tries.forget(req.ip);
  tries.forget(String(email).toLowerCase());
  const session = await startSession(user);
  res.cookie('session', session.id, { httpOnly: true, sameSite: 'lax' });
  return res.json({ ok: true });
}
`;

const RATE_LIMIT = `// [demo] A fixed-window rate limiter, in memory: written by a stand-in agent for the Kipdeck demo.

/**
 * At most \`max\` takes per key in each window of \`windowMs\`. \`take(key)\` says how many
 * milliseconds to wait when the key has none left, and nothing when it may go ahead.
 */
export function rateLimit({ max, windowMs, now = Date.now }) {
  const windows = new Map();
  return {
    take(key) {
      const t = now();
      const w = windows.get(key);
      if (!w || t - w.start >= windowMs) {
        windows.set(key, { start: t, used: 1 });
        return undefined;
      }
      if (w.used < max) {
        w.used++;
        return undefined;
      }
      return w.start + windowMs - t;
    },
    forget(key) {
      windows.delete(key);
    },
    /** Drops windows that are over, so the map doesn't grow without end. */
    sweep() {
      const t = now();
      for (const [key, w] of windows) if (t - w.start >= windowMs) windows.delete(key);
    },
  };
}
`;

const RATE_LIMIT_TEST = `// [demo] Tests for the rate limiter: written by a stand-in agent for the Kipdeck demo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rateLimit } from './rate-limit.js';

test('five tries, then a wait until the window is over', () => {
  let t = 0;
  const limit = rateLimit({ max: 5, windowMs: 60_000, now: () => t });
  for (let i = 0; i < 5; i++) assert.equal(limit.take('1.2.3.4'), undefined);
  assert.equal(limit.take('1.2.3.4'), 60_000);
  t = 60_000;
  assert.equal(limit.take('1.2.3.4'), undefined);
});

test('each key has its own window', () => {
  const limit = rateLimit({ max: 1, windowMs: 1000, now: () => 0 });
  assert.equal(limit.take('a'), undefined);
  assert.equal(limit.take('b'), undefined);
  assert.equal(limit.take('a'), 1000);
});

test('forget starts a key over', () => {
  const limit = rateLimit({ max: 1, windowMs: 1000, now: () => 0 });
  limit.take('a');
  limit.forget('a');
  assert.equal(limit.take('a'), undefined);
});
`;

const CHECKOUT_TEST = `// [demo] acme-shop's checkout test: made up for the Kipdeck demo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderCheckout } from './checkout.js';

test('checkout shows the total', async () => {
  const page = await renderCheckout({ items: [{ price: 1200 }, { price: 800 }] });
  // Flaky: .total is drawn twice, and the first one is still empty.
  assert.equal(page.query('.total').text, '$20.00');
});
`;

const CHECKOUT_TEST_FIXED = `// [demo] acme-shop's checkout test: made up for the Kipdeck demo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderCheckout } from './checkout.js';

test('checkout shows the total', async () => {
  const page = await renderCheckout({ items: [{ price: 1200 }, { price: 800 }] });
  // The total once it's drawn, by its role rather than a class that is drawn twice.
  const total = await page.waitFor('[data-role="order-total"]');
  assert.equal(total.text, '$20.00');
});
`;

const CHECKOUT = `// [demo] acme-shop's checkout page: made up for the Kipdeck demo.
export async function renderCheckout({ items }) {
  const cents = items.reduce((sum, item) => sum + item.price, 0);
  return page([
    { selector: '.total', text: '' },
    { selector: '.total', role: 'order-total', text: '$' + (cents / 100).toFixed(2) },
  ]);
}

function page(nodes) {
  return {
    query: (selector) => nodes.find((n) => n.selector === selector),
    waitFor: async (selector) => nodes.find((n) => selector === '[data-role="' + n.role + '"]'),
  };
}
`;

const README = `# acme-shop (demo)

A made-up shop for the Kipdeck demo: an API in \`api/\`, a web front end in \`web/\` and docs in \`docs/\`.
Nothing here runs anywhere; it's here so the demo's agents have something to change.
`;

const README_DONE = `# acme-shop (demo)

A made-up shop for the Kipdeck demo: an API in \`api/\`, a web front end in \`web/\` and docs in \`docs/\`.
Nothing here runs anywhere; it's here so the demo's agents have something to change.

## Quickstart

\`\`\`bash
npm install
npm test
npm start            # the API on http://localhost:3000
\`\`\`

More in [docs/quickstart.md](docs/quickstart.md).
`;

const QUICKSTART = `# Quickstart (demo)

Written by a stand-in agent for the Kipdeck demo.

1. Install Node.js 20 or newer.
2. \`npm install\` in the repository.
3. \`npm test\` runs every test in \`api/\` and \`web/\` with Node's own test runner.
4. \`npm start\` serves the API on http://localhost:3000. Sign in at \`POST /api/login\` with
   \`{ "email": "ada@example.invalid", "password": "demo" }\`.
5. The web front end is plain modules in \`web/\`: open \`web/index.html\` in a browser.

Tests that touch the network are skipped unless \`ACME_LIVE=1\` is set.
`;

/** The throwaway repository's files, committed once as its first commit. */
export const SEED_FILES: Record<string, string> = {
  'README.md': README,
  'package.json': `${JSON.stringify({ name: 'acme-shop-demo', private: true, description: '[demo] Made up for the Kipdeck demo', type: 'module', scripts: { test: 'node --test', start: 'node api/server.js' } }, null, 2)}\n`,
  'api/login.js': LOGIN,
  'api/server.js': `// [demo] acme-shop's API server: made up for the Kipdeck demo.\nimport { login } from './login.js';\n\nexport const routes = { 'POST /api/login': login };\n`,
  'api/payments.js': `// [demo] acme-shop's payments: made up for the Kipdeck demo.\nimport { Payments } from 'acme-pay-sdk';\n\nexport const payments = new Payments({ version: '4.2' });\n`,
  'web/checkout.js': CHECKOUT,
  'web/checkout.test.js': CHECKOUT_TEST,
  'web/settings.js': `// [demo] acme-shop's settings page: made up for the Kipdeck demo.\nexport function settingsForm(user) {\n  return { name: user.name, email: user.email };\n}\n`,
  'docs/quickstart.md': '# Quickstart (demo)\n\nTODO\n',
};

const TESTS_PASS = ['', '> acme-shop-demo test', '> node --test', '', '# tests 9', '# pass 9', '# fail 0'];

/** The fleet: one asks a question at about 0:20, one finishes with a diff at about 0:35, one at about 0:50, two keep working. */
export const FLEET: DemoAgent[] = [
  {
    key: 'rate-limit',
    provider: 'claude',
    deskId: 'desk-2',
    task: 'Add rate limiting to /api/login',
    waited: 41,
    steps: [
      { after: 2, tool: 'Read: api/login.js', say: ['Reading api/login.js and how sessions start.'] },
      { after: 4, tool: 'Grep: rateLimit', say: ['No rate limiter in the repository yet: writing a small one.'] },
      { after: 6, tool: 'Write: api/rate-limit.js', write: { 'api/rate-limit.js': RATE_LIMIT } },
      { after: 5, tool: 'Edit: api/login.js', write: { 'api/login.js': LOGIN_LIMITED }, say: ['Five tries a minute per address and per email, then 429 with Retry-After.'] },
      { after: 5, tool: 'Write: api/rate-limit.test.js', write: { 'api/rate-limit.test.js': RATE_LIMIT_TEST } },
      { after: 5, tool: 'Bash: npm test', say: TESTS_PASS },
      { after: 5, finish: 'Rate limit POST /api/login: five tries a minute per address and per email', say: ['Done: 3 files, tests pass. Ready for review.'] },
    ],
  },
  {
    key: 'flaky-test',
    provider: 'codex',
    deskId: 'desk-1',
    task: 'Fix the flaky checkout test',
    waited: 12,
    steps: [
      { after: 3, tool: 'Read: web/checkout.test.js' },
      { after: 5, tool: 'Bash: npm test -- web', say: ['', 'not ok 1 - checkout shows the total', '  # failed 2 of 5 runs: .total was empty'] },
      { after: 5, tool: 'Read: web/checkout.js', say: ['.total is drawn twice and the first one is empty while the order loads.'] },
      { after: 5, ask: 'The total is empty while the order loads. How should I fix the test?', choices: ['Fix the selector', 'Update the snapshot'] },
      { after: 4, tool: 'Edit: web/checkout.test.js', write: { 'web/checkout.test.js': CHECKOUT_TEST_FIXED } },
      { after: 5, tool: 'Bash: npm test -- web --repeat 5', say: ['', 'ok 1 - checkout shows the total (5 of 5 runs)'] },
      { after: 4, finish: 'Checkout test waits for the order total by its role, not the first .total', say: ['Done: the test passed 5 runs out of 5.'] },
    ],
  },
  {
    key: 'readme',
    provider: 'cursor',
    deskId: 'desk-5',
    task: 'Write the README quickstart',
    waited: 3,
    steps: [
      { after: 3, tool: 'Read: README.md' },
      { after: 6, tool: 'Read: package.json', say: ['Scripts: test (node --test) and start (api/server.js).'] },
      { after: 15, tool: 'Write: docs/quickstart.md', write: { 'docs/quickstart.md': QUICKSTART } },
      { after: 12, tool: 'Edit: README.md', write: { 'README.md': README_DONE } },
      { after: 12, finish: 'README quickstart and docs/quickstart.md', say: ['Done: a quickstart in the README and the full one in docs/.'] },
    ],
  },
  {
    key: 'sdk',
    provider: 'claude',
    deskId: 'desk-6',
    task: 'Upgrade the payment SDK to v5',
    steps: [
      { after: 3, tool: 'Read: api/payments.js' },
      { after: 9, tool: 'Bash: npm outdated acme-pay-sdk', say: ['acme-pay-sdk  4.2.0  5.1.0  (demo)'] },
      { after: 12, tool: 'WebFetch: acme-pay-sdk v5 migration guide' },
      { after: 14, tool: 'Edit: api/payments.js' },
      { after: 15, tool: 'Bash: npm test', say: ['# tests 9', '# pass 9'] },
      { after: 12, again: true },
    ],
  },
  {
    key: 'settings',
    provider: 'codex',
    deskId: 'desk-9',
    task: 'Port the settings page to the form kit',
    steps: [
      { after: 4, tool: 'Read: web/settings.js' },
      { after: 11, tool: 'Search: form kit usages' },
      { after: 13, tool: 'Edit: web/settings.js' },
      { after: 12, tool: 'Bash: npm test -- web', say: ['# tests 4', '# pass 4'] },
      { after: 14, again: true },
    ],
  },
];

/**
 * What a stand-in does with a task that isn't in the script (one deployed from the Deploy sheet): a
 * short note, committed. The plan carries it with placeholders for the task and its slug (standin.ts).
 */
export function improvised(task: string, slug: string): DemoStep[] {
  return [
    { after: 2, tool: 'Read: README.md' },
    { after: 5, tool: `Write: notes/${slug}.md`, write: { [`notes/${slug}.md`]: `# ${task}\n\n[demo] A stand-in agent's note for this task: no model ran, so this is all it wrote.\n` } },
    { after: 5, tool: 'Bash: npm test', say: TESTS_PASS },
    { after: 4, finish: task, say: ['Done (demo): a note in notes/. Ready for review.'] },
  ];
}

/**
 * The hosted demo's scripted reviewer: what it does to which agent once that agent has been in
 * `when` for `wait` seconds. It answers the question and merges the three finished changes, in the
 * order they come up.
 */
export interface DemoReview {
  key: string;
  when: 'needs_input' | 'done';
  wait: number;
  answer?: string;
  merge?: true;
}

export const REVIEWS: DemoReview[] = [
  { key: 'flaky-test', when: 'needs_input', wait: 10, answer: '1' },
  { key: 'rate-limit', when: 'done', wait: 12, merge: true },
  { key: 'readme', when: 'done', wait: 10, merge: true },
  { key: 'flaky-test', when: 'done', wait: 10, merge: true },
];

/** After the last merge the inbox stays as it is this long (seconds), then the fleet starts over. */
export const HOLD_S = 25;
/** A round never lasts longer than this (seconds), whatever got stuck. */
export const ROUND_MAX_S = 300;

/** Where each scripted agent is, as the director sees it: its status and since when (ms). */
export interface SeenAgent {
  status: string;
  since: number;
}

/**
 * The reviews due at `now` (ms): each in REVIEWS order, once the one before it for the same agent
 * is done, when its agent has been in its state for its wait (shorter at a faster `pace`). `done`
 * holds the indexes of reviews already made.
 */
export function dueReviews(now: number, seen: ReadonlyMap<string, SeenAgent>, done: ReadonlySet<number>, pace = 1): number[] {
  const out: number[] = [];
  const blocked = new Set<string>();
  REVIEWS.forEach((r, i) => {
    if (done.has(i)) return;
    if (blocked.has(r.key)) return;
    blocked.add(r.key);
    const s = seen.get(r.key);
    if (s && s.status === r.when && now - s.since >= (r.wait * 1000) / pace) out.push(i);
  });
  return out;
}

/** Whether the round is over: every review made and HOLD_S since the last, or ROUND_MAX_S since it began (both shorter at a faster `pace`). */
export function roundOver(now: number, startedAt: number, done: ReadonlySet<number>, lastAt: number, pace = 1): boolean {
  if (now - startedAt >= (ROUND_MAX_S * 1000) / pace) return true;
  return done.size === REVIEWS.length && now - lastAt >= (HOLD_S * 1000) / pace;
}

/**
 * When `agent`'s wait should be dated from (DemoAgent.waited minutes back), the first time it waits
 * on the person this round (`aged` notes it), or undefined: no `waited`, not waiting, or dated already.
 */
export function backdate(agent: Pick<DemoAgent, 'key' | 'waited'>, w: { status: string; waitingSince?: number } | undefined, aged: Set<string>): number | undefined {
  if (!agent.waited || !w || aged.has(agent.key) || (w.status !== 'needs_input' && w.status !== 'done') || w.waitingSince === undefined) return undefined;
  aged.add(agent.key);
  return w.waitingSince - agent.waited * 60_000;
}
