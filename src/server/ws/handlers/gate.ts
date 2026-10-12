// The agent gate from the browser (see gate/flow.ts): a person approves or rejects an agent's
// request from Needs you, and admins add and take back standing grants in Settings.
import { GATE_ACTIONS, GATE_ACTION_LABEL, GATE_NOTE_MAX, type GateAction } from '../../../shared/gate.js';
import { readLimit } from '../../../shared/gate-rules.js';
import type { GateClientMsg } from '../../../shared/protocol.js';
import { decide, mayDecide } from '../../gate/flow.js';
import { str } from '../../office/input.js';
import type { HandlerMap } from './types.js';

export const gateHandlers = {
  'gate.decide'(ctx, c, msg) {
    const id = str(msg.id, 32);
    if (!ctx.gate.get(id)) return ctx.warn(c, 'Someone already decided that request');
    if (!mayDecide(ctx, c.accountId, id)) return ctx.warn(c, 'Only an admin, or whoever the asking agent runs as, can decide this');
    const note = msg.note === undefined ? undefined : str(msg.note, GATE_NOTE_MAX);
    void decide(ctx, c.peer.name, id, msg.approve === true, note).then((err) => ctx.warn(c, err));
  },
  'gate.grant'(ctx, c, msg) {
    if (!ctx.meOf(c.accountId).admin) return ctx.warn(c, 'Only admins can give agents standing permissions');
    const floor = ctx.floors.get(str(msg.floor, 128));
    if (!floor) return ctx.warn(c, 'No such project');
    if (!GATE_ACTIONS.includes(msg.action)) return ctx.warn(c, 'No such action');
    const limit = msg.action === 'hire' ? readLimit(msg.limit) : undefined;
    if (typeof limit === 'string') return ctx.warn(c, limit);
    ctx.gate.grant(floor.id, msg.action as GateAction, limit, c.peer.name);
    ctx.toastFloor(floor, `${c.peer.name} let agents on ${floor.def.name} ${GATE_ACTION_LABEL[msg.action].toLowerCase()} without asking${limit ? ` (at most ${limit} at once)` : ''}`);
  },
  'gate.revoke'(ctx, c, msg) {
    if (!ctx.meOf(c.accountId).admin) return ctx.warn(c, 'Only admins can take back standing permissions');
    const g = ctx.gate.revoke(str(msg.id, 32));
    if (!g) return ctx.warn(c, 'That permission was already taken back');
    const floor = ctx.floors.get(g.floor);
    ctx.toastFloor(floor, `${c.peer.name} took back: agents on ${floor?.def.name ?? 'a project'} may ${GATE_ACTION_LABEL[g.action].toLowerCase()} without asking`);
  },
} satisfies HandlerMap<GateClientMsg>;
