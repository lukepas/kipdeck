// Mission control's Review tab: the work that's done and waits for a person, oldest first, across
// every floor: finished turns nobody looked at, pull requests with failing checks, merged ones whose
// workers can go home.

import type { Ranked } from '../../../shared/attention';
import { store } from '../../state';
import { h } from '../dom';
import type { MissionDeps } from './act';
import { rosterRow } from './rows';

export function renderReview(deps: MissionDeps, ranked: Ranked[], now: number): HTMLElement {
  const rows = ranked.filter((r) => r.att.level === 'review');
  if (!rows.length) return h('p.mc-empty', {}, 'Nothing waits for review. Finished work, failing checks and merged pull requests show up here.');
  const showFloor = store.floors.length > 1;
  return h('div.mc-review', {}, h('p.mc-note', {}, 'Oldest first. Review changes opens what the worker changed; a merged pull request means it can go home.'), h('ul.mc-rows', {}, ...rows.map((r) => rosterRow(deps, r, now, { showFloor }))));
}
