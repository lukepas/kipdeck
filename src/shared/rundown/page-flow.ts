// The map page's flow, read top to bottom: the header with its section rail, (1) Road (the milestones
// as a track with "you are here" and the active checklist), (2) Next (the one next step, with Copy as
// prompt), (3) Needs you (open decisions with the default outlined, then stuck parts no decision
// covers), (4) Parts (one pill per part), and each part's drawer. Every fact has one home on the page;
// anything else that mentions it is a chip or a link to it. Every string from the model is escaped.

import { inferredNext } from '../signal-parts.js';
import { esc, plural } from './html-sections.js';
import { icon, ring, track, waitIcon } from './page-svg.js';
import { STATUS_LABEL, type Change, type Decision, type Milestone, type Part, type Rundown, type RundownState, type Status } from './schema.js';
import { ago, bestDefault, changeChip, defaultReason, fmtDay, GLYPH, HERE, NEXT, type Needs, nextItem, shortName, STATUS_ORDER, unblocks } from './view.js';

export const num = (n: number | null | undefined) => (n == null ? '-' : Number(n).toLocaleString('en-US'));
export const short = (sha: string | null | undefined) => (sha ? sha.slice(0, 7) : '-');
export const time = (iso: string | null | undefined, now: number) => (iso ? `<time datetime="${esc(iso)}" title="${esc(String(iso).replace('T', ' ').slice(0, 16))}" data-rel>${esc(ago(iso, now))}</time>` : '-');
export const glyph = (s: Status) => `<span class="g st-${s}" aria-hidden="true">${GLYPH[s]}</span>`;
const badge = (s: Status) => `<span class="badge st-${s}">${glyph(s)} ${STATUS_LABEL[s]}</span>`;
const NUMS = ['①', '②', '③', '④'];
const DAY_MS = 86_400_000;

export type StepId = 'road' | 'next' | 'needs' | 'parts';

/** What every section reads besides the model. */
export interface FlowCtx {
  now: number;
  nowDate: Date;
  theme: 'dark' | 'light';
  judged: boolean;
  steps: { id: StepId; label: string; short?: string }[];
  needs: Needs;
  prev: RundownState | null;
  /** When Claude's judgement.json was written: a quick run says when its next step is from. */
  judgedAt: string | null;
  /** The index of every project's rundown (a file: URL), or null when there is none to link. */
  indexHref: string | null;
  changes: Change[];
  partById: Map<string, Part>;
  nextItem: { milestoneId: string; index: number } | null;
  /** Files in no part. */
  unassigned: number;
}

const STEP_NUM: Record<StepId, number> = { road: 0, next: 1, needs: 2, parts: 3 };
/** A section heading, numbered once the page is judged (before that there's no flow to follow). */
export const sh = (key: StepId, ctx: FlowCtx, title: string, extra = '', id = '') => `<h2 class="sh"${id ? ` id="${id}"` : ''}>${ctx.judged ? `<span class="num" aria-hidden="true">${NUMS[STEP_NUM[key]]}</span>` : ''}${title}${extra}</h2>`;
/** A clamped line with a "more" disclosure, so touch and keyboard users can read the whole of it. */
const clampMore = (cls: string, html: string, lines = 2) => `<details class="cmore ${cls}"><summary><span class="clamp${lines}">${html}</span><span class="more" aria-hidden="true"></span></summary></details>`;

/** A part chip: glyph and short name, opens the drawer. Neutral (no status colour) on finished checklist rows. */
const partChip = (p: Part, neutral = false) =>
  neutral
    ? `<button type="button" class="pchip neutral" data-open-part="${esc(p.id)}" title="${esc(p.name)}"><span>${esc(shortName(p))}</span></button>`
    : `<button type="button" class="pchip" data-open-part="${esc(p.id)}" title="${esc(p.name)}: ${STATUS_LABEL[p.status]}">${glyph(p.status)}<span>${esc(shortName(p))}</span><span class="sr"> (${STATUS_LABEL[p.status]})</span></button>`;

// ---------- header ----------

