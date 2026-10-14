// Allow or deny from the lock screen: the rules for which approval pushes carry Allow once and Deny
// buttons, and how long a button stays good. Pure, so the server (server/push/approve.ts), the
// service worker's copy and the tests all read the same rules. What it defends against is in
// docs/security.md#allow-or-deny-from-a-notification.
import type { ApprovalView } from './protocol/approvals.js';
import type { PushPayload } from './push.js';

/** A button's token is good this long after the push was sent; after that the inbox has to answer. */
export const PUSH_APPROVE_MS = 10 * 60_000;

/** The most tokens the office holds at once; the oldest go first past that. */
export const PUSH_APPROVE_MAX = 500;

/** The decisions a notification can send: never "Allow always", which changes the agent's rules. */
export type PushApproveDecision = 'once' | 'deny';

/**
 * Whether a request may be answered without looking at it: a request with no risk tags at all (not
 * destructive, no network, nothing outside the project, no secrets). Anything else keeps the buttons
 * that open the inbox.
 */
export const quickApprovable = (v: Pick<ApprovalView, 'risks'>): boolean => v.risks.length === 0;

/** The approval push with Allow once and Deny in place of its usual buttons, carrying `token`. */
export function withPushApprove(p: PushPayload, token: string): PushPayload {
  return {
    ...p,
    actions: [
      { action: 'allow', title: 'Allow once' },
      { action: 'deny', title: 'Deny' },
    ],
    approve: token,
  };
}
