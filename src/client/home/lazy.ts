// The windows the inbox opens only now and then, loaded the first time they're wanted so the home page
// draws without them: the terminal (xterm), the Changes window, the GitHub windows and boards, the task
// queue, Mission control, Labs, the meeting room, sign-ins, Settings, Numbers, Rundown, Signal's card, Accounts, an agent's request, Pair a phone, the confirm and note dialogs (Stop, Send back, Give a task) and Mission control's actions for a notification's Look. A module that reads server messages
// for its open window is handed every message from then on.

import type { ServerMsg } from '../../shared/protocol';
import type { Net } from '../net';
import { store } from '../state';

type Router = (msg: ServerMsg) => void;
const routers = new Set<Router>();

/** Feeds a server message to every loaded window that follows them. */
export function routeLazy(msg: ServerMsg) {
  routers.forEach((fn) => fn(msg));
}

function once<T>(load: () => Promise<T>, router?: (m: T) => Router): () => Promise<T> {
  let p: Promise<T> | undefined;
  return () =>
    (p ??= load().then((m) => {
      if (router) routers.add(router(m));
      return m;
    }));
}

let termLoaded = false;
let changesLoaded = false;

export const terminal = once(() => import('../ui/terminal'), (m) => ((termLoaded = true), m.routeTerminalMessage));
export const changes = once(() => import('../ui/changes'), (m) => ((changesLoaded = true), m.routeChangesMessage));
export const pull = once(() => import('../ui/pull'), (m) => m.routePullMessage);
export const prompt = once(() => import('../ui/prompt'));
export const missionAct = once(() => import('../ui/mission/act'));
export const boards = once(() => import('../ui/boards'));
export const queue = once(() => import('../ui/queue'));
export const mission = once(() => import('../ui/mission'));
export const labs = once(() => import('../ui/labs'));
export const signins = once(() => import('../ui/signins'));
export const meeting = once(() => import('../ui/meeting'));
export const settings = once(() => import('./settings'));
export const numbers = once(() => import('./numbers'));
export const rundown = once(() => import('../ui/rundown'));
export const signal = once(() => import('../ui/signal'));
export const approval = once(() => import('./approval-card'));
export const accounts = once(() => import('../ui/accounts'), (m) => m.routeAccountsMessage);
export const proposal = once(() => import('./proposal-window'));
export const pair = once(() => import('../ui/pair'));
/** Kip in the quiet moments: the all-clear pane, the setup card, the merge's cheer, the first job (kip-moments.ts). */
export const kipMoments = once(() => import('./kip-moments'));

/** After a reconnect the office has forgotten which terminal and which changes this page follows: tell it again. */
export async function rewatch(net: Net) {
  if (termLoaded) {
    const id = (await terminal()).openTerminalFor();
    if (id && store.workers.has(id)) net.send({ t: 'worker.attach', workerId: id });
  }
  if (changesLoaded) {
    const watching = (await changes()).openChangesFor();
    if (watching && store.workers.has(watching.workerId)) net.send({ t: 'changes.watch', ...watching });
  }
}
