// The Reminders at the top of Mission control's Attention tab: what nobody has to answer right now
// but somebody will (shared/reminders.ts), each with the thing to do, and a snooze or a dismiss.

import { SNOOZE_CHOICES } from '../../../shared/attention';
import { ago } from '../../../shared/rowtext';
import { reminderSnoozed } from '../../../shared/reminders';
import type { Reminder } from '../../../shared/protocol';
import { store } from '../../state';
import { h } from '../dom';
import { reminderAction, runReminder, snoozeReminder, type MissionDeps } from './act';

/** The reminders open now, the snoozed ones left out. */
export function openReminders(now = Date.now()): Reminder[] {
  return store.reminders.filter((r) => !reminderSnoozed(r, now));
}

function snoozedLabel(r: Reminder): string {
  const s = r.snooze!;
  return s.until === 'change' ? `dismissed by ${s.by}` : `snoozed by ${s.by} until ${new Date(s.until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function reminderRow(deps: MissionDeps, r: Reminder, now: number, showFloor: boolean): HTMLElement {
  const snoozed = reminderSnoozed(r, now);
  const btn = (label: string, run: () => void, title?: string) => h('button.btn.small', { type: 'button', title, onclick: run }, label);
  return h(
    'li.mc-row.reminder',
    { class: snoozed ? 'snoozed' : '', tabindex: '-1', 'data-id': `r:${r.key}` },
    h(
      'div.mc-main',
      {},
      h('span.dot.mc-reminder-dot', { 'aria-hidden': 'true' }),
      h('div.mc-who', {}, h('span.mc-name', {}, r.text), h('span.mc-sub', {}, [showFloor ? r.floorName : '', snoozed ? snoozedLabel(r) : ''].filter(Boolean).join(' · '))),
      h('span.mc-time', { title: 'This way for' }, ago(now - r.since)),
      h(
        'div.mc-btns',
        {},
        h('button.btn.small.mc-act', { type: 'button', onclick: () => runReminder(deps, r) }, reminderAction(r)),
        ...(snoozed
          ? [btn('Bring back', () => snoozeReminder(deps.net, r, null), 'It asks for attention again')]
          : [btn(`Snooze ${SNOOZE_CHOICES[0].label}`, () => snoozeReminder(deps.net, r, Date.now() + SNOOZE_CHOICES[0].ms)), btn('Dismiss', () => snoozeReminder(deps.net, r, 'change'), 'Until what it is about changes')]),
      ),
    ),
  );
}

/** The Reminders section, or nothing when there are none. */
export function renderReminders(deps: MissionDeps, now: number): HTMLElement | null {
  const all = store.reminders;
  if (!all.length) return null;
  const open = openReminders(now);
  const showFloor = store.floors.length > 1;
  const sorted = [...all].sort((a, b) => Number(reminderSnoozed(a, now)) - Number(reminderSnoozed(b, now)) || a.since - b.since);
  return h(
    'section.mc-group.mc-reminders',
    {},
    h('div.mc-level.reminders', {}, h('span.mc-level-name', {}, 'Reminders'), h('span.mc-level-n', {}, String(open.length)), h('span.mc-level-what', {}, 'Nothing urgent, but somebody has to see to these')),
    h('ul.mc-rows', {}, ...sorted.map((r) => reminderRow(deps, r, now, showFloor))),
  );
}
