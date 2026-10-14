// The inbox's one-time section hints (words and rules in shared/hints.ts): the first time a section has
// rows, one line under its header says what it's for. "Got it" puts that hint away for good, in this
// browser, kept beside the first-run checklist (state.ts). Not a tour: nothing pops up or blocks, and
// the demo's coach strip stands in for them there.

import { hintShown, parseHints, SECTION_HINT, type HintsSeen } from '../../shared/hints';
import type { InboxSection } from '../../shared/inbox';
import { storageKey } from '../shared/storage-key';
import { h } from '../ui/dom';
import { icon } from '../ui/icons';
import { home } from './state';
import './hints.css';

const KEY = storageKey('hints');

function load(): HintsSeen {
  try {
    return parseHints(localStorage.getItem(KEY));
  } catch {
    return {};
  }
}

let seen = load();

/** Puts a section's hint away for good, and draws the list again without it. */
export function dismissHint(section: InboxSection) {
  seen = { ...seen, [section]: true };
  try {
    localStorage.setItem(KEY, JSON.stringify(seen));
  } catch {
    // storage blocked: it stays away as long as the page
  }
  home.change();
}

/** The hint under a section's header, or null once it's put away, with no rows, or in the demo. */
export function sectionHint(section: InboxSection, rows: number): HTMLElement | null {
  if (!hintShown(section, rows, seen, home.demo)) return null;
  return h(
    'p.sec-hint',
    { 'data-hint': section },
    h('span', {}, SECTION_HINT[section]),
    h('button.sec-hint-ok', { type: 'button', 'aria-label': 'Got it, hide this hint', onclick: () => dismissHint(section) }, icon('check', 12), 'Got it'),
  );
}
