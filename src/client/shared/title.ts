/** The tab's title, the same in the 3D office and the 2D view (/lite). No three.js here: the 2D view imports it. */
import { attentionCounts, needingSomeone } from '../../shared/attention';
import { store } from '../state';

/**
 * The tab title counts the workers that need someone, on every floor (the building's one ranking,
 * see shared/attention.ts), so you can see them from another tab.
 */
export function renderTitle() {
  const name = store.project?.name;
  const waiting = needingSomeone(attentionCounts(store.ranked()));
  document.title = `${waiting ? `(${waiting}) ` : ''}${name ? `${name} · ` : ''}Agent Office`;
}

// The roster changes without your floor's workers changing (another floor, a snooze).
store.on('roster', renderTitle);
