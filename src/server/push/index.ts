// Push notifications, put together for the office (ctx.push): the devices that take them, who is at
// a desk, and the alerts that decide when to push and when the team's channel hears.
import type { Webhook } from '../webhook.js';
import { Alerts } from './alerts.js';
import { personOf, PushDevices } from './devices.js';
import { Presence } from './presence.js';

export interface PushParts {
  devices: PushDevices;
  presence: Presence;
  alerts: Alerts;
}

/** `ownerOf` is the account a worker runs for, when it was deployed by one (WorkerManager.ownerOf). */
export function createPush(dataDir: string, webhook: Webhook, project: (workerId: string) => string, ownerOf: (workerId: string) => string | undefined): PushParts {
  const devices = new PushDevices(dataDir);
  const presence = new Presence();
  const alerts = new Alerts({ webhook, devices, presence, project, owner: (id, createdBy) => personOf(ownerOf(id), createdBy) });
  return { devices, presence, alerts };
}
