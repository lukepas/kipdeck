import { DATA_COLORS } from '../../../shared/datacolors';
import * as THREE from 'three';
import { OFFICE_PLAN } from '../../../shared/plan';
import { SITUATION } from '../../../shared/layout';
import { drawGlyph, type GlyphKind } from '../../world/glyphs';
import { INK, LAYOUT, emptyBody, ground, more, offlineBody, row, rowTop, rowsFor, screen, titleBar, type Row, type Screen } from './screen';
import type { GhIssue, GhPull, GhState, QueueState, QueueTask, ServiceInfo, WorkerInfo } from '../../../shared/protocol';
import { workerForPull } from '../../state';

/** An issue's card on the wall: a light slate card, its pin from the data palette (shared/datacolors.ts). */
export const NOTE_COLORS = ['#C9D2DC', '#BCC6D1', '#D3DAE1', '#C2CCD6', '#CDD5DD'];
export const PINS: readonly string[] = DATA_COLORS;

export function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width > maxW && cur) {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines) break;
    } else cur = next;
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,3}$/, '...');
  return lines;
}

/** The panels' ramp: the same tokens as the DOM's (styles/tokens.css), for canvases. */
export const PANEL = {
  bg: '#141B23',
  card: '#1A222C',
  cardHi: '#212A35',
  line: '#26313D',
  lineStrong: '#3A4756',
  text: '#E8ECEF',
  muted: '#8A97A5',
  signal: '#FF6A1A',
  stuck: '#FF4D5E',
  review: '#F5C542',
  working: '#C9D2DC',
  proof: '#A68BFF',
  settled: '#3DDC97',
} as const;
export const UI_FONT = (weight: number, size: number) => `${weight} ${size}px Archivo, system-ui, sans-serif`;
export const MONO_FONT = (size: number, weight = 500) => `${weight} ${size}px "JetBrains Mono", ui-monospace, monospace`;

/** A panel's ground: flat slate with a faint 1 m-style grid, the deck's floor in miniature. */
export function panelGround(g: CanvasRenderingContext2D, W: number, H: number) {
  g.fillStyle = PANEL.bg;
  g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(38,49,61,0.45)';
  for (let x = 40; x < W; x += 40) g.fillRect(x, 0, 1, H);
  for (let y = 40; y < H; y += 40) g.fillRect(0, y, W, 1);
}

/** What a board that has an error says on the wall: never the error itself, which is for its window. */
export function offlineLine(error: string): string {
  if (/sign|auth|token|log ?in/i.test(error)) return 'Connect GitHub to see it here';
  if (/not installed|ENOENT|gh\b/i.test(error)) return 'Install the GitHub CLI to see it here';
  return 'GitHub is out of reach for now';
}


export { clip } from './screen';

/** A row as it was last drawn: which item it is, and its box on the board (canvas units). */
interface DrawnNote {
  number: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Amber for a pull request waiting on review, a quiet steel dot for a draft. */
const pullMark = (draft: boolean) => (g: CanvasRenderingContext2D, x: number, y: number, r: number) => drawGlyph(g, draft ? 'parked' : 'review', x, y, draft ? r * 1.6 : r);
/** What a pull request's checks say, in words, and red only when they fail. */
const CHECKS: Record<GhPull['checks'], [string, string] | null> = { pass: ['checks pass', INK.dim], fail: ['checks failing', PANEL.stuck], pending: ['checks running', INK.dim], none: null };

/** Draws the Issues or the Pull requests board: a row per open item, the oldest first, four at most. */
export class BoardTexture {
  readonly texture: THREE.CanvasTexture;
  private s: Screen = screen(SITUATION.width, SITUATION.height);
  private notes: DrawnNote[] = [];
  /** The row being reached for, outlined in Signal (see lift). */
  private lifted: number | null = null;
  private last: [GhState<GhIssue> | GhState<GhPull>, Map<string, WorkerInfo> | undefined] | null = null;

  constructor(private kind: 'issues' | 'pulls') {
    this.texture = this.s.texture;
  }

  /** Whether any notes are up on the board. */
  get hasNotes(): boolean {
    return this.notes.length > 0;
  }

  /** The item at a point on the board's face (its uv), or undefined over bare panel. */
  noteAt(uv: THREE.Vector2): number | undefined {
    const px = uv.x * this.s.W;
    const py = (1 - uv.y) * this.s.H;
    return this.notes.find((n) => Math.abs(px - n.x) <= n.w / 2 && Math.abs(py - n.y) <= n.h / 2)?.number;
  }

