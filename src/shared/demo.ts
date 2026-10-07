// The demo (`mergeline --demo`): five scripted stand-in agents on a throwaway repository, so anyone can
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

/** The command that runs the demo on your own computer. */
export const DEMO_COMMAND = 'npx mergeline --demo';
/** The command that installs and runs it for real. */
export const INSTALL_COMMAND = 'npx mergeline';

/** Who the hosted demo's scripted reviewer is, in the shipped log and on the agents' terminals. */
export const DEMO_REVIEWER = 'Demo Lead (scripted)';

/** The demo's pill in the top bar: what it is (`short` in the pill, `text` in full), and the command to run next (`lead` says what for). */
export function demoNote(d: DemoInfo): { text: string; short: string; lead: string; command: string } {
  return d.readOnly
    ? { text: 'Live demo, read only. The agents and the reviewer are scripted, and no model runs.', short: 'Scripted agents and reviewer', lead: 'Try it yourself', command: DEMO_COMMAND }
    : { text: `Scripted agents on a throwaway repo (${d.project}). No model runs, and nothing of yours is touched.`, short: 'Scripted agents, throwaway repo', lead: 'Run it for real', command: INSTALL_COMMAND };
}

/** What a visitor to the read-only demo is told when they try to act. */
export const READ_ONLY_REFUSAL = `This demo is read only: the agents and the reviewer are scripted. Run ${DEMO_COMMAND} to try it on your computer.`;
