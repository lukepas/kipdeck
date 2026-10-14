// The demo (`kipdeck --demo`): five scripted stand-in agents on a throwaway repository, so anyone can
// see the inbox's loop without an agent CLI, a sign-in or a model. With `--read-only` (the hosted demo)
// a scripted reviewer answers and merges too, and the fleet starts over, while visitors only watch.
// What the page is told about it, and the words it uses, are here; the fleet itself is the server's
// (server/demo/).

/** What the page knows about a demo office (the welcome message's `demo`). */
export interface DemoInfo {
  /** The hosted demo: visitors watch, and the scripted reviewer acts. */
  readOnly: boolean;
  /** The replay demo: a recorded round of the hosted demo on a static page, nothing live behind it (shared/replay.ts). */
  replay?: boolean;
  /** The throwaway project's name. */
  project: string;
  /** On your own computer: the command that runs Kipdeck for real, the way this demo was started (server/runcmd.ts). */
  run?: string;
}

/**
 * Whether Kipdeck is on npm yet. Until it is, every command it prints runs it straight from GitHub
 * with npx (which installs and builds it, a few minutes the first time), never `npx kipdeck`, which
 * 404s. Flip it in the release that publishes to npm, with NPM_PACKAGE set to the name it publishes
 * under (the landing page's KIPDECK_NPM_PUBLISHED gate goes with it, docs/landing.md).
 */
export const ON_NPM = false;
/** The name it publishes under on npm (README, Publishing). */
export const NPM_PACKAGE = 'kipdeck';
/** What npx runs: the npm package once it's published, the public repository until then. */
export const NPX_SPEC = ON_NPM ? NPM_PACKAGE : 'github:zbagdzevicius/kipdeck';
/** The command that runs it on any computer with Node: in your repository, that's the first project. */
export const INSTALL_COMMAND = `npx ${NPX_SPEC}`;
/** The command that runs the demo on your own computer. */
export const DEMO_COMMAND = `${INSTALL_COMMAND} --demo`;

/**
 * The command that opens the office signed in, when the office hasn't said how it can be typed on
 * its computer (it does on the sign-in page: /api/login's `open`, from server/runcmd.ts).
 */
export function openCommand(): string {
  return `${INSTALL_COMMAND} open`;
}

/** Who the hosted demo's scripted reviewer is, in the shipped log and on the agents' terminals. */
export const DEMO_REVIEWER = 'Demo Lead (scripted)';

/**
 * The demo's pill in the top bar: what it is (`short` in the pill, `text` in full), and the next step
 * (`lead` says what for): the command to copy. On your own computer that's the command this demo was
 * started with, without --demo; in the hosted demo, the one that runs the demo on your computer.
 */
export function demoNote(d: DemoInfo): { text: string; short: string; lead: string; command: string } {
  if (d.replay) {
    const text = `A recording of the hosted demo, played in your browser: the agents and the reviewer are scripted, and nothing runs behind this page. To try it on your computer, run ${DEMO_COMMAND}.`;
    return { text, short: 'Recorded: scripted agents and reviewer', lead: 'Try it yourself', command: DEMO_COMMAND };
  }
  if (d.readOnly) {
    const text = `Live demo, read only. The agents and the reviewer are scripted, and no model runs. To try it on your computer, run ${DEMO_COMMAND}.`;
    return { text, short: 'Scripted agents and reviewer', lead: 'Try it yourself', command: DEMO_COMMAND };
  }
  const command = d.run ?? INSTALL_COMMAND;
  const text = `Scripted agents on a throwaway repo (${d.project}). No model runs, and nothing of yours is touched. To use it on your code, run ${command} inside your repository.`;
  return { text, short: 'Scripted agents, throwaway repo', lead: 'Run it for real', command };
}

/** What a visitor to the read-only demo may send: looking, never changing (server/demo/readonly.ts, and the replay demo). */
export const READ_ONLY_ALLOWS: ReadonlySet<string> = new Set([
  'ping',
  'doing',
  'worker.attach',
  'worker.detach',
  'worker.worktree',
  'changes.watch',
  'changes.unwatch',
  'changes.diff',
  'brief.get',
  'inbox.log',
  'pace.get',
  'timeline.get',
  'team.get',
  'approvals.get',
  'spend.get',
]);

/**
 * What a page sends by itself rather than someone asking for it, presence a visitor has no use for
 * (nobody has an avatar on the home page), usage-limit lookups that would reach other services, and a
 * project's rundown and Signal's gist of it (its contributors, uncommitted paths, branches and decisions
 * are not for anonymous visitors, as its download isn't): dropped without a word.
 */
export const READ_ONLY_QUIET: ReadonlySet<string> = new Set(['term.resize', 'term.typing', 'profile', 'rtc', 'voice', 'setup.check', 'move', 'sit', 'act', 'limits.refresh', 'rundown.watch', 'rundown.unwatch', 'signal.peek', 'yourcall.watch', 'here']);

/** What a visitor to the read-only demo is told when they try to act. */
export const READ_ONLY_REFUSAL = `This demo is read only: the agents and the reviewer are scripted. Run ${DEMO_COMMAND} to try it on your computer.`;

/**
 * Whether the pill shows the command itself (`kipdeck`, `npx kipdeck` once on npm). A longer one
 * (node and a path, or npx from GitHub) would squeeze the search box beside it, so the pill has a
 * Copy command button instead, with the command in its tooltip and in the pill's.
 */
export const fitsPill = (cmd: string) => cmd.length <= 20;