export function header(r: Rundown, ctx: FlowCtx): string {
  const h = r.project.head;
  const g = r.facts.git;
  const u = g?.uncommitted;
  const unc = u ? u.staged + u.modified + u.deleted + u.untracked : 0;
  const where = h
    ? `<code class="chip mono hide-s" title="${esc(h.subject || '')}">${esc(h.branch || 'detached')} @ ${short(h.sha)}</code>`
    : g
      ? `<span class="chip mono hide-s">no commits yet</span>`
      : '';
  const warn = ctx.needs.stuck.length || ctx.needs.link.coverOf.size;
  const rail = ctx.steps
    .map((s) => {
      const count = s.id === 'needs' && ctx.needs.count ? ` <span class="rbadge${warn ? ' warn' : ''}" aria-hidden="true">${ctx.needs.count}</span>` : '';
      const aria = s.id === 'needs' && ctx.needs.count ? `${s.label}, ${ctx.needs.count} waiting` : s.label;
      return `<li><a href="#${s.id}" data-rail="${s.id}" aria-label="${esc(aria)}">${ctx.judged ? `<span class="num" aria-hidden="true">${NUMS[STEP_NUM[s.id]]}</span>` : ''}<span class="lbl" aria-hidden="true">${s.label}</span><span class="lbl-s" aria-hidden="true">${s.short ?? s.label}</span>${count}</a></li>`;
    })
    .join('<li class="sep" aria-hidden="true">·</li>');
  const bd = u ? `${u.staged} staged · ${u.modified} modified · ${u.deleted} deleted · ${u.untracked} untracked${g?.stashes ? ` · ${plural(g.stashes, 'stash', 'stashes')}` : ''}` : '';
  const home = ctx.indexHref ? `<a class="home-btn" href="${esc(ctx.indexHref)}" aria-label="All rundowns" title="All rundowns">${icon('back')}<span class="hb-l">All rundowns</span><span class="hb-s" aria-hidden="true">All</span></a>` : '';
  return `<header class="top" id="top"><div class="wrap bar">
${home}<h1 class="brand"><span class="bdot" aria-hidden="true"></span><span class="bname" title="${esc(r.project.name)}">${esc(r.project.name)}</span></h1>
${where}<span class="upd">updated ${time(r.generatedAt, ctx.now)}</span><span class="grow"></span>
${unc > 0 ? `<span class="chip hide-s" tabindex="0" title="${bd}">${num(unc)} uncommitted<span class="sr">: ${bd}</span></span>` : ''}
<button id="theme" class="icon-btn" type="button" aria-pressed="${ctx.theme === 'dark'}" aria-label="Dark theme">${icon('moon', 'i-moon')}${icon('sun', 'i-sun')}</button>
</div>
<nav class="rail" aria-label="Sections"><div class="wrap"><ol>${rail}</ol></div></nav>
</header>`;
}

export function describe(r: Rundown): string {
  const d = r.project.description;
  if (!d) return '';
  return `<details class="desc"><summary><span class="clamp1" title="${esc(d)}">${esc(d)}</span><span class="more" aria-hidden="true"></span></summary></details>`;
}

// ---------- (1) Road ----------

function itemsList(m: Milestone, ctx: FlowCtx): string {
  if (!m.items.length) return '<p class="muted small">No items yet. Add some under this milestone in .rundown/milestones.md.</p>';
  const ni = ctx.nextItem && ctx.nextItem.milestoneId === m.id ? ctx.nextItem.index : -1;
  // A part chip shows once per run of rows on the same part; done rows get a neutral chip.
  let prevPart: string | null = null;
  const row = (i: number) => {
    const it = m.items[i];
    const p = it.partId ? ctx.partById.get(it.partId) : undefined;
    const next = i === ni;
    const showChip = p && (next || p.id !== prevPart);
    prevPart = p ? p.id : null;
    return `<li class="it${it.done ? ' done' : ''}${next ? ' next' : ''}"><span class="ck-g${it.done ? ' st-done' : ''}" aria-hidden="true">${it.done ? GLYPH.done : '○'}</span><span class="it-t">${esc(it.text)}<span class="sr">${it.done ? ' (done)' : ' (open)'}</span></span>${next ? `<a class="tag-next" href="#next">${NEXT} next</a>` : ''}${showChip && p ? partChip(p, it.done) : ''}</li>`;
  };
  const idx = m.items.map((_, i) => i);
  const open = idx.filter((i) => !m.items[i].done);
  const done = idx.filter((i) => m.items[i].done);
  const openHtml = open.map(row).join('');
  prevPart = null;
  const doneHtml =
    done.length <= 3
      ? done.map(row).join('')
      : `<li class="it fold"><details><summary><span class="ck-g st-done" aria-hidden="true">${GLYPH.done}</span> +${done.length} done</summary><ul class="items">${done.map(row).join('')}</ul></details></li>`;
  return `<ul class="items">${openHtml}${doneHtml}</ul>`;
}

