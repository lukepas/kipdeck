// The demo (`kipdeck --demo`): five scripted stand-in agents on a throwaway repository, so anyone can
// see the inbox's loop without an agent CLI, a sign-in or a model. With `--read-only` (the hosted demo)
// a scripted reviewer answers and merges too, and the fleet starts over, while visitors only watch.
// What the page is told about it, and the words it uses, are here; the fleet itself is the server's
// (server/demo/).

/** What the page knows about a demo office (the welcome message's `demo`). */
export interface DemoInfo {
  /** The hosted demo: visitors watch, and the scripted reviewer acts. */
  readOnly: boolean;
  /** The throwaway project's name. */
  project: string;
}

/**
 * Whether `npx kipdeck` works from the registry yet. Until it does, the pill and the read-only
 * refusal show the from-source commands instead of one that 404s (the landing page's
 * KIPDECK_NPM_PUBLISHED gate, docs/landing.md). Flip it in the release that publishes to npm.
 */
export const ON_NPM = false;
/** Where the source is cloned from until then. */
export const REPO_URL = 'https://github.com/zbagdzevicius/kipdeck';
/** The command that runs the demo on your own computer. */
export const DEMO_COMMAND = 'npx kipdeck --demo';
/** The command that installs and runs it for real. */
export const INSTALL_COMMAND = 'npx kipdeck';
/** Before npm: clone and build it (the README's From source). */
export const CLONE_COMMAND = `git clone ${REPO_URL} kipdeck`;
/** Before npm: run a built clone (from inside your own repository, give the path to the clone's bin/). */
export const SOURCE_RUN_COMMAND = 'node bin/agent-office.js';

/** Who the hosted demo's scripted reviewer is, in the shipped log and on the agents' terminals. */
export const DEMO_REVIEWER = 'Demo Lead (scripted)';

/** The demo's pill in the top bar: what it is (`short` in the pill, `text` in full), and the command to run next (`lead` says what for). */
export function demoNote(d: DemoInfo, onNpm = ON_NPM): { text: string; short: string; lead: string; command: string } {
  const fromSource = ' Not on npm yet, so it runs from a built clone (the README\'s From source); run it from inside your repository to make that the first project.';
  if (d.readOnly) {
    const text = 'Live demo, read only. The agents and the reviewer are scripted, and no model runs.';
    return onNpm
      ? { text, short: 'Scripted agents and reviewer', lead: 'Try it yourself', command: DEMO_COMMAND }
      : { text: text + fromSource, short: 'Scripted agents and reviewer', lead: 'Not on npm yet', command: CLONE_COMMAND };
  }
  const text = `Scripted agents on a throwaway repo (${d.project}). No model runs, and nothing of yours is touched.`;
  return onNpm
    ? { text, short: 'Scripted agents, throwaway repo', lead: 'Run it for real', command: INSTALL_COMMAND }
    : { text: text + fromSource, short: 'Scripted agents, throwaway repo', lead: 'Run it for real from your clone', command: SOURCE_RUN_COMMAND };
}

/** What a visitor to the read-only demo is told when they try to act. */
export const READ_ONLY_REFUSAL = `This demo is read only: the agents and the reviewer are scripted. ${ON_NPM ? `Run ${DEMO_COMMAND}` : `Run it from source (${REPO_URL})`} to try it on your computer.`;