  /** Draws one row outlined, the one you're about to take (null for none). */
  lift(number: number | null) {
    if (number === this.lifted) return;
    this.lifted = number;
    if (this.last) this.render(...this.last);
  }

  /** `workers` lets a PR's row name the unit and console it came from. */
  render(state: GhState<GhIssue> | GhState<GhPull>, workers?: Map<string, WorkerInfo>) {
    this.last = [state, workers];
    this.notes = [];
    const { g, W, H } = this.s;
    const pulls = this.kind === 'pulls';
    ground(g, W, H);
    const open = (state.items as (GhIssue | GhPull)[]).filter((i) => i.state === 'OPEN');
    titleBar(g, W, pulls ? 'Pull requests' : 'Issues', open.length ? `${open.length} open` : undefined);
    if (!open.length) {
      if (state.error) offlineBody(g, W, H, offlineLine(state.error));
      else emptyBody(g, W, H, state.loading && !state.fetchedAt ? 'Loading' : pulls ? 'No open pull requests' : 'No open issues', pulls ? "A unit's PR lands here when it opens one" : 'New issues land here first');
      this.texture.needsUpdate = true;
      return;
    }
    const shown = open.slice(0, rowsFor(H));
    shown.forEach((it, i) => {
      const lifted = it.number === this.lifted;
      const y = rowTop(i);
      this.notes.push({ number: it.number, x: W / 2, y: y + LAYOUT.rowH / 2, w: W - LAYOUT.pad * 2, h: LAYOUT.rowH });
      if (!pulls) return row(g, W, i, { hue: INK.lineStrong, tag: `#${it.number}`, text: it.title, lifted }, 64);
      const pr = it as GhPull;
      const w = workers ? workerForPull(workers.values(), pr) : undefined;
      const checks = pr.isDraft ? null : CHECKS[pr.checks];
      const side = pr.isDraft ? 'draft' : pr.reviewDecision === 'APPROVED' ? 'approved' : checks?.[0];
      const sideColor = pr.isDraft || pr.reviewDecision === 'APPROVED' ? INK.dim : checks?.[1];
      const where = w ? `${w.name}  ${OFFICE_PLAN.byId.get(w.deskId)?.label.replace(/^Console /, '') ?? ''}`.trim() : '';
      const sub = [where, pr.reviewDecision === 'APPROVED' && checks ? checks[0] : ''].filter(Boolean).join('  ');
      row(g, W, i, { hue: pr.isDraft ? PANEL.lineStrong : PANEL.review, mark: pullMark(pr.isDraft), tag: `#${pr.number}`, text: pr.title, side, sideColor, sub: sub || undefined, quiet: pr.isDraft, lifted });
    });
    more(g, W, H, open.length - shown.length);
    this.texture.needsUpdate = true;
  }
}

/** The Services board: the web servers units are running, a row each with its port in mono. */
export class ServicesBoardTexture {
  readonly texture: THREE.CanvasTexture;
  private s: Screen = screen(SITUATION.width, SITUATION.height);
  private drawn = '';

  constructor() {
    this.texture = this.s.texture;
  }

  render(items: ServiceInfo[], workers: Map<string, WorkerInfo>) {
    const rows = items.map((s) => {
      const w = workers.get(s.workerId);
      return { port: s.port, title: s.title || s.command, who: [w?.name ?? 'A unit', w?.worktree?.branch].filter(Boolean).join('  ') };
    });
    // Worker updates stream in constantly; only redraw when what's shown changes.
    const key = JSON.stringify(rows);
    if (key === this.drawn) return;
    this.drawn = key;
    const { g, W, H } = this.s;
    ground(g, W, H);
    titleBar(g, W, 'Services', rows.length ? `${rows.length} running` : undefined);
    if (!rows.length) {
      emptyBody(g, W, H, 'No web servers running', 'When a unit starts one, it shows up here');
      this.texture.needsUpdate = true;
      return;
    }
    const up = (g: CanvasRenderingContext2D, x: number, y: number, r: number) => {
      g.fillStyle = PANEL.settled;
      g.beginPath();
      g.arc(x, y, r * 0.6, 0, Math.PI * 2);
      g.fill();
    };
    const shown = rows.slice(0, rowsFor(H));
    shown.forEach((r, i) => row(g, W, i, { hue: PANEL.settled, mark: up, text: r.title, side: `:${r.port}`, sideColor: INK.text, sideMono: true, sub: r.who }));
    more(g, W, H, rows.length - shown.length);
    this.texture.needsUpdate = true;
  }
}

/** The Queue board: who is on what, what's waiting, and the PRs that came out of it, a row each. */
export class QueueBoardTexture {
  readonly texture: THREE.CanvasTexture;
  private s: Screen = screen(SITUATION.width, SITUATION.height);
  private drawn = '';