function checklistBody(m: Milestone, ctx: FlowCtx): string {
  const meta = [m.state === 'done' ? `${GLYPH.done} done` : '', m.due ? `due ${esc(fmtDay(m.due, ctx.nowDate))}` : ''].filter(Boolean).join(' · ');
  return `<summary><span class="ck-h"><b>${esc(m.id)} · ${esc(m.name)}</b>${meta ? `<span class="muted small">${meta}</span>` : ''}</span></summary>
${m.doneWhen ? `<p class="dw clamp1" title="${esc(m.doneWhen)}">Done when: ${esc(m.doneWhen)}</p>` : ''}
${itemsList(m, ctx)}`;
}

function nodeBadges(m: Milestone, ctx: FlowCtx): string {
  const out: string[] = [];
  for (const c of ctx.changes) {
    if (c.ref !== m.id) continue;
    if (c.kind === 'milestone-done') out.push('just finished');
    else if (c.kind === 'milestone-progress') {
      const d = Number(c.to ?? 0) - Number(c.from ?? 0);
      out.push(`${d >= 0 ? '+' : '-'}${Math.abs(d)} done`);
    }
  }
  if (ctx.prev?.milestones.length && !ctx.prev.milestones.some((x) => x.id === m.id)) out.push('new');
  return out.map((b) => `<span class="dbadge">${esc(b)}</span>`).join('');
}

export function sinceRow(r: Rundown, ctx: FlowCtx): string {
  if (!r.previous) return '<div class="since"><span class="chip muted">first rundown</span></div>';
  const when = esc(fmtDay(r.previous.generatedAt, ctx.nowDate));
  if (!r.changes.length) return `<div class="since"><span class="chip muted">no changes since ${when}</span></div>`;
  const chips = r.changes
    .slice(0, 5)
    .map((c) => {
      const ch = changeChip(c, r.parts);
      return ch.href ? `<a class="chip t-${ch.tone}" href="${esc(ch.href)}" title="${esc(c.text)}">${esc(ch.label)}</a>` : `<span class="chip t-${ch.tone}" title="${esc(c.text)}">${esc(ch.label)}</span>`;
    })
    .join('');
  const rest = r.changes.slice(5);
  return `<div class="since"><span class="since-l">Since ${when}:</span>${chips}${rest.length ? `<details class="since-more"><summary class="chip">+${rest.length} more</summary><ul>${rest.map((c) => `<li>${esc(c.text)}</li>`).join('')}</ul></details>` : ''}</div>`;
}

