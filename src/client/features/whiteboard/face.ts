// The planning board's face: the floor's plan as tables, and the sketch everyone draws beside them.
// On the left, the mission's milestones (where each stands, its issues closed of all, the units on it,
// what it has spent and when it's due); on the right, the shared sketch while there is one, else what's
// up next on the task queue. The statement runs under the title. planView is pure (tests/tables.test.ts).
import type { GhIssue, GhState, Mission, QueueState, RosterEntry } from '../../../shared/protocol';
import { DECK } from '../../world/office/materials';
import { PANEL } from '../boards/world';
import { INK, UI, clip, ground, titleBar, type Screen } from '../boards/screen';
import { emptyBox, label, table, type Chip, type TableRow } from '../boards/table';
import type { FarCount, FarSpec } from '../boards/far';

/** The board's canvas units a metre: read walking up to it, from five metres or so. */
export const FACE_UNITS = 360;

/** Where the milestones end and the right-hand side starts (canvas units). */
const splitOf = (W: number) => Math.round(W * 0.66);
/** Where the tables start under the title bar and the statement. */
const TOP = 196;

/** Where the sketch goes on the face (canvas units), right of the milestones. */
export function sketchBox(W: number, H: number) {
  const x = splitOf(W) + 24;
  return { x, y: TOP, w: W - 32 - x, h: H - TOP - 24 };
}

export interface PlanView {
  /** The mission's statement, or none set. */
  statement: string;
  done: number;
  total: number;
  milestones: TableRow[];
  /** The task queue: running, then waiting. */
  queue: TableRow[];
  queued: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-10-12" as "Oct 12", and whether it's gone by. */
function due(d: string | undefined, now: number): { text: string; late: number } {
  const m = d ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(d) : null;
  if (!m) return { text: '--', late: 0 };
  const end = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1).getTime();
  return { text: `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}`, late: end < now ? Math.max(1, Math.ceil((now - end) / 86_400_000)) : 0 };
}

/** A milestone's state as a chip: done in the settled tick, the one the team is on in ship-cyan, the rest steel. */
function stateChip(done: boolean, active: boolean): Chip {
  if (done) return { text: 'done', hue: PANEL.settled, glyph: 'done' };
  if (active) return { text: 'now', hue: DECK.ship, strong: true };
  return { text: 'next', hue: INK.muted, glyph: 'queued' };
}

/** The plan's tables from the floor's mission, its open issues, the units on it and the task queue. Pure. */
export function planView(mission: Mission, issues: GhState<GhIssue>, roster: readonly RosterEntry[], queue: QueueState, now = Date.now()): PlanView {
  const open = new Set(issues.items.filter((i) => i.state === 'OPEN').map((i) => i.number));
  const known = issues.fetchedAt > 0;
  const milestones = mission.milestones.map((m): TableRow => {
    const on = roster.filter((e) => e.goal === m.id);
    const usd = m.totals.usd + on.reduce((s, e) => s + (e.usd ?? 0), 0);
    const closed = m.issues.filter((n) => !open.has(n)).length;
    const d = due(m.due, now);
    const active = mission.active === m.id;
    return {
      hue: active && !m.done ? DECK.ship : undefined,
      quiet: m.done,
      cells: [
        { chip: stateChip(m.done, active) },
        m.title,
        { text: m.issues.length ? (known ? `${closed}/${m.issues.length}` : String(m.issues.length)) : '--', mono: true },
        { text: on.length ? String(on.length) : '--', mono: true },
        { text: usd > 0 ? `$${usd.toFixed(2)}` : '--', mono: true },
        { text: d.late && !m.done ? `${d.late}d late` : d.text, mono: true },
      ],
    };
  });
  const running = queue.tasks.filter((t) => t.status === 'running');
  const waiting = queue.tasks.filter((t) => t.status === 'queued');
  const title = (t: { issue?: number; title: string }) => (t.issue !== undefined ? t.title.replace(new RegExp(`^#${t.issue}\\s*`), '') : t.title);
  const q: TableRow[] = [
    ...running.map((t): TableRow => ({ cells: [{ text: t.issue !== undefined ? `#${t.issue}` : '', mono: true }, title(t), { chip: { text: 'on it', hue: PANEL.working, glyph: 'working' } }] })),
    ...waiting.map((t, i): TableRow => ({ cells: [{ text: t.issue !== undefined ? `#${t.issue}` : '', mono: true }, title(t), { chip: { text: i === 0 ? 'next' : 'later', hue: INK.muted, glyph: 'queued' } }] })),
  ];
  return { statement: mission.statement.trim(), done: mission.milestones.filter((m) => m.done).length, total: mission.milestones.length, milestones, queue: q, queued: waiting.length };
}