  constructor() {
    this.texture = this.s.texture;
  }

  render(state: QueueState, workers: Map<string, WorkerInfo>) {
    const title = (t: QueueTask) => (t.issue !== undefined ? t.title.replace(new RegExp(`^#${t.issue}\\s*`), '') : t.title);
    const tag = (t: QueueTask) => (t.issue !== undefined ? `#${t.issue}` : undefined);
    const running = state.tasks.filter((t) => t.status === 'running');
    const queued = state.tasks.filter((t) => t.status === 'queued');
    const done = state.tasks.filter((t) => t.status === 'done').slice(-3).reverse();
    const rows: Row[] = [
      ...running.map((t): Row => {
        const w = t.workerId ? workers.get(t.workerId) : undefined;
        const st = { starting: 'starting', idle: 'ready', working: 'working', needs_input: 'needs you', done: 'done', exited: 'stopped', offline: 'asleep' }[w?.status ?? 'working'];
        const needs = w?.status === 'needs_input';
        return { hue: needs ? PANEL.signal : PANEL.working, mark: glyphMark(needs ? 'needs-you' : 'working'), tag: tag(t), text: title(t), side: st, sideColor: needs ? PANEL.signal : INK.dim, sub: t.workerName ?? 'a unit' };
      }),
      ...queued.map((t, i): Row => ({ hue: PANEL.lineStrong, mark: queuedMark, tag: tag(t), text: title(t), side: i === 0 ? 'up next' : `${i + 1} in line` })),
      ...done.map((t): Row => {
        const ok = t.outcome === 'done';
        const side = t.pr ? `PR #${t.pr.number}${t.pr.state === 'MERGED' ? '  merged' : ''}` : ok ? 'done' : t.outcome === 'failed' ? "didn't start" : t.outcome === 'killed' ? 'stood down' : 'stopped';
        return { hue: ok ? PANEL.settled : PANEL.stuck, mark: ok ? doneMark : glyphMark('stuck'), tag: tag(t), text: title(t), side, quiet: true };
      }),
    ];
    const summary = state.maxWorkers === 0 ? 'paused' : `${running.length} on it  ${queued.length} waiting  max ${state.maxWorkers}`;
    const key = JSON.stringify([rows.map((r) => [r.hue, r.tag, r.text, r.side, r.sub]), summary]);
    if (key === this.drawn) return;
    this.drawn = key;
    const { g, W, H } = this.s;
    ground(g, W, H);
    titleBar(g, W, 'Queue', summary);
    if (!rows.length) {
      emptyBody(g, W, H, 'Nothing queued', 'Add issues from the Issues board, or press E here');
      this.texture.needsUpdate = true;
      return;
    }
    const shown = rows.slice(0, rowsFor(H));
    shown.forEach((r, i) => row(g, W, i, r));
    more(g, W, H, rows.length - shown.length);
    this.texture.needsUpdate = true;
  }
}

/** A state's glyph as a row's mark (world/glyphs.ts, the units' and the DOM's shapes). */
const glyphMark = (kind: GlyphKind) => (g: CanvasRenderingContext2D, x: number, y: number, r: number) => drawGlyph(g, kind, x, y, r);
/** Waiting its turn: a hollow steel square. */
function queuedMark(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.strokeStyle = INK.dim;
  g.lineWidth = Math.max(3, r * 0.26);
  g.strokeRect(x - r * 0.7, y - r * 0.7, r * 1.4, r * 1.4);
}
/** Finished: a check in the settled green. */
function doneMark(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.strokeStyle = PANEL.settled;
  g.lineWidth = Math.max(3, r * 0.3);
  g.lineCap = 'square';
  g.beginPath();
  g.moveTo(x - r * 0.75, y);
  g.lineTo(x - r * 0.2, y + r * 0.55);
  g.lineTo(x + r * 0.8, y - r * 0.6);
  g.stroke();
}