export function roadSection(r: Rundown, ctx: FlowCtx): string {
  const ms = r.milestones;
  const proposed = ms.some((m) => m.source === 'proposed') ? ' <span class="tagpill" title="Drafted by /rundown. Edit .rundown/milestones.md to make it yours.">Proposed</span>' : '';
  if (!ms.length) return `<section id="road" class="sec" aria-labelledby="h-road">${sh('road', ctx, 'Road', '', 'h-road')}\n<p class="muted">No milestones yet. Run /rundown to draft them.</p>${sinceRow(r, ctx)}</section>`;
  const activeIdx = ms.findIndex((m) => m.state === 'active');
  const allDone = activeIdx === -1;
  const focus = allDone ? ms.length - 1 : activeIdx;
  // Leading done milestones fold into one node.
  const F = focus;
  const foldD = ms.length > 6 && F >= 2;
  const foldM = F >= 2;
  const aheadM = ms.length - (focus + 2);
  const cls = (hideD: boolean, hideM: boolean, key: number | 'fold') => `${hideD ? ' hide-d' : ''}${hideM ? ' hide-m' : ''}${(foldD ? 'fold' : 0) === key ? ' first-d' : ''}${(foldM ? 'fold' : 0) === key ? ' first-m' : ''}`;
  const nodes: string[] = [];
  if (F >= 2) {
    nodes.push(`<li class="node ms-done fold${cls(!foldD, false, 'fold')}">${track('solid')}<div class="nflag"></div><button type="button" class="nbtn" data-unfold aria-label="${esc(ms[0].id)} to ${esc(ms[F - 1].id)} done, show them"><span class="ndw"><span class="ndot"></span></span><span class="nlab"><b>${esc(ms[0].id)}-${esc(ms[F - 1].id)}</b><span class="nmeta">${GLYPH.done} done</span></span></button></li>`);
  }
  ms.forEach((m, i) => {
    const done = m.items.filter((x) => x.done).length;
    const isFocus = i === focus;
    const state = m.state;
    const hideD = foldD && i < F;
    const hideM = (foldM && i < F) || i > focus + 1;
    const flag = isFocus ? (allDone ? `${icon('flag')} all done` : `${HERE} you are here`) : '';
    const due = m.due ? ` · due ${esc(fmtDay(m.due, ctx.nowDate))}` : '';
    // The active node's progress is its ring ("2/4"); its meta line carries only the due date.
    const meta = state === 'done' ? `${GLYPH.done} done` : state === 'active' ? (m.due ? `due ${esc(fmtDay(m.due, ctx.nowDate))}` : '') : `${plural(m.items.length, 'item')}${due}`;
    const dot = state === 'active' ? `<span class="ringw">${ring(done, m.items.length)}<span class="ring-t">${done}/${m.items.length}</span></span>` : '<span class="ndot"></span>';
    const label = `${m.id} ${m.name}: ${state === 'done' ? 'done' : state === 'active' ? `in progress, ${done} of ${m.items.length} items done` : `not started, ${plural(m.items.length, 'item')}`}`;
    nodes.push(
      `<li class="node ms-${state}${isFocus ? ' focus' : ''}${cls(hideD, hideM, i)}" id="node-${esc(m.id)}">${track(state === 'ahead' ? 'dashed' : 'solid')}<div class="nflag">${flag}</div><a class="nbtn" href="#${state === 'active' ? 'checklist' : `msd-${esc(m.id)}`}" data-ms="${esc(m.id)}" aria-controls="checklist" aria-label="${esc(label)}"${state === 'active' ? ' aria-current="step"' : ''}><span class="ndw">${dot}</span><span class="nlab"><b>${esc(m.id)}</b><span class="nname" title="${esc(m.name)}">${esc(m.name)}</span>${meta ? `<span class="nmeta">${meta}</span>` : ''}${nodeBadges(m, ctx)}</span></a></li>`,
    );
  });
  if (aheadM > 0) nodes.push(`<li class="node ms-ahead more-m">${track('dashed')}<div class="nflag"></div><a class="nbtn" href="#ms-others" aria-label="${aheadM} more milestones ahead"><span class="ndw"><span class="ndot"></span></span><span class="nlab"><b>+${aheadM}</b><span class="nmeta">ahead</span></span></a></li>`);
  const active = allDone ? null : ms[activeIdx];
  const others = ms.filter((m) => m !== active);
  const check = active ? `<details open class="ck">${checklistBody(active, ctx)}</details>` : `<div class="ck ck-done"><p>${icon('flag')} All milestones done. Add the next one in .rundown/milestones.md</p></div>`;
  // "Other milestones" is the fallback without the script and on phones: on a wide screen every node
  // shows and clicking one swaps the checklist, so it hides (need-m: a phone hides some nodes).
  const needM = foldM || aheadM > 0;
  return `<section id="road" class="sec" aria-labelledby="h-road">${sh('road', ctx, 'Road', proposed, 'h-road')}
<ol class="track${foldD ? ' folded' : ''}" aria-label="Milestones">${nodes.join('')}</ol>
${sinceRow(r, ctx)}
<div id="checklist" class="checklist" role="region" aria-live="polite" aria-label="Milestone checklist">${check}</div>
${others.length ? `<details class="others${needM ? ' need-m' : ''}" id="ms-others"><summary>Other milestones <span class="muted small">${others.map((m) => esc(m.id)).join(' · ')}</span></summary>${others.map((m) => `<details class="msd" id="msd-${esc(m.id)}">${checklistBody(m, ctx)}</details>`).join('')}</details>` : ''}
</section>`;
}

// ---------- (2) Next ----------

/** The prompt Copy as prompt puts on the clipboard for the next step. */
export const nextPrompt = (text: string) => `Do the next step from .rundown: ${text}`;
/** The prompt a decision's option button copies. */
export const answerPrompt = (d: Pick<Decision, 'id'>, option: string) => `Answer ${d.id} in .rundown/decisions.md: "${option}". Then /rundown quick.`;

