/** The tab's title, the same count on the Deck and the home page; the Deck adds its name. No three.js here: the home page imports it. */
import { needsYou, waitsOnYou } from '../../shared/attention';
import { tabTitle } from '../../shared/copy';
import { isDeckPath } from '../../shared/deck';
import { store } from '../state';
import { setFaviconAlert } from '../ui/brand';

/**
 * The tab title (tabTitle in shared/copy.ts) counts who is waiting on you on every project: waitsOnYou
 * in shared/attention.ts, the same rule as the home page's pulse and its Needs you and To review
 * sections, so you can see it from another tab.
 */
export function renderTitle() {
  const ranked = store.ranked();
  // The tab's mark lights its lead chevron in Signal while an agent is in Needs you (a question, or stuck), on any project.
  setFaviconAlert(ranked.some((r) => needsYou(r.att)));
  document.title = tabTitle(ranked.filter((r) => waitsOnYou(r.att)).length, store.project?.name, isDeckPath(location.pathname) ? 'Deck' : undefined);
}

// The roster changes without your floor's workers changing (another floor, a snooze).
store.on('roster', renderTitle);
