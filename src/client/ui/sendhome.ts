// Sending a worker home, the same from the desk (X), Mission control and the 2D view: a worker in a
// meeting or at a board's kiosk is asked about plainly, one with its own worktree gets the choice of
// what becomes of it (sendHomeDialog). No three.js here: the 2D view imports it.

import { DESK_BY_ID } from '../../shared/layout';
import type { WorkerInfo } from '../../shared/protocol';
import type { Net } from '../net';
import { store } from '../state';
import { confirmDialog, sendHomeDialog } from './prompt';
import { providerLabel } from './provider';

export function confirmSendHome(net: Net, w: WorkerInfo) {
  const id = w.id;
  const desk = DESK_BY_ID.get(w.deskId);
  const where = desk?.label ?? 'the desk';
  const session = w.kind === 'shell' ? 'shared shell' : `${providerLabel(w.provider, store.project)} session`;
  if (w.meeting) {
    // The meeting's worktree is the whole table's: it's tidied away once they've all gone.
    const m = store.meeting.current;
    const on = m?.id === w.meeting && m.status === 'running';
    confirmDialog(`Send ${w.name} home?`, on ? `${w.name} is in the meeting on "${m.title}", which stops without it.` : `${w.name} leaves the meeting room.`, 'Send home', () => net.send({ t: 'worker.kill', workerId: id }));
    return;
  }
  if (w.worktree) {
    // A worker with its own worktree: choose what becomes of the worktree and its branch.
    sendHomeDialog({
      workerId: id,
      name: w.name,
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
    : `This stops the ${session} at ${where} for everyone and frees the desk.`;
  confirmDialog(`Send ${w.name} home?`, body, 'Send home', () => net.send({ t: 'worker.kill', workerId: id }));
}