export function nextSection(r: Rundown, ctx: FlowCtx): string {
  const ns = r.nextStep;
  if (!ns) {
    const allDone = ctx.judged && r.milestones.length > 0 && r.milestones.every((m) => m.state === 'done');
    // Without Claude's next step, the one the office's window and Signal's card work out from the code.
    const guess = allDone ? null : inferredNext(r);
    if (guess) return `<section id="next" class="sec" aria-labelledby="h-next">${sh('next', ctx, 'Next', '', 'h-next')}<div class="next-card"><span class="next-ic">${icon('arrow')}</span><div class="next-body"><p class="next-t">${esc(guess)}</p><p class="next-why">Inferred from the code. Run /rundown for Claude's read.</p><div class="next-foot"><button type="button" class="btn-ghost" data-copy="${esc(nextPrompt(guess))}" data-toast="Copied. Paste it to Claude.">${icon('copy')} Copy as prompt</button></div></div></div></section>`;
    const msg = allDone ? 'Nothing next: all milestones are done. Add one to <code>.rundown/milestones.md</code> to set the next goal.' : 'Run /rundown for a suggested next step.';
    return `<section id="next" class="sec" aria-labelledby="h-next">${sh('next', ctx, 'Next', '', 'h-next')}<div class="next-card empty"><p class="muted">${msg}</p></div></section>`;
  }
  const p = ns.partId ? ctx.partById.get(ns.partId) : undefined;
  // A milestoneId pointing at a finished milestone is stale: the current one instead.
  let mid = ns.milestoneId && r.milestones.some((m) => m.id === ns.milestoneId) ? ns.milestoneId : null;
  if (mid && r.milestones.find((m) => m.id === mid)?.state === 'done') mid = r.milestones.find((m) => m.state === 'active')?.id ?? null;
  // D# in the text links to its decision card.
  const open = new Set(r.decisions.filter((d) => !d.answer).map((d) => d.id));
  const linkD = (t: string) => esc(t).replace(/\bD\d+\b/g, (id) => (open.has(id) ? `<a href="#dec-${id}">${id}</a>` : id));
  const ub = unblocks(r);
  const stale = r.generator.mode === 'quick' && ctx.judgedAt && fmtDay(ctx.judgedAt, ctx.nowDate) !== fmtDay(r.generatedAt, ctx.nowDate) ? ` <span class="muted small">from ${esc(fmtDay(ctx.judgedAt, ctx.nowDate))}</span>` : '';
  return `<section id="next" class="sec" aria-labelledby="h-next">${sh('next', ctx, 'Next', '', 'h-next')}
<div class="next-card"><span class="next-ic">${icon('arrow')}</span><div class="next-body">
<p class="next-t">${linkD(ns.text)}${stale}</p>
${ns.why ? clampMore('next-why', esc(ns.why)) : ''}
<div class="next-foot">${mid ? `<a class="chip t-accent" href="#node-${esc(mid)}" data-select-ms="${esc(mid)}">${esc(mid)}</a>` : ''}${p ? partChip(p) : ''}${ub > 0 ? `<span class="chip t-neutral">unblocks ${ub}</span>` : ''}<button type="button" class="btn-ghost" data-copy="${esc(nextPrompt(ns.text))}" data-toast="Copied. Paste it to Claude.">${icon('copy')} Copy as prompt</button></div>
</div></div></section>`;
}

// ---------- (3) Needs you ----------

