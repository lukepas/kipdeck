// Mission control's Crew tab: the units aboard with their one-line records ("A-03 the Mechanic: 41
// merges, 0 reverts"), the chevrons they wear and why, and the unit of the watch. Units only: there
// is no list of people here, and slow records are shown as plainly as quick ones. The epithet chip on
// a row (crewBits) is the same in the Attention and Review tabs. Rules in shared/epithet.ts and
// shared/commendations.ts; the book in client/shared/crew.ts.

import './crew.css';
import { callSign } from '../../../shared/callsign';
import { rosterLine } from '../../../shared/commendations';
import { crewBook, crewOn, epithetOf } from '../../shared/crew';
import type { Chevrons } from '../../../shared/commendations';
import { store } from '../../state';
import { h } from '../dom';
import { unitSign } from '../unitsign';
import type { Ranked } from '../../../shared/attention';
import type { MissionDeps } from './act';
import { crewNow, crewOrder } from './crewnow';
import { locateButton } from './locate';

/** Thin chevrons as marks: white for the record, one violet for a record on chain. */
export function chevronMarks(c: Chevrons): HTMLElement | null {
  const n = c.white + (c.violet ? 1 : 0);
  if (!n) return null;
  const marks = [...Array.from({ length: c.white }, () => h('i.crew-chev')), ...(c.violet ? [h('i.crew-chev.violet')] : [])];
  return h('span.crew-chevs', { title: c.reasons.join('\n'), 'aria-label': `${n} ${n === 1 ? 'chevron' : 'chevrons'}: ${c.reasons.join(', ')}` }, ...marks);
}

/** A row's epithet and chevrons, after its call sign: nothing with epithets off, or on a unit that needs you or is stuck (its row says that and only that). */
export function crewBits(id: string, level?: string): HTMLElement[] {
  if (!crewOn() || level === 'needs-you' || level === 'stuck') return [];
  const e = epithetOf(id);
  const marks = chevronMarks(crewBook().chevrons(id));
  return [e ? h('span.crew-epithet', { title: e.why }, e.title) : null, marks].filter((x): x is HTMLElement => !!x);
}

let asked = false;

/** The Now column of a unit's row: its state's glyph, what it's doing (statusPhrase), for how long, and its latest activity muted. */
function nowCell(r: Ranked | undefined, now: number): HTMLElement {
  if (!r) return h('div.crew-now', {}, h('span.crew-now-state', {}, 'Not ranked yet'));
  const n = crewNow(r, now);
  return h(
    'div.crew-now',
    {},
    h('span.crew-now-state', { class: r.att.level, title: r.att.reason ?? n.state }, h('i.crew-glyph', { 'aria-hidden': 'true' }), h('span.crew-now-text', {}, n.state), h('span.crew-now-for', { title: 'Time in this state' }, n.elapsed)),
    n.activity ? h('span.crew-now-act', { title: n.activity }, n.activity) : null,
  );
}

/** The Crew tab: the units in the attention ranking's order (whoever needs you first), each with its record and what it's doing now. */
export function renderCrew(deps: MissionDeps, ranked: Ranked[], now: number): HTMLElement {
  if (!store.timeline.loaded && !asked) {
    asked = true;
    deps.net.send({ t: 'timeline.get' });
  }
  const on = crewOn();
  const book = crewBook();
  const byId = new Map(ranked.map((r) => [r.entry.id, r]));
  const units = crewOrder(store.roster, ranked, store.floor);
  const watchId = book.watch(store.floor);
  const watch = watchId ? store.roster.find((e) => e.id === watchId) : undefined;
  const rows = units.map((e) => {
    const ep = on ? book.epithets.get(e.id) : undefined;
    const line = rosterLine(callSign(e.deskId) || e.name, ep?.title, book.logs.get(e.id), book.reverts.get(e.id) ?? 0);
    const r = byId.get(e.id);
    return h(
      'li.mc-row.crew-row',
      { class: r?.att.level ?? '', tabindex: '-1', 'data-id': e.id },
      h(
        'div.mc-main.crew-main',
        {},
        unitSign(e.deskId),
        h('div.mc-who', {}, h('span.mc-name', {}, e.name), h('span.mc-sub', {}, e.floorName)),
        nowCell(r, now),
        h(
          'div.mc-what',
          {},
          h('span.crew-line', { title: ep ? `${ep.title}: ${ep.why}` : line }, line),
          ...(on ? [chevronMarks(book.chevrons(e.id))] : []),
          e.id === watchId && on ? h('span.crew-watch', { title: 'The best clean record on the last watch' }, 'Unit of the watch') : null,
        ),
        h('div.mc-btns', {}, locateButton(deps, e)),
      ),
    );
  });
  return h(
    'div.mc-crew',
    {},
    h(
      'p.mc-note',
      {},
      'Records from the deck log as far as it is loaded: merges, pull requests closed unmerged, times stuck, and reverts from the agent record when the office keeps one. Units only, never people. ',
      on ? '' : 'Crew epithets are off in Settings > Deck > Life, so titles and chevrons are hidden.',
    ),
    on && watch ? h('p.crew-watch-line', {}, h('span.crew-watch', {}, 'Unit of the watch'), ` ${callSign(watch.deskId) || watch.name} ${watch.name}${book.epithets.get(watch.id) ? `, ${book.epithets.get(watch.id)!.title}` : ''}: the best clean record on the last watch.`) : null,
    rows.length ? h('ul.mc-rows', {}, ...rows) : h('p.mc-empty', {}, 'No units aboard yet. Deploy one and its record starts with its first merge.'),
  );
}
