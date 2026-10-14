// Push notifications, put together for the office (ctx.push): the devices that take them, who is at
// a desk, and the alerts that decide when to push and when the team's channel hears.
import type { Webhook } from '../webhook.js';
import { Alerts } from './alerts.js';
import { PushApprove, type ApproveDesk } from './approve.js';
import { personOf, PushDevices } from './devices.js';
import { Presence } from './presence.js';

export interface PushParts {
  devices: PushDevices;
  presence: Presence;
  alerts: Alerts;
  /** Allow once and Deny on an approval push (approve.ts). */
  approve: PushApprove;
}

/**
 * `ownerOf` is the account a worker runs for, when it was deployed by one (WorkerManager.ownerOf);
 * `desk` the approvals desk, asked only when a push goes out (it's made after this).
 */
export function createPush(dataDir: string, webhook: Webhook, project: (workerId: string) => string, ownerOf: (workerId: string) => string | undefined, desk: () => ApproveDesk): PushParts {
  const devices = new PushDevices(dataDir);
  const presence = new Presence();
  const approve = new PushApprove(dataDir, desk);
  const alerts = new Alerts({ webhook, devices, presence, project, owner: (id, createdBy) => personOf(ownerOf(id), createdBy), dress: (p, d, owner) => approve.dress(p, d, owner) });
  return { devices, presence, alerts, approve };
}