function decisionCard(d: Decision, ctx: FlowCtx): string {
  const best = bestDefault(d);
  const opts = d.options.length ? d.options : d.default ? [d.default] : [];
  const optHtml = opts
    .map((o) => {
      const isDef = best ? o === best : !d.options.length;
      return `<button type="button" class="opt${isDef ? ' is-default' : ''}" data-copy="${esc(answerPrompt(d, o))}" data-toast="Copied. Paste it to Claude."${isDef && d.default ? ` title="Default: ${esc(d.default)}"` : ''}><span class="opt-t">${esc(o)}</span>${isDef ? '<span class="def-l">default</span>' : ''}</button>`;
    })
    .join('');
  // Only the words the default adds beyond its option (a reason), never the option again.
  const reason = d.options.length ? defaultReason(d) : null;
  const why = reason ? clampMore('dec-why', `<span class="why-l">Why default</span> ${esc(reason)}`) : '';
  const linked = ctx.needs.link.byDecision.get(d.id) ?? [];
  const ub = linked.length
    ? `<div class="dec-ub"><span class="ub-l">Unblocks</span>${linked.map((x) => partChip(x.part)).join('')}${linked
        .filter((x) => x.primary)
        .map((x) => clampMore('wait', `${linked.length > 1 ? `${esc(shortName(x.part))} ` : ''}waiting on: ${esc(x.part.waitingOn)}`))
        .join('')}</div>`
    : '';
  return `<article class="dec" id="dec-${esc(d.id)}" aria-labelledby="dq-${esc(d.id)}">
<div class="dec-top"><span class="did">${esc(d.id)}</span><h3 class="dq" id="dq-${esc(d.id)}">${esc(d.question)}</h3></div>
${optHtml ? `<div class="opts" role="group" aria-label="Options for ${esc(d.id)}; each copies an answer prompt">${optHtml}</div>` : ''}
${why}${ub}${d.raised ? `<p class="raised">raised ${esc(fmtDay(d.raised, ctx.nowDate))}</p>` : ''}</article>`;
}

const stuckRow = (p: Part) =>
  `<button type="button" class="stuck-row" id="stuck-${esc(p.id)}" data-open-part="${esc(p.id)}"><span class="sr-ic">${icon(waitIcon(p.waitingOn))}</span><span class="sr-name">${glyph('stuck')}<span>${esc(p.name)}</span><span class="sr"> (stuck)</span></span><span class="sr-wait clamp2">waiting on: ${esc(p.waitingOn || 'not stated')}</span></button>`;

/** The next step's own stuck part: one line pointing up to the Next card (its waitingOn would repeat it). */
const nextPartRow = (p: Part) =>
  `<a class="stuck-row is-next" id="stuck-${esc(p.id)}" href="#next"><span class="sr-ic">${icon('arrow')}</span><span class="sr-name">${glyph('stuck')}<span>${esc(p.name)}</span><span class="sr"> (stuck)</span></span><span class="sr-wait">is your next step <span aria-hidden="true">↑</span></span></a>`;

export function needsSection(r: Rundown, ctx: FlowCtx): string {
  const q = ctx.needs;
  const answered = r.decisions.filter((d) => d.answer);
  // Stuck rows never fold; decisions fill the room left (one at least).
  const room = Math.max(1, 4 - q.stuck.length);
  const shownD = q.decisions.slice(0, room);
  const restD = q.decisions.slice(room);
  const decBlock = (list: Decision[]) => (list.length ? `<div class="dec-grid${list.length > 3 ? ' two' : ''}">${list.map((d) => decisionCard(d, ctx)).join('')}</div>` : '');
  const stuckHtml = q.stuck.length || q.nextPart ? `<div class="stuck-list">${q.stuck.map(stuckRow).join('')}${q.nextPart ? nextPartRow(q.nextPart) : ''}</div>` : '';
  const warn = q.stuck.length || q.link.coverOf.size;
  const count = q.count ? ` <span class="count${warn ? ' warn' : ''}">${q.count}</span>` : '';
  return `<section id="needs" class="sec" aria-labelledby="h-needs"><span id="decisions" class="anchor"></span>${sh('needs', ctx, 'Needs you', count, 'h-needs')}
${q.count ? `${decBlock(shownD)}${stuckHtml}` : `<p class="ok-line"><span aria-hidden="true">${GLYPH.done}</span> Nothing is waiting on you</p>${stuckHtml}`}
${restD.length ? `<details class="more-needs"><summary>Show ${plural(restD.length, 'more decision')}</summary>${decBlock(restD)}</details>` : ''}
${answered.length ? `<details id="answered" class="answered"><summary>${GLYPH.done} ${answered.length} answered</summary><ul>${answered.map((d) => `<li><b>${esc(d.id)}</b> ${esc(d.question)} <span class="muted">→ ${esc(d.answer)}</span></li>`).join('')}</ul></details>` : ''}
${q.decisions.length ? '<p class="muted small foot-note">Until answered, the map assumes each default.</p>' : ''}
</section>`;
}

// ---------- (4) Parts ----------

