// Spend and control in the inbox (docs/spend.md): each row's permission mode badge and spend chip,
// today's spend in the pulse, the pane's Pause, and the top bar's Pause all and the commands, whose
// work (spend-control.ts) loads the first time one is used. The office does the rest
// (server/spend/): budget caps pause an agent into Needs you on their own.

import { AUTONOMY_META, modeWords } from '../../shared/autonomy';
import type { RosterEntry, ServerMsg } from '../../shared/protocol';
import { fmtCost } from '../../shared/protocol/usage';
import { PROVIDER_META } from '../../shared/providers';
import { budgetLevel, spendChip, spendOf, spendTotals } from '../../shared/spend';
import type { Net } from '../net';
import { store } from '../state';
import { h } from '../ui/dom';
import { icon } from '../ui/icons';
import type { Command } from './palette';
import { home } from './state';
import './spend.css';

let net: Net | undefined;
let button: HTMLElement | undefined;

export const plural = (n: number) => (n === 1 ? '1 agent' : `${n} agents`);
const control = () => import('./spend-control');

/** The agents in the project picked in the top bar (every project's with none picked). */
export const scoped = (): RosterEntry[] => store.roster.filter((e) => e.kind === 'agent' && (!home.project || e.floor === home.project));
/** At work and not paused: what Pause all pauses. */
export const workingAgents = () => scoped().filter((e) => e.status === 'working' && !e.hold);
export const pausedAgents = () => scoped().filter((e) => !!e.hold);
/** With a session running: what Stop all stops (an asleep one has nothing to stop). */
export const liveAgents = () => scoped().filter((e) => e.status !== 'exited' && e.status !== 'offline');

/** The server messages this module reads: the welcome (ask for the spend state) and what a pause did. */
export function spendMessage(msg: ServerMsg) {
  if (msg.t === 'welcome') net?.send({ t: 'spend.get' });
  if (msg.t === 'spend.done' && msg.kind === 'pause' && net) {
    const n = net;
    void control().then((c) => c.paused(n, msg.workerIds));
  }
}

/** The badge of an agent's permission mode; with `always`, "own settings" when its command line names none. */
function modeBadge(e: Pick<RosterEntry, 'mode' | 'provider'>, always = false): HTMLElement | null {
  if (!e.mode) return always ? h('span.mode-badge.m-unknown', { title: modeWords(undefined, PROVIDER_META[e.provider ?? 'claude']?.label) }, 'own settings') : null;
  const m = AUTONOMY_META[e.mode];
  return h('span.mode-badge', { class: `m-${m.tone}`, title: modeWords(e.mode) }, m.badge);
}

/** A row's badges: its mode and what it has spent ("cost ?" when its CLI never says). */
export function rowBadges(e: RosterEntry): HTMLElement[] {
  const said = spendOf(e);
  const chip = spendChip(said);
  // Amber from 80 percent of its budget, orange at it, as in the pane.
  const level = said.kind === 'cost' ? budgetLevel(said.usd, store.spend?.agentCap) : 'ok';
  return [modeBadge(e), chip ? h('span.row-spend', { class: said.kind === 'cost' ? `b-${level}` : 'unknown', title: chip.title }, chip.text) : null].filter((x): x is HTMLElement => !!x);
}

/** The pane's line under the title: mode (said even when unknown) and spend against its cap. */
export function paneBadges(e: RosterEntry): HTMLElement | null {
  if (e.kind !== 'agent') return null;
  const said = spendOf(e);
  const chip = spendChip(said);
  const cap = store.spend?.agentCap;
  const level = said.kind === 'cost' ? budgetLevel(said.usd, cap) : 'ok';
  const spend = chip ? h('span.pane-spend', { class: `b-${level}`, title: chip.title }, cap && said.kind === 'cost' ? `${chip.text} of ${fmtCost(cap)}` : chip.text) : null;
  return h('div.pane-badges', {}, modeBadge(e, true), spend);
}

/** The pane's Pause, beside Stop, for an agent at work. */
export function pauseButton(e: RosterEntry): HTMLElement | null {
  if (e.kind !== 'agent' || e.status !== 'working' || e.hold || !net) return null;
  const n = net;
  return h('button.btn.quiet.pane-pause', { type: 'button', title: 'Interrupt it and hold it in Needs you until you let it carry on', onclick: () => void control().then((c) => c.pauseAgents(n, [e.id])) }, 'Pause');
}

/** Today's spend for the pulse: what's known, the daily cap, and how many agents it can't count. */
export function pulseSpend(): HTMLElement | null {
  const s = store.spend;
  const live = liveAgents();
  if (!s && !live.length) return null;
  const { usd, unknown } = spendTotals(live);
  const today = s?.today ?? usd;
  const value = s?.dayCap ? `${fmtCost(today)} / ${fmtCost(s.dayCap)}` : fmtCost(today);
  const title = `What agents spent today across every project, from the CLIs that report it${unknown ? `. ${plural(unknown)} here can't be counted: their CLI reports no cost` : ''}${s?.dayCap ? `. Agents at work are paused at ${fmtCost(s.dayCap)}` : ''}`;
  return h('span.pulse-stat.p-spend', { class: `b-${budgetLevel(today, s?.dayCap)}`, title }, h('b', {}, value), h('span', {}, unknown ? `spent today, ${unknown} unmetered` : 'spent today'));
}

/** The commands for the palette: only the ones that would do something now. */
export function spendCommands(): Command[] {
  const n = net;
  if (!n) return [];
  const [w, p, l] = [workingAgents().length, pausedAgents().length, liveAgents().length];
  const run = (what: 'pauseAll' | 'resumeAll' | 'stopAll') => () => void control().then((c) => c[what](n));
  return [
    ...(w ? [{ label: 'Pause all agents', hint: `${w} working: interrupt and hold them`, icon: 'pause' as const, run: run('pauseAll') }] : []),
    ...(p ? [{ label: 'Resume paused agents', hint: `${p} paused`, icon: 'play' as const, run: run('resumeAll') }] : []),
    ...(l ? [{ label: 'Stop all agents', hint: `${l} running: end their sessions, keep branches`, icon: 'stop' as const, run: run('stopAll') }] : []),
  ];
}

function paint() {
  if (!button) return;
  const p = pausedAgents().length;
  button.classList.toggle('hidden', !liveAgents().length);
  button.classList.toggle('has-paused', p > 0);
  button.title = p ? `${plural(p)} paused. Pause, resume or stop agents` : 'Pause or stop every agent';
}

/** Puts Pause all in the top bar, before Deploy agent, and keeps it current. */
export function installSpend(n: Net) {
  net = n;
  n.send({ t: 'spend.get' });
  const b = h('button.btn.quiet.hb-fleet.hidden', { type: 'button', 'aria-haspopup': 'menu', 'aria-label': 'Pause all', onclick: () => void control().then((c) => c.openMenu(n, b)) }, icon('pause', 14), h('span.hb-fleet-label', {}, 'Pause all'));
  button = b;
  document.getElementById('btn-deploy')?.before(b);
  store.on('roster', paint);
  home.on(paint);
  paint();
}
