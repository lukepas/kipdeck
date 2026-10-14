// The review brief's view (brief/index.ts asks for it): the verdict, the task, what the agent says it
// did, its questions and answers, how it was checked, and the line comments. Loaded the first time a
// brief is shown (with comments.ts and the stylesheet), so the inbox draws without it.

import { verdict, type CiState, type Verdict } from '../../../shared/brief/verdict';
import { duration } from '../../../shared/attention';
import type { ReviewBrief, RosterEntry } from '../../../shared/protocol';
import { h } from '../../ui/dom';
import { icon } from '../../ui/icons';
import { commentsOf } from './store';
import { landGap, landLine } from '../land';
import type { BriefView } from './index';
import './brief.css';

export { installComments } from './comments';

/** "2m ago". */
const ago = (at: number) => {
  const ms = Date.now() - at;
  return ms < 60_000 ? 'just now' : `${duration(ms)} ago`;
};

/** A long text shown in a few lines, with More to read the rest. */
function clamp(cls: string, text: string): HTMLElement {
  const el = h(`p.rb-text.${cls}`, {}, text);
  if (text.length < 220 && !text.includes('\n')) return el;
  el.classList.add('clamped');
  const more = h('button.btn.quiet.rb-more', { type: 'button', 'aria-expanded': 'false' }, 'More');
  more.addEventListener('click', () => {
    const open = el.classList.toggle('clamped');
    more.textContent = open ? 'More' : 'Less';
    more.setAttribute('aria-expanded', String(!open));
  });
  return h('div.rb-clamp', {}, el, more);
}

function row(label: string, ...content: (Node | string | null)[]): HTMLElement {
  return h('div.rb-row', {}, h('span.rb-label', {}, label), h('div.rb-val', {}, ...content));
}

function verdictLine(v: Verdict): HTMLElement {
  if (v.ready) return h('div.rb-verdict.ready', { role: 'status' }, icon('check', 16), h('span', {}, h('b', {}, 'Ready to merge. '), `${v.good.join(', ')}. Nothing flagged.`));
  return h(
    'div.rb-verdict.gap',
    { role: 'status' },
    icon('warning', 16),
    h('div', {}, h('b', {}, v.good.length ? `Checked (${v.good.join(', ')}), but before you merge:` : 'Before you merge:'), h('ul.rb-gaps', {}, ...v.gaps.map((g) => h('li', {}, g)))),
  );
}

function checked(b: ReviewBrief, v: Verdict, ci: CiState | undefined): HTMLElement {
  const parts: (Node | string)[] = [];
  if (v.last) {
    const word = v.tests === 'fail' ? 'failed' : 'passed';
    parts.push(h('span', { class: `rb-run ${v.tests === 'fail' ? 'bad' : ''}` }, h('code', {}, v.last.command), ` ${word} ${ago(v.last.at)}`, v.tests === 'stale' ? ', before its last edit' : ''));
    const earlier = b.runs.length - 1;
    if (earlier > 0) parts.push(h('span.rb-dim', {}, ` (${earlier} earlier run${earlier === 1 ? '' : 's'}, ${b.runs.slice(0, -1).filter((r) => !r.passed).length} failed)`));
  } else parts.push(h('span.rb-dim', {}, 'No test runs.'));
  if (ci && ci !== 'none') parts.push(h('span', { class: `rb-ci ${ci === 'fail' ? 'bad' : ''}` }, ` CI ${ci === 'pass' ? 'passing' : ci === 'fail' ? 'failing' : 'running'}.`));
  return row('Checked', ...parts);
}

/** Draws `b`, the brief for `e`. */
export function renderBrief(e: RosterEntry, b: ReviewBrief): BriefView {
  const ci = e.pr && e.pr.state !== 'merged' ? (e.pr.checks ?? 'none') : undefined;
  const comments = commentsOf(e.id);
  const found = verdict(b, ci);
  // Work that conflicts with its base can't be merged as it is, whatever its tests say (land.ts).
  const clash = landGap(e);
  const v = clash ? { ...found, ready: false, gaps: [`${clash}.`, ...found.gaps] } : found;
  const el = h(
    'section.rv-brief',
    { 'aria-label': 'Review brief' },
    verdictLine(v),
    h(
      'div.rb-rows',
      {},
      b.task ? row('Task', clamp('rb-task', b.task), b.followUps.length ? h('details.rb-since', {}, h('summary', {}, `Told since: ${b.followUps.length}`), h('ol', {}, ...b.followUps.map((f) => h('li', {}, f)))) : null) : null,
      row('It says', b.summary ? clamp('rb-summary', b.summary) : h('span.rb-dim', {}, 'It left no summary of what it did.')),
      b.qa.length ? row('Asked', h('ul.rb-qa', {}, ...b.qa.map((q) => h('li', {}, h('span.rb-q', {}, q.question), h('span.rb-a', {}, q.answer ? `You said: ${q.answer}` : 'Answered in its terminal'))))) : null,
      checked(b, v, ci),
      landLine(e),
      row('Comments', h('span', { class: comments.length ? 'rb-count' : 'rb-dim' }, comments.length ? `${comments.length} on the diff, sent with Send back.` : 'Click a line number in the diff (or Tab to one and press Enter) to comment on it.')),
    ),
  );
  return { el, ready: v.ready, gap: v.gaps[0] };
}
