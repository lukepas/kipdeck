// The demo (`kipdeck --demo`): five scripted stand-in agents on a throwaway repository, so anyone can
// see the inbox's loop without an agent CLI, a sign-in or a model. With `--read-only` (the hosted demo)
// a scripted reviewer answers and merges too, and the fleet starts over, while visitors only watch.
// What the page is told about it, and the words it uses, are here; the fleet itself is the server's
// (server/demo/).

import { REPO_URL } from './copy.js';

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
/** The command that runs the demo on your own computer. */
export const DEMO_COMMAND = 'npx kipdeck --demo';
/** The command that installs and runs it for real. */
export const INSTALL_COMMAND = 'npx kipdeck';
/** Before npm: a clone linked once with `npm link` (README, From source) runs as `kipdeck` from any repository. */
export const SOURCE_RUN_COMMAND = 'kipdeck';
/** Before npm: the README's steps that run it from a clone (the repository is public). */
export const SOURCE_URL = `${REPO_URL}#from-source`;

/** The command that opens the office signed in from a terminal on its computer (the sign-in page), on npm or from a linked clone. */
export function openCommand(onNpm = ON_NPM): string {
  return `${onNpm ? INSTALL_COMMAND : SOURCE_RUN_COMMAND} open`;
}

/** Who the hosted demo's scripted reviewer is, in the shipped log and on the agents' terminals. */
export const DEMO_REVIEWER = 'Demo Lead (scripted)';

/**
 * The demo's pill in the top bar: what it is (`short` in the pill, `text` in full), and the next step
 * (`lead` says what for): a command to copy, or, for a visitor to the hosted demo before npm (who has
 * no clone to run a command in), a link to the README's run-from-source steps.
 */
export function demoNote(d: DemoInfo, onNpm = ON_NPM): { text: string; short: string; lead: string; command?: string; href?: string } {
  if (d.readOnly) {
    const text = 'Live demo, read only. The agents and the reviewer are scripted, and no model runs.';
    return onNpm
      ? { text, short: 'Scripted agents and reviewer', lead: 'Try it yourself', command: DEMO_COMMAND }
      : { text: `${text} Not on npm yet: run it from source at github.com/zbagdzevicius/kipdeck.`, short: 'Scripted agents and reviewer', lead: 'Run it from source', href: SOURCE_URL };
  }
  const text = `Scripted agents on a throwaway repo (${d.project}). No model runs, and nothing of yours is touched.`;
  return onNpm
    ? { text, short: 'Scripted agents, throwaway repo', lead: 'Run it for real', command: INSTALL_COMMAND }
    : { text: `${text} Not on npm yet: in your clone, run npm link once, then kipdeck from inside your repository to make it the first project.`, short: 'Scripted agents, throwaway repo', lead: 'Run it for real', command: SOURCE_RUN_COMMAND };
}

/** What a visitor to the read-only demo is told when they try to act. */
export const READ_ONLY_REFUSAL = `This demo is read only: the agents and the reviewer are scripted. ${ON_NPM ? `Run ${DEMO_COMMAND} to try it on your computer.` : 'Kipdeck is not on npm yet: run it from source (github.com/zbagdzevicius/kipdeck) to try it on your computer.'}`;
