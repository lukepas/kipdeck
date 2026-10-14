// The review brief at the top of the pane's Changes tab, above the diff: whether the work is ready to
// merge and, if not, the gap in plain words; the task it was given and what it was told since; what
// it says it did; the questions it asked and the answers it got; and how it was checked (its own test
// runs, the pull request's CI). The office puts it together (server/brief/); the verdict is
// shared/brief/verdict.ts. Its view (view.ts, with the line comments in the diff, comments.ts) loads
// the first time a brief is shown; the comments themselves (store.ts) go with Send back.

import { workKey } from '../../../shared/brief/row-verdict';
import type { ReviewBrief, RosterEntry, ServerMsg } from '../../../shared/protocol';
import type { Net } from '../../net';
import { h } from '../../ui/dom';
import { home } from '../state';
import { commentsOf, onComments } from './store';

export { clearComments, commentsNote, commentsOf } from './store';

export interface BriefView {
  el: HTMLElement;
  /** Verified with nothing flagged: one confident Merge. */
  ready: boolean;
  /** The first gap, for Merge's title when it isn't. */
  gap?: string;
}

const briefs = new Map<string, ReviewBrief>();
/** What each agent's brief was last asked for at, so it's asked again only when its work moves on. */
const asked = new Map<string, string>();
let net: Net | undefined;
let body: HTMLElement | undefined;
/** The brief last drawn, and what it was drawn from. */
let drawn: { key: string; view: BriefView } | undefined;
let view: typeof import('./view') | undefined;
let loading: Promise<void> | undefined;

/** Loads the view the first time a brief is shown, and follows the pane's diff for line comments from then on. */
function loadView() {
  loading ??= import('./view').then((m) => {
    view = m;
    if (body) m.installComments(body, () => (home.tab === 'changes' ? home.selected : undefined));
    home.change();
  });
}

/** Follows the office's briefs; `paneBody` is where the diff is drawn, for line comments. */
export function installBrief(n: Net, paneBody: HTMLElement) {
  net = n;
  body = paneBody;
  n.onMessage((msg: ServerMsg) => {
    if (msg.t === 'brief') {
      briefs.set(msg.brief.workerId, msg.brief);
      if (home.selected === msg.brief.workerId) home.change();
    } else if (msg.t === 'welcome') asked.clear();
  });
  onComments(() => home.change());
}

/** The brief for `e`, asking the office for it when its work has moved on since the last time. */
export function reviewBrief(e: RosterEntry): BriefView {
  const key = workKey(e);
  if (net && asked.get(e.id) !== key) {
    asked.set(e.id, key);
    net.send({ t: 'brief.get', workerId: e.id });
  }
  const b = briefs.get(e.id);
  if (!view) loadView();
  if (!b || !view) return { el: h('section.rv-brief.loading', { 'aria-label': 'Review brief' }, h('p.rb-dim', {}, 'Reading its brief...')), ready: false };
  // Drawn again only when what it says changes, so an open "Told since" or More stays open.
  const drawKey = `${e.id}|${b.at}|${e.pr?.state}|${e.pr?.checks}|${commentsOf(e.id).length}`;
  if (drawn?.key !== drawKey) drawn = { key: drawKey, view: view.renderBrief(e, b) };
  return drawn.view;
}