const linkedItems = (r: Rundown, p: Part) => r.milestones.flatMap((m) => m.items.filter((i) => i.partId === p.id).map((i) => ({ ...i, m: m.id })));

/** Linked milestone items as plain text ("2/5 items"), so nothing on the pill needs a legend. */
function cells(done: number, total: number): string {
  if (!total) return '';
  return `<span class="cells${done === total ? ' all' : ''}" title="${done} of ${total} milestone items done"><span aria-hidden="true">${done === total ? GLYPH.done : '▰'}</span> ${done}/${total} ${total === 1 ? 'item' : 'items'}<span class="sr"> done</span></span>`;
}

export function partsSection(r: Rundown, ctx: FlowCtx): string {
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, r.parts.filter((p) => p.status === s).length])) as Record<Status, number>;
  const bar = STATUS_ORDER.filter((s) => counts[s]).map((s) => `<span class="seg st-${s}" style="flex:${counts[s]}"></span>`).join('');
  const legend = STATUS_ORDER.filter((s) => counts[s]).map((s) => `<li>${glyph(s)} ${counts[s]} ${STATUS_LABEL[s].toLowerCase()}</li>`).join('');
  const inferred = r.parts.length > 0 && r.parts.every((p) => p.statusSource === 'inferred');
  // Before any judgement the folder statuses are only guesses from activity: shown neutral.
  const neutral = inferred && !ctx.judged;
  const prevStatus = new Map(ctx.changes.filter((c) => c.kind === 'part-status').map((c) => [c.ref, String(c.from)]));
  const lc = (p: Part) => (p.metrics.lastCommit ? Date.parse(p.metrics.lastCommit) : 0);
  const live = r.parts.filter((p) => p.status !== 'done').sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || lc(b) - lc(a));
  const done = r.parts.filter((p) => p.status === 'done');
  const pill = (p: Part) => {
    const items = linkedItems(r, p);
    const was = prevStatus.get(p.id) as Status | undefined;
    const age = p.metrics.lastCommit ? ctx.now - Date.parse(p.metrics.lastCommit) : null;
    const old = age != null && age > 14 * DAY_MS;
    const isNext = ctx.needs.nextPart?.id === p.id;
    const home = p.status === 'stuck' ? (ctx.needs.link.coverOf.has(p.id) ? `#dec-${ctx.needs.link.coverOf.get(p.id)}` : isNext ? '#next' : `#stuck-${p.id}`) : null;
    const st = neutral ? 'unjudged' : p.status;
    return `<div class="pill st-${st}" id="pill-${esc(p.id)}"><span class="alias" id="part-${esc(p.id)}"></span>
<button type="button" class="pill-btn" data-open-part="${esc(p.id)}" aria-label="${esc(`${p.name}: ${neutral ? 'not assessed yet' : STATUS_LABEL[p.status]}. Open details.`)}">${neutral ? '' : glyph(p.status)}<span class="pname">${esc(p.name)}</span>${was ? `<span class="ghost" title="was ${esc(STATUS_LABEL[was] ?? was)}">was ${GLYPH[was] ?? '?'}→</span>` : ''}</button>
<span class="p2">${cells(items.filter((i) => i.done).length, items.length)}${home ? `<a class="see" href="${esc(home)}">${isNext ? `${NEXT} see Next` : `${GLYPH.stuck} see Needs you`}</a>` : `<span>${plural(p.metrics.commits30d, 'commit')}/30d</span>`}${age != null ? `<span class="age${old ? ' old' : ''}" title="last commit ${esc(String(p.metrics.lastCommit).slice(0, 10))}">${esc(ago(p.metrics.lastCommit, ctx.now))}</span>` : '<span class="age">no commits</span>'}</span>
</div>`;
  };
  const all = neutral ? r.parts.slice().sort((a, b) => lc(b) - lc(a)) : live;
  return `<section id="parts" class="sec" aria-labelledby="h-parts"><div class="parts-head">${sh('parts', ctx, 'Parts', '', 'h-parts')}
${neutral ? '<span class="muted small">not assessed yet · one part per folder</span>' : r.parts.length ? `<span class="stack" role="img" aria-label="${STATUS_ORDER.map((s) => `${counts[s]} ${STATUS_LABEL[s].toLowerCase()}`).join(', ')}">${bar}</span><ul class="legend">${legend}</ul>` : ''}</div>
${inferred && ctx.judged ? '<p class="note">Statuses guessed from activity. Run /rundown for a real read.</p>' : ''}
${r.parts.length ? '' : '<p class="muted">No parts yet.</p>'}
${all.length ? `<div class="pills">${all.map(pill).join('')}</div>` : ''}
${done.length && !neutral ? `<p class="done-line">${glyph('done')} <b>${done.length} done:</b> ${done.map((p, i) => `${i ? '<span aria-hidden="true">·</span>' : ''}<button type="button" class="linkish" id="pill-${esc(p.id)}" data-open-part="${esc(p.id)}"><span class="alias" id="part-${esc(p.id)}"></span>${esc(p.name)}</button>`).join(' ')}</p>` : ''}
</section>`;
}

