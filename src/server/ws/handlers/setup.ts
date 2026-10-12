// The home page's setup card (see firstrun.ts): what it shows, adding the checkout the office was
// started in as a project, bringing in the agent sessions running in its folders (adopt.ts,
// livesessions.ts), and turning the anonymous usage numbers on or off (admins).
import path from 'node:path';
import type { SetupClientMsg, SetupGithub, SetupState } from '../../../shared/protocol.js';
import { checkAgentsAsync, checkGithub, findConfigured } from '../../firstrun.js';
import { launchCommand } from '../../runcmd.js';
import { adoptSession, sessionTaken } from '../../adopt.js';
import { liveSessions } from '../../livesessions.js';
import { starters } from '../../starters.js';
import type { Starter } from '../../../shared/starters.js';
import type { Ctx } from '../../office/context.js';
import type { Client } from '../../office/client.js';
import type { HandlerMap } from './types.js';

/** GitHub is asked again at most this often, unless someone presses Check again. */
const GITHUB_TTL_MS = 60_000;
let github: { at: number; state: Promise<SetupGithub> } | undefined;

/** The task box's chips wait at most this long for the repository to be read; later ones follow in a second `setup`. */
const STARTERS_WAIT_MS = 1_500;

/**
 * The card's state now. `fresh` asks GitHub again; `admin` adds the sessions running in the projects'
 * folders. Chips that take longer than STARTERS_WAIT_MS to work out are left off, and `late` gets
 * the state again with them once they're there.
 */
export async function setupState(ctx: Ctx, fresh = false, admin = false, late?: (s: SetupState) => void): Promise<SetupState> {
  const now = Date.now();
  if (fresh || !github || now - github.at > GITHUB_TTL_MS) github = { at: now, state: checkGithub(ctx.cfg.dataDir) };
  const dir = ctx.cfg.startedIn;
  const defs = ctx.building.list();
  const floor = dir ? defs.find((d) => path.resolve(d.dir) === path.resolve(dir)) : undefined;
  // The task box's chips come from the project the first agent goes to: the one it was started in, else
  // the first. gh is asked for issues either way: without it, or signed out, it fails at once.
  const first = floor ?? defs[0];
  const coming = first ? starters(first.dir, true, fresh).catch(() => [] as Starter[]) : undefined;
  let waited: Starter[] | undefined;
  const [gh, agents] = await Promise.all([github.state, checkAgentsAsync(findConfigured(ctx.cfg.agentCmd)), coming && Promise.race([coming.then((c) => (waited = c)), new Promise((r) => setTimeout(r, STARTERS_WAIT_MS).unref?.())])]);
  const sessions = admin ? liveSessions(defs.map((d) => ({ floor: d.id, dir: d.dir })), (p, id) => !!sessionTaken(ctx, p, id)) : [];
  const state: SetupState = {
    agents,
    ...(dir ? { startedIn: { dir, name: path.basename(dir), ...(floor ? { floor: floor.id } : {}) } } : {}),
    github: gh,
    telemetry: ctx.telemetry.state(),
    run: launchCommand(),
    ...(waited?.length ? { starters: waited } : {}),
    ...(sessions.length ? { sessions } : {}),
  };
  if (coming && !waited && late) void coming.then((chips) => chips.length && late({ ...state, starters: chips }));
  return state;
}

const isAdmin = (ctx: Ctx, c: Client) => ctx.meOf(c.accountId).admin;

export const setupHandlers = {
  'setup.check'(ctx, c, msg) {
    const send = (state: SetupState) => ctx.sendTo(c, { t: 'setup', state });
    void setupState(ctx, msg.fresh === true, isAdmin(ctx, c), send).then(send);
  },
  'setup.useFolder'(ctx, c) {
    // It opens a checkout on this machine and runs what's in it past the office's checks: admins do.
    if (!ctx.meOf(c.accountId).admin) return ctx.warn(c, 'Only admins can add a project');
    const dir = ctx.cfg.startedIn;
    if (!dir) return ctx.warn(c, 'Kipdeck was not started inside a git repository');
    const who = c.peer.name;
    const r = ctx.building.addFolder(dir, who);
    if (typeof r === 'string') return ctx.warn(c, r);
    if (!ctx.floors.has(r.id) && !ctx.openFloor(r)) return ctx.warn(c, `Couldn't open ${r.name} - see Kipdeck's log`);
    ctx.floorsChanged();
    ctx.toastAll(`${who} added ${r.name} as a project`);
    void setupState(ctx, false, true).then((state) => ctx.sendTo(c, { t: 'setup', state }));
  },
  'setup.adopt'(ctx, c, msg) {
    // It runs an agent in a project's folder on someone's own conversation: admins do, as for a project.
    if (!isAdmin(ctx, c)) return ctx.warn(c, 'Only admins can bring sessions in');
    const asked = Array.isArray(msg.sessions) ? msg.sessions.slice(0, 20) : [];
    const defs = ctx.building.list();
    // Only what the office itself found running: never a session id or folder the page made up.
    const live = liveSessions(defs.map((d) => ({ floor: d.id, dir: d.dir })), (p, id) => !!sessionTaken(ctx, p, id));
    const names: string[] = [];
    for (const a of asked) {
      const s = live.find((l) => l.provider === a?.provider && l.id === a?.id);
      const def = s && defs.find((d) => d.id === s.floor);
      if (!s || !def) {
        ctx.warn(c, 'That session is no longer running here');
        continue;
      }
      if (!s.canAdopt) {
        ctx.warn(c, s.why ?? 'That session has to be quit in its terminal first');
        continue;
      }
      const r = adoptSession(ctx, { dir: def.dir, provider: s.provider, session: s.id, title: s.title, fork: true }, c.peer.name);
      if (!r.ok) ctx.warn(c, r.error);
      else names.push(r.name);
    }
    if (names.length) ctx.toastAll(`${c.peer.name} brought in ${names.length} running session${names.length === 1 ? '' : 's'}`);
    void setupState(ctx, false, true).then((state) => ctx.sendTo(c, { t: 'setup', state }));
  },
  'setup.telemetry'(ctx, c, msg) {
    if (!ctx.meOf(c.accountId).admin) return ctx.warn(c, 'Only admins can change this');
    const err = ctx.telemetry.set(msg.on === true, c.peer.name);
    if (err) return ctx.warn(c, err);
    void setupState(ctx).then((state) => ctx.broadcast({ t: 'setup', state }));
  },
} satisfies HandlerMap<SetupClientMsg>;
