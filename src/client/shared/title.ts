/** The tab's title, the same in the 3D bridge and the home page. No three.js here: the home page imports it. */
import { needingSomeone } from '../../shared/attention';
import { store } from '../state';
import { setFaviconAlert } from '../ui/brand';

/**
 * The tab title counts what needs someone, on every floor (the building's one ranking, see
 * shared/attention.ts, with the review inbox), as the attention chip does, so you can see it from another tab.
 */
export function renderTitle() {
  const name = store.project?.name;
  const counts = store.counts();
  const waiting = needingSomeone(counts);
  // The tab's mark lights its lead chevron in Signal while a unit needs you, on any floor.
  setFaviconAlert(counts['needs-you'] > 0);
  document.title = `${waiting ? `(${waiting}) ` : ''}${name ? `${name} · ` : ''}Mergeline`;
}

// The roster changes without your floor's workers changing (another floor, a snooze).
store.on('roster', renderTitle);
