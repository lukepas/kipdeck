// The home page's setup card (see firstrun.ts): what it shows, adding the checkout the office was
// started in as a project, and turning the anonymous usage numbers on or off (admins).
import path from 'node:path';
import type { SetupClientMsg, SetupGithub, SetupState } from '../../../shared/protocol.js';
import { checkAgents, checkGithub } from '../../firstrun.js';
import type { Ctx } from '../../office/context.js';
import type { HandlerMap } from './types.js';

/** GitHub is asked again at most this often, unless someone presses Check again. */
const GITHUB_TTL_MS = 60_000;
let github: { at: number; state: Promise<SetupGithub> } | undefined;

/** The card's state now. `fresh` asks GitHub again. */
export async function setupState(ctx: Ctx, fresh = false): Promise<SetupState> {
  const now = Date.now();
  if (fresh || !github || now - github.at > GITHUB_TTL_MS) github = { at: now, state: checkGithub(ctx.cfg.dataDir) };
  const dir = ctx.cfg.startedIn;
  const floor = dir ? ctx.building.list().find((d) => path.resolve(d.dir) === path.resolve(dir)) : undefined;
  return {
    agents: checkAgents(),
    ...(dir ? { startedIn: { dir, name: path.basename(dir), ...(floor ? { floor: floor.id } : {}) } } : {}),
    github: await github.state,
    telemetry: ctx.telemetry.state(),
  };
}

export const setupHandlers = {
  'setup.check'(ctx, c, msg) {
    void setupState(ctx, msg.fresh === true).then((state) => ctx.sendTo(c, { t: 'setup', state }));
  },
  'setup.useFolder'(ctx, c) {
    // It opens a checkout on this machine and runs what's in it past the office's checks: admins do.
    if (!ctx.meOf(c.accountId).admin) return ctx.warn(c, 'Only admins can add a project');
    const dir = ctx.cfg.startedIn;
    if (!dir) return ctx.warn(c, 'The office was not started inside a git repository');
    const who = c.peer.name;
    const r = ctx.building.addFolder(dir, who);
    if (typeof r === 'string') return ctx.warn(c, r);
    if (!ctx.floors.has(r.id) && !ctx.openFloor(r)) return ctx.warn(c, `Couldn't open ${r.name} - see the office's log`);
    ctx.floorsChanged();
    ctx.toastAll(`${who} added ${r.name} as a project`);
    void setupState(ctx).then((state) => ctx.sendTo(c, { t: 'setup', state }));
  },
  'setup.telemetry'(ctx, c, msg) {
    if (!ctx.meOf(c.accountId).admin) return ctx.warn(c, 'Only admins can change this');
    const err = ctx.telemetry.set(msg.on === true, c.peer.name);
    if (err) return ctx.warn(c, err);
    void setupState(ctx).then((state) => ctx.broadcast({ t: 'setup', state }));
  },
} satisfies HandlerMap<SetupClientMsg>;
