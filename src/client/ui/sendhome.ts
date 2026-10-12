// Stopping an agent, the same from the desk (X), Mission control and the 2D view, named the one way
// every surface names it (shared/agentname.ts): an agent in a
// meeting or at a board's kiosk is asked about plainly, one with its own worktree gets the choice of
// what becomes of it (sendHomeDialog). No three.js here: the 2D view imports it.

import { agentRef } from '../../shared/agentname';
import { DESK_BY_ID } from '../../shared/layout';
import type { WorkerInfo } from '../../shared/protocol';
import type { Net } from '../net';
import { store } from '../state';
import { confirmDialog, sendHomeDialog } from './prompt';
import { providerLabel } from './provider';

export function confirmSendHome(net: Net, w: WorkerInfo) {
  const id = w.id;
  const desk = DESK_BY_ID.get(w.deskId);
  const where = desk?.label ?? 'its seat';
  const name = agentRef(w);
  const session = w.kind === 'shell' ? 'shared shell' : `${providerLabel(w.provider, store.project)} session`;
  if (w.meeting) {
    // The meeting's worktree is the whole table's: it's tidied away once they've all gone.
    const m = store.meeting.current;
    const on = m?.id === w.meeting && m.status === 'running';
    confirmDialog(`Stop ${name}?`, on ? `It is in the review on "${m.title}", which stops without it.` : 'It leaves the Review bay.', 'Stop agent', () => net.send({ t: 'worker.kill', workerId: id }));
    return;
  }
  if (w.worktree) {
    // A worker with its own worktree: choose what becomes of the worktree and its branch.
    sendHomeDialog({
      workerId: id,
      name,
      where,
      worktree: w.worktree,
      repos: w.repos?.length ? [w.worktree.path.split(/[\\/]/).pop() ?? 'its own', ...w.repos.map((r) => r.name)] : undefined,
      ask: () => net.send({ t: 'worker.worktree', workerId: id }),
      onConfirm: (cleanup) => net.send({ t: 'worker.kill', workerId: id, cleanup }),
    });
    return;
  }
  const body = desk?.station
    ? `This stops its ${session} for everyone, and it forgets what it was asked. The next prompt at the ${where} starts a fresh one.`
    : `This stops the ${session} at ${where} for everyone and frees the console.`;
  confirmDialog(`Stop ${name}?`, body, 'Stop agent', () => net.send({ t: 'worker.kill', workerId: id }));
}
