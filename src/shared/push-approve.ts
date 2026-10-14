// Allow or deny from the lock screen: the rules for which approval pushes carry Allow once and Deny
// buttons, what the notification says about the request, and how long a button stays good. Pure, so
// the server (server/push/approve.ts) and the tests read the same rules. What it defends against is
// in docs/security.md#allow-or-deny-from-a-notification.
import type { ApprovalView } from './protocol/approvals.js';
import type { PushPayload } from './push.js';

/** A button's token is good this long after the push was sent; after that the inbox has to answer. */
export const PUSH_APPROVE_MS = 10 * 60_000;

/** The most tokens the office holds at once; the oldest go first past that. */
export const PUSH_APPROVE_MAX = 500;

/** The longest shell command a notification offers buttons for: all of it has to fit on the lock screen. */
export const PUSH_APPROVE_COMMAND_MAX = 120;

/** The decisions a notification can send: never "Allow always", which changes the agent's rules. */
export type PushApproveDecision = 'once' | 'deny';

/**
 * Tools whose whole effect the notification can show and the risk tags can judge: a shell command
 * (shown in full) and reading files. An edit's content can't be shown on a lock screen, and an MCP
 * tool or any other one can reach anything without a tag saying so, so those open Kipdeck.
 */
const QUICK_TOOLS = /^(?:Bash|Read|Glob|Grep)$/;

/** One line of plain printable ASCII: no line breaks, control codes or right-to-left marks hiding part of it. */
const PRINTABLE = /^[\x20-\x7e]+$/;

/**
 * Whether a request may be answered from a notification: one of QUICK_TOOLS, with its working folder
 * known (the "outside the project" tag needs it), no risk tags at all (not destructive, no network,
 * nothing outside the project, no secrets) and, for a shell command, one short line of plain text the
 * notification shows whole. Anything else keeps the buttons that open the inbox.
 */
export function quickApprovable(v: Pick<ApprovalView, 'risks' | 'tool' | 'command' | 'cwd'>): boolean {
  if (v.risks.length || !v.cwd || !QUICK_TOOLS.test(v.tool)) return false;
  if (v.tool !== 'Bash') return !v.command;
  return !!v.command && v.command.length <= PUSH_APPROVE_COMMAND_MAX && PRINTABLE.test(v.command);
}

/** What the notification says it wants, word for word what a tap allows: the whole command, else the card's title. */
export const pushApproveLine = (v: Pick<ApprovalView, 'title' | 'command'>): string => (v.command ? `Run ${v.command}` : v.title);

/**
 * The approval push with Allow once and Deny in place of its usual buttons, carrying `token`, and
 * saying exactly what `view` is under its first line (the agent's activity can lag behind it).
 */
export function withPushApprove(p: PushPayload, token: string, view: Pick<ApprovalView, 'title' | 'command'>): PushPayload {
  const lead = p.body.split('\n')[0];
  return {
    ...p,
    body: `${lead}\n${pushApproveLine(view)}`,
    actions: [
      { action: 'allow', title: 'Allow once' },
      { action: 'deny', title: 'Deny' },
    ],
    approve: token,
  };
}