/** A part's drawer, kept in a template until it's opened. */
export function partDetail(r: Rundown, p: Part, ctx: FlowCtx, folders: { path: string; lines: number }[]): string {
  const commits = (r.facts.git?.recentCommits ?? []).filter((c) => c.parts.includes(p.id)).slice(0, 6);
  const decisions = r.decisions.filter((d) => d.partId === p.id || (p.waitingOn && new RegExp(`\\b${d.id}\\b`).test(p.waitingOn)));
  const items = linkedItems(r, p);
  const m = p.metrics;
  return `<template id="tpl-${esc(p.id)}"><div class="dr-head"><h2>${esc(p.name)}</h2>${badge(p.status)}${p.statusSource === 'inferred' ? '<span class="muted small">guessed</span>' : ''}</div>
${p.summary ? `<p>${esc(p.summary)}</p>` : ''}
${p.waitingOn ? `<p class="dr-wait">${icon(waitIcon(p.waitingOn))}<span><b>Waiting on</b> ${esc(p.waitingOn)}</span></p>` : ''}
<dl class="dr-nums"><div><dt>lines</dt><dd>${num(m.lines)}</dd></div><div><dt>test files</dt><dd>${num(m.testFiles)}</dd></div><div><dt>TODO</dt><dd>${num(m.todo + m.fixme)}</dd></div><div><dt>commits/30d</dt><dd>${num(m.commits30d)}</dd></div></dl>
${items.length ? `<h3>Milestone items</h3><ul class="dr-list">${items.map((i) => `<li><span class="${i.done ? 'st-done' : 'muted'}" aria-hidden="true">${i.done ? GLYPH.done : '○'}</span> <b>${esc(i.m)}</b> ${esc(i.text)}<span class="sr">${i.done ? ' (done)' : ' (open)'}</span></li>`).join('')}</ul>` : ''}
${decisions.length ? `<h3>Decisions</h3><ul class="dr-list">${decisions.map((d) => `<li>${d.answer ? `<b>${esc(d.id)}</b> ${esc(d.question)} <span class="muted">→ ${esc(d.answer)}</span>` : `<a href="#dec-${esc(d.id)}"><b>${esc(d.id)}</b> ${esc(d.question)}</a>`}</li>`).join('')}</ul>` : ''}
${p.evidence.length ? `<h3>Evidence</h3><ul class="dr-list">${p.evidence.map((e) => `<li><span class="kind">${esc(e.kind)}</span> ${e.ref ? `<code>${esc(e.ref)}</code> ` : ''}${esc(e.text)}</li>`).join('')}</ul>` : ''}
${commits.length ? `<h3>Recent commits</h3><ul class="dr-list">${commits.map((c) => `<li><code>${short(c.sha)}</code> ${esc(c.subject)} <span class="muted small">${esc(fmtDay(c.date, ctx.nowDate))}</span></li>`).join('')}</ul>` : ''}
<details class="dr-more"><summary>Paths and folders</summary><p>${p.paths.map((x) => `<code>${esc(x)}</code>`).join(' ') || '-'}</p>${folders.length ? `<ul class="dr-list">${folders.slice(0, 8).map((c) => `<li><code>${esc(c.path)}</code> <span class="muted">${plural(c.lines, 'line')}</span></li>`).join('')}</ul>` : ''}<p class="muted small">${plural(m.files, 'file')} · ${num(m.uncommitted)} uncommitted · last commit ${m.lastCommit ? esc(String(m.lastCommit).replace('T', ' ').slice(0, 16)) : 'none'}</p></details>
</template>`;
}