/**
 * Paints the face: the title bar (PLAN, the milestones done of all), the statement under it, the
 * milestones' table on the left, and on the right `drawing` fitted into its box, or the queue's table.
 */
export function paintPlan(s: Screen, v: PlanView, drawing: HTMLCanvasElement | null) {
  const { g, W, H } = s;
  ground(g, W, H);
  titleBar(g, W, 'Plan', v.total ? `${v.done}/${v.total} milestones done` : undefined);
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.font = UI(600, 36);
  g.fillStyle = v.statement ? INK.text : INK.dim;
  g.fillText(clip(g, v.statement || 'No mission set yet: set it in Mission control', W - 64), 32, 130);
  const split = splitOf(W);
  const box = sketchBox(W, H);
  // The section names, over each side.
  label(g, 'Milestones', 32, TOP - 22, 22, 'left', INK.muted);
  g.fillStyle = INK.lineStrong;
  g.fillRect(split, TOP - 34, 2, H - TOP + 10);
  // The milestones.
  if (!v.milestones.length) emptyBox(g, 32, TOP, split - 56, H - TOP - 24, 'No milestones yet', 'Add them in Mission control, Mission', 40);
  else
    table(g, {
      x: 32,
      y: TOP,
      w: split - 56,
      h: H - TOP - 20,
      size: 30,
      rowH: 62,
      columns: [
        { label: 'State', w: 1.45 },
        { label: 'Milestone', w: 3.4 },
        { label: 'Issues', w: 0.95, align: 'right', mono: true },
        { label: 'Units', w: 0.85, align: 'right', mono: true },
        { label: 'Spent', w: 1, align: 'right', mono: true },
        { label: 'Due', w: 1, align: 'right', mono: true },
      ],
      rows: v.milestones,
    });
  if (drawing) {
    label(g, 'Sketch', box.x, TOP - 22, 22, 'left', INK.muted);
    const k = Math.min(box.w / drawing.width, box.h / drawing.height);
    const w = drawing.width * k;
    const h = drawing.height * k;
    // Drawn dark on white, shown light on the slate: the same picture in the deck's dark mode.
    g.filter = 'invert(1) hue-rotate(180deg)';
    g.drawImage(drawing, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h);
    g.filter = 'none';
  } else if (v.queue.length) {
    label(g, v.queued ? `Task queue  ${v.queued} waiting` : 'Task queue', box.x, TOP - 22, 22, 'left', INK.muted);
    table(g, { x: box.x, y: TOP, w: box.w, h: H - TOP - 20, size: 30, rowH: 60, columns: [{ label: 'Issue', w: 0.75, mono: true }, { label: 'Task', w: 2.05 }, { label: 'State', w: 1.6 }], rows: v.queue });
  } else emptyBox(g, box.x, TOP, box.w, H - TOP - 24, 'Sketch the plan', 'E here: everyone on this deck sees it', 36);
  g.textBaseline = 'alphabetic';
  s.texture.needsUpdate = true;
}

/** The plan from across the deck (boards/far.ts): milestones done of all, late ones, units on it, and the task queue. Pure. */
export function planFar(v: PlanView): FarSpec {
  const hue = DECK.ship;
  if (!v.total && !v.queue.length) return { title: 'Plan', hue, counts: [], empty: 'No mission set yet' };
  const late = v.milestones.filter((m) => !m.quiet && typeof m.cells[5] === 'object' && m.cells[5] && 'text' in m.cells[5] && / late$/.test(m.cells[5].text)).length;
  const running = v.queue.length - v.queued;
  const counts: FarCount[] = [{ n: `${v.done}/${v.total}`, word: 'milestones', hue: PANEL.settled, glyph: v.total && v.done === v.total ? 'done' : undefined }];
  if (late) counts.push({ n: String(late), word: 'late', hue: PANEL.review, glyph: 'review' });
  counts.push({ n: String(running), word: 'tasks on it', hue: PANEL.working, glyph: 'working' });
  counts.push({ n: String(v.queued), word: 'queued', hue: INK.muted, glyph: 'queued' });
  return { title: 'Plan', hue, counts };
}
