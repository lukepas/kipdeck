// Your call in the inbox (Labs > Rundown, protocol/yourcall.ts): each open decision in a project's
// .rundown/decisions.md waits in Needs you as a row, "Decide: Which host?", with its default and how
// long it has been open, and Keep default or Choose... for an admin (the window is
// decision-window.ts, loaded the first time). The map's one suggested next step is "Deploy on: <step>"
// on the empty pane and in Ctrl+K: the Deploy sheet with the step as the task, on its project.

import { AGE_PREFIX, ageLabel } from '../../shared/inbox';
import type { YourCallFloor } from '../../shared/protocol';
import { waitTone } from '../../shared/wait';
import { decisionSince, decisionStatus, decisionTitle, deployOnLabel, nextOf, nextStepPrompt, stamp } from '../../shared/yourcall';
import type { Net } from '../net';
import { store } from '../state';
import { h, toast } from '../ui/dom';
import { icon } from '../ui/icons';
import type { Command } from './palette';
import * as lazy from './lazy';
import { home } from './state';
import './yourcall.css';

let net: Net | undefined;
let deploy: (prompt: string, floor: string) => void = () => {};

/** One open decision, with the project it's on. */
export interface ShownDecision {
  f: YourCallFloor;
  d: YourCallFloor['decisions'][number];
}

const on = () => store.lab('rundown') && !home.readOnly;

/** The decisions the list shows: on the project picked; with Mine on, only the ones your own agents raised. */
export function shownDecisions(): ShownDecision[] {
  if (!on()) return [];
  return store.yourCall
    .filter((f) => !home.project || f.floor === home.project)
    .flatMap((f) => f.decisions.map((d) => ({ f, d })))
    .filter(({ d }) => home.owner !== 'mine' || (!!d.raisedBy && store.rosterEntry(d.raisedBy.id)?.createdBy === store.profile.name));
}

/** When each shown decision started waiting, for the pulse's Needs you count. */
export const decisionWaits = (now = Date.now()): number[] => shownDecisions().map(({ d }) => decisionSince(d, now));

/** Every open decision on every project, for the calm pane's gate. */
export const openDecisions = (): number => (on() ? store.yourCall.reduce((n, f) => n + f.decisions.length, 0) : 0);

/** Answers `d` with `answer` (admins only: the office checks again). */
export function answerDecision(s: ShownDecision, answer: string) {
  net?.send({ t: 'yourcall.answer', floor: s.f.floor, id: s.d.id, answer, mtime: s.f.mtime });
}

/** Opens decision `id` on `floor` with its options (decision-window.ts, loaded the first time). */
export function openDecision(floor: string, id: string) {
  void lazy.decision().then((m) => m.openDecisionWindow(floor, id));
}

function decisionRow(s: ShownDecision, now: number): HTMLElement {
  const { d, f } = s;
  const title = decisionTitle(d);
  const since = decisionSince(d, now);
  const admin = !!store.me.admin;
  const open = () => openDecision(f.floor, d.id);
  const status = decisionStatus(d, now) + (d.raisedBy ? `, asked by ${d.raisedBy.name}` : '');
  return h(
    'li.row.decision.l-needs-you.s-needs-you',
    { 'data-decision': `${f.floor}/${d.id}`, 'data-section': 'needs-you' },
    h(
      'button.row-main',
      { type: 'button', 'aria-label': `${title}: decision on ${f.floorName}`, onclick: open },
      h('span.agent-mark.decision', { 'aria-hidden': 'true' }, icon('target', 14)),
      h('span.row-text', {}, h('span.row-title', {}, title), h('span.row-sub', {}, h('span.row-status', {}, status), h('span.row-where', {}, f.floorName))),
      h('span.row-age.wait-clock', { 'data-since': String(since), 'data-prefix': AGE_PREFIX['needs-you'], 'data-tone': waitTone(now - since) }, ageLabel('needs-you', { since }, now)),
    ),
    admin && d.default ? h('button.btn.row-act.quiet.keep', { type: 'button', onclick: () => answerDecision(s, d.default), 'aria-label': `Keep the default for ${d.id}: ${d.default}` }, 'Keep default') : null,
    h('button.btn.row-act.act', { type: 'button', onclick: open, 'aria-label': `Choose: ${title}` }, admin ? 'Choose...' : 'Open'),
  );
}

/** The rows for Needs you, oldest first. */
export function decisionRows(now = Date.now()): HTMLElement[] {
  return shownDecisions()
    .sort((a, b) => decisionSince(a.d, now) - decisionSince(b.d, now))
    .map((s) => decisionRow(s, now));
}

/** The project whose next step is offered: the one picked, else the one you're on, else the first. */
const nextFloor = () => (on() ? nextOf(store.yourCall, home.project, store.floor) : undefined);

function deployNext(f: YourCallFloor) {
  if (f.next) deploy(nextStepPrompt(f.floorName, f.next), f.floor);
}

/** "Deploy on: <step>" for the empty pane, or nothing without a next step. */
export function nextStepButton(): HTMLElement | null {
  const f = nextFloor();
  if (!f?.next) return null;
  const where = [f.floorName, stamp(f.next)].filter(Boolean).join(', ');
  return h(
    'div.yc-next',
    {},
    h('button.btn.yc-deploy', { type: 'button', title: f.next.why || undefined, onclick: () => deployNext(f) }, icon('plus', 16), deployOnLabel(f.next)),
    h('p.yc-where', {}, `The next step in the map of ${where}`),
  );
}

/** Ctrl+K: "Deploy on: <step>", and each open decision. */
export function yourCallCommands(): Command[] {
  const f = nextFloor();
  const next: Command[] = f?.next ? [{ label: deployOnLabel(f.next), hint: [f.floorName, stamp(f.next)].filter(Boolean).join(' - '), icon: 'plus', run: () => deployNext(f) }] : [];
  return [...next, ...shownDecisions().map(({ f: x, d }) => ({ label: decisionTitle(d), hint: `${x.floorName}: ${decisionStatus(d, Date.now())}`, icon: 'target' as const, run: () => openDecision(x.floor, d.id) }))];
}

/** Asks the office for every project's decisions while the lab is on, and redraws the inbox when they change. */
export function installYourCall(n: Net, deployWith: (prompt: string, floor: string) => void) {
  net = n;
  deploy = deployWith;
  let watching = false;
  const watch = () => {
    if (!on()) return void (watching = false);
    if (watching || !n.up) return;
    watching = true;
    n.send({ t: 'yourcall.watch' });
  };
  n.onStatus((up) => {
    if (!up) watching = false;
  });
  for (const t of ['floors', 'labs'] as const) store.on(t, watch);
  store.on('yourcall', () => home.change());
  store.on('yourcallReply', () => {
    const r = store.yourCallReply;
    if (!r) return;
    if (r.ok) toast(`${r.id} answered${r.told ? `. ${r.told} was told` : ''}`, 'info');
    else toast(r.error ?? `${r.id} was not answered`, 'warn');
  });
  watch();
}
