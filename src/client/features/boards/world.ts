import { DATA_COLORS } from '../../../shared/datacolors';
import * as THREE from 'three';
import { OFFICE_PLAN } from '../../../shared/plan';
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

/** A quiet line in the middle of an empty panel, and a smaller one under it. */
export function panelEmpty(g: CanvasRenderingContext2D, W: number, H: number, title: string, sub?: string) {
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = PANEL.text;
  g.font = UI_FONT(600, 44);
  wrap(g, title, W - 160, 2).forEach((l, i, all) => g.fillText(l, W / 2, H / 2 - (sub ? 24 : 0) + (i - (all.length - 1) / 2) * 52));
  if (sub) {
    g.fillStyle = PANEL.muted;
    g.font = UI_FONT(500, 28);
    g.fillText(clip(g, sub, W - 160), W / 2, H / 2 + 40);
  }
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
}

/**
 * A board that can't reach GitHub: its own name large and muted, a link glyph, and one short line.
 * The full fix (which command to run where) is in the board's window, not painted on the wall.
 */
export function panelOffline(g: CanvasRenderingContext2D, W: number, H: number, title: string, sub: string) {
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // The link glyph (ui/icons.ts 'link'), drawn in hairline steel.
  const r = 30;
  g.save();
  g.translate(W / 2, H / 2 - 120);
  g.strokeStyle = PANEL.muted;
  g.lineWidth = 7;
  g.lineCap = 'square';
  for (const k of [-1, 1]) {
    g.save();
    g.translate(k * r * 0.62, -k * r * 0.62);
    g.rotate(-Math.PI / 4);
    g.strokeRect(-r * 0.95, -r * 0.48, r * 1.9, r * 0.96);
    g.restore();
  }
  g.restore();
  g.fillStyle = PANEL.lineStrong;
  g.font = `600 112px Archivo, system-ui, sans-serif`;
  g.fillText(title.toUpperCase(), W / 2, H / 2 + 6, W - 120);
  g.fillStyle = PANEL.muted;
  g.font = UI_FONT(500, 34);
  g.fillText(sub, W / 2, H / 2 + 104);
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
}

/** What a board that has an error says on the wall: never the error itself, which is for its window. */
export function offlineLine(error: string): string {
  if (/sign|auth|token|log ?in/i.test(error)) return 'Connect GitHub to see it here';
  if (/not installed|ENOENT|gh\b/i.test(error)) return 'Install the GitHub CLI to see it here';
  return 'GitHub is out of reach for now';
}

/** A note as it was last drawn: its middle, size and tilt on the canvas. */
interface DrawnNote {
  number: number;
  x: number;
  y: number;
  w: number;
  h: number;
  tilt: number;
}

/** Draws the Issues or the Pull requests panel: a card per open item, on the panel's slate. */
export class BoardTexture {
  readonly texture: THREE.CanvasTexture;
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private notes: DrawnNote[] = [];
  /** The card being reached for, drawn with a Signal outline (see lift). */
  private lifted: number | null = null;
  private last: [GhState<GhIssue> | GhState<GhPull>, Map<string, WorkerInfo> | undefined] | null = null;

  constructor(private kind: 'issues' | 'pulls') {
    this.canvas.width = 1200;
    this.canvas.height = 600;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
  }

  /** Whether any notes are up on the board. */
  get hasNotes(): boolean {
    return this.notes.length > 0;
  }

  /** The card at a point on the panel's face (its uv), or undefined over bare panel. */
  noteAt(uv: THREE.Vector2): number | undefined {
    const px = uv.x * this.canvas.width;
    const py = (1 - uv.y) * this.canvas.height;
    // Topmost first: later notes are drawn over earlier ones.
    for (let i = this.notes.length - 1; i >= 0; i--) {
      const n = this.notes[i];
      // Into the note's own (tilted) frame.
      const dx = px - n.x;
      const dy = py - n.y;
      const c = Math.cos(-n.tilt);
      const s = Math.sin(-n.tilt);
      if (Math.abs(dx * c - dy * s) <= n.w / 2 && Math.abs(dx * s + dy * c) <= n.h / 2) return n.number;
    }
    return undefined;
  }

  /** Draws one card outlined, the one you're about to take (null for none). */
  lift(number: number | null) {
    if (number === this.lifted) return;
    this.lifted = number;
    if (this.last) this.render(...this.last);
  }

  /** `workers` lets PR cards name the unit and console they came from. */
  render(state: GhState<GhIssue> | GhState<GhPull>, workers?: Map<string, WorkerInfo>) {
    this.last = [state, workers];
    this.notes = [];
    const g = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    panelGround(g, W, H);
    const open = (state.items as (GhIssue | GhPull)[]).filter((i) => i.state === 'OPEN');
    if (!open.length) {
      if (state.error) panelOffline(g, W, H, this.kind === 'issues' ? 'Issues' : 'Pull requests', offlineLine(state.error));
      else panelEmpty(g, W, H, state.loading && !state.fetchedAt ? 'Loading' : this.kind === 'issues' ? 'No open issues' : 'No open pull requests', this.kind === 'issues' ? 'New issues land here first' : "A unit's PR lands here when it opens one");
      this.texture.needsUpdate = true;
      return;
    }
    // Fewer cards -> bigger cards, so a quiet board is still readable from across the deck.
    const n = Math.min(open.length, 15);
    const cols = n <= 2 ? n : n <= 4 ? 2 : n <= 6 ? 3 : n <= 8 ? 4 : 5;
    const rows = Math.min(3, Math.ceil(n / cols));
    const scale = Math.min(2, Math.max(1, 3 / Math.max(cols, rows * 1.3)));
    const gap = 18;
    const nw = Math.min(208 * scale, (W - gap) / cols - gap);
    const nh = Math.min(164 * scale, (H - gap) / rows - gap);
    const gx = (W - cols * nw) / (cols + 1);
    const gy = (H - rows * nh) / (rows + 1);
    open.slice(0, cols * rows).forEach((it, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const x = gx + c * (nw + gx);
      const y = gy + r * (nh + gy);
      this.notes.push({ number: it.number, x: x + nw / 2, y: y + nh / 2, w: nw, h: nh, tilt: 0 });
      const lifted = it.number === this.lifted;
      const draft = this.kind === 'pulls' && (it as GhPull).isDraft;
      g.fillStyle = lifted ? PANEL.cardHi : PANEL.card;
      g.fillRect(x, y, nw, nh);
      g.lineWidth = lifted ? 4 : 2;
      g.strokeStyle = lifted ? PANEL.signal : PANEL.line;
      g.strokeRect(x + g.lineWidth / 2, y + g.lineWidth / 2, nw - g.lineWidth, nh - g.lineWidth);
      // A stripe down the left edge: steel for an issue, amber for a PR waiting on review, muted for a draft.
      g.fillStyle = draft ? PANEL.lineStrong : this.kind === 'pulls' ? PANEL.review : PANEL.working;
      g.fillRect(x, y, 5, nh);
      const fs = Math.round(22 * Math.min(scale, nh / 164));
      const w = this.kind === 'pulls' && workers ? workerForPull(workers.values(), it as GhPull) : undefined;
      const footer = w ? fs * 1.3 : 0;
      g.fillStyle = PANEL.muted;
      g.font = MONO_FONT(Math.round(fs * 1.05));
      g.fillText(`#${it.number}${draft ? '  draft' : ''}`, x + 18, y + fs * 1.7);
      g.fillStyle = draft ? PANEL.muted : PANEL.text;
      g.font = UI_FONT(600, fs);
      wrap(g, it.title, nw - 34, Math.max(2, Math.floor((nh - fs * 3 - footer) / (fs * 1.2)))).forEach((line, li) => g.fillText(line, x + 18, y + fs * 3.1 + li * fs * 1.2));
      if (w) {
        // The unit and its console, so you can tell whose PR it is from across the deck.
        g.fillStyle = PANEL.muted;
        g.font = MONO_FONT(Math.round(fs * 0.72));
        g.fillText(clip(g, `${w.name}  ${OFFICE_PLAN.byId.get(w.deskId)?.label.replace(/^Console /, '') ?? ''}`, nw - 34), x + 18, y + nh - fs * 0.6);
      }
    });
    if (open.length > cols * rows) {
      g.fillStyle = PANEL.muted;
      g.font = MONO_FONT(24);
      g.textAlign = 'right';
      g.fillText(`+${open.length - cols * rows}`, W - 16, H - 12);
      g.textAlign = 'left';
    }
    this.texture.needsUpdate = true;
  }
}

/** The Services board: the web servers units are running, a row each with its port in mono. */
export class ServicesBoardTexture {
  readonly texture: THREE.CanvasTexture;
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private drawn = '';

  constructor() {
    this.canvas.width = 1200;
    this.canvas.height = 600;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
  }

  render(items: ServiceInfo[], workers: Map<string, WorkerInfo>) {
    const rows = items.map((s) => {
      const w = workers.get(s.workerId);
      return { port: s.port, title: s.title || s.command, who: [w?.name ?? 'A unit', w?.worktree?.branch].filter(Boolean).join('  '), color: w?.color ?? '#8A97A5' };
    });
    // Worker updates stream in constantly; only redraw when what's shown changes.
    const key = JSON.stringify(rows);
    if (key === this.drawn) return;
    this.drawn = key;
    const g = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    panelGround(g, W, H);
    if (!rows.length) {
      panelEmpty(g, W, H, 'No web servers running', 'When a unit starts one, it shows up here');
      this.texture.needsUpdate = true;
      return;
    }
    const shown = rows.slice(0, 5);
    const rowH = Math.min(120, (H - 40) / shown.length);
    const fs = Math.round(rowH * 0.34);
    shown.forEach((r, i) => {
      const y = 20 + i * rowH;
      g.fillStyle = PANEL.card;
      g.fillRect(24, y + 6, W - 48, rowH - 12);
      g.strokeStyle = PANEL.line;
      g.lineWidth = 2;
      g.strokeRect(25, y + 7, W - 50, rowH - 14);
      g.fillStyle = PANEL.settled;
      g.fillRect(24, y + 6, 5, rowH - 12);
      g.fillStyle = PANEL.text;
      g.font = MONO_FONT(fs);
      g.textAlign = 'right';
      g.fillText(`:${r.port}`, W - 50, y + rowH / 2 + fs * 0.35);
      g.textAlign = 'left';
      const textW = W - 60 - 50 - g.measureText(`:${r.port}`).width - 30;
      g.fillStyle = PANEL.text;
      g.font = UI_FONT(600, fs);
      g.fillText(clip(g, r.title, textW), 56, y + rowH / 2 - fs * 0.08);
      g.fillStyle = PANEL.muted;
      g.font = MONO_FONT(Math.round(fs * 0.6));
      g.fillText(clip(g, r.who, textW), 56, y + rowH / 2 + fs * 0.78);
    });
    if (rows.length > shown.length) {
      g.fillStyle = PANEL.muted;
      g.font = MONO_FONT(24);
      g.textAlign = 'right';
      g.fillText(`+${rows.length - shown.length}`, W - 24, H - 10);
      g.textAlign = 'left';
    }
    this.texture.needsUpdate = true;
  }
}

/** The Queue panel: what's waiting, who is on what, and the PRs that came out of it, a row each. */
export class QueueBoardTexture {
  readonly texture: THREE.CanvasTexture;
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private drawn = '';

  constructor() {
    this.canvas.width = 1200;
    this.canvas.height = 600;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
  }

  render(state: QueueState, workers: Map<string, WorkerInfo>) {
    const name = (t: QueueTask) => (t.issue !== undefined ? `#${t.issue}  ${t.title.replace(new RegExp(`^#${t.issue}\\s*`), '')}` : t.title);
    const running = state.tasks.filter((t) => t.status === 'running');
    const queued = state.tasks.filter((t) => t.status === 'queued');
    const done = state.tasks.filter((t) => t.status === 'done').slice(-3).reverse();
    type Mark = 'working' | 'needs' | 'queued' | 'done' | 'failed';
    const rows: { mark: Mark; text: string; side: string }[] = [
      ...running.map((t) => {
        const w = t.workerId ? workers.get(t.workerId) : undefined;
        const st = { starting: 'starting', idle: 'ready', working: 'working', needs_input: 'needs you', done: 'done', exited: 'stopped', offline: 'asleep' }[w?.status ?? 'working'];
        return { mark: (w?.status === 'needs_input' ? 'needs' : 'working') as Mark, text: name(t), side: `${t.workerName ?? 'a unit'}  ${st}` };
      }),
      ...queued.map((t, i) => ({ mark: 'queued' as Mark, text: name(t), side: i === 0 ? 'up next' : `${i + 1} in line` })),
      ...done.map((t) => ({
        mark: (t.outcome === 'done' ? 'done' : 'failed') as Mark,
        text: name(t),
        side: t.pr ? `PR #${t.pr.number}${t.pr.state === 'MERGED' ? '  merged' : ''}` : t.outcome === 'done' ? 'done' : t.outcome === 'failed' ? "didn't start" : t.outcome === 'killed' ? 'stood down' : 'stopped',
      })),
    ];
    const summary = state.maxWorkers === 0 ? 'paused' : `${running.length} working  ${queued.length} waiting  max ${state.maxWorkers}`;
    const key = JSON.stringify([rows, summary]);
    if (key === this.drawn) return;
    this.drawn = key;
    const g = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    panelGround(g, W, H);
    g.textBaseline = 'alphabetic';
    g.textAlign = 'right';
    g.fillStyle = PANEL.muted;
    g.font = MONO_FONT(24);
    g.fillText(summary, W - 32, 46);
    g.textAlign = 'left';
    if (!rows.length) {
      panelEmpty(g, W, H, 'Nothing queued', 'Add issues from the Issues panel, or press E here');
      this.texture.needsUpdate = true;
      return;
    }
    const shown = rows.slice(0, 7);
    const rowH = Math.min(70, (H - 100) / shown.length);
    const fs = Math.round(rowH * 0.42);
    shown.forEach((r, i) => {
      const y = 70 + i * rowH;
      const mid = y + rowH / 2;
      g.fillStyle = r.mark === 'done' || r.mark === 'failed' ? 'rgba(26,34,44,0.5)' : PANEL.card;
      g.fillRect(24, y + 4, W - 48, rowH - 8);
      g.strokeStyle = PANEL.line;
      g.lineWidth = 2;
      g.strokeRect(25, y + 5, W - 50, rowH - 10);
      drawMark(g, r.mark, 56, mid, fs * 0.42);
      g.font = MONO_FONT(Math.round(fs * 0.72));
      const sideW = g.measureText(r.side).width;
      g.textAlign = 'right';
      g.fillStyle = r.mark === 'needs' ? PANEL.signal : PANEL.muted;
      g.fillText(r.side, W - 44, mid + fs * 0.28);
      g.textAlign = 'left';
      g.fillStyle = r.mark === 'done' || r.mark === 'failed' ? PANEL.muted : PANEL.text;
      g.font = UI_FONT(600, fs);
      g.fillText(clip(g, r.text, W - 44 - sideW - 30 - 90), 90, mid + fs * 0.34);
    });
    if (rows.length > shown.length) {
      g.fillStyle = PANEL.muted;
      g.font = MONO_FONT(22);
      g.textAlign = 'right';
      g.fillText(`+${rows.length - shown.length}`, W - 44, H - 16);
      g.textAlign = 'left';
    }
    this.texture.needsUpdate = true;
  }
}

/**
 * A row's state as a shape, as the status glyphs in the DOM have it: a steel square at work, a solid
 * Signal diamond for one that needs you, a hollow square waiting, a check done, a hollow triangle
 * failed.
 */
function drawMark(g: CanvasRenderingContext2D, mark: 'working' | 'needs' | 'queued' | 'done' | 'failed', x: number, y: number, r: number) {
  g.lineWidth = Math.max(2, r * 0.28);
  g.lineJoin = 'miter';
  g.beginPath();
  if (mark === 'needs') {
    g.moveTo(x, y - r);
    g.lineTo(x + r, y);
    g.lineTo(x, y + r);
    g.lineTo(x - r, y);
    g.closePath();
    g.fillStyle = PANEL.signal;
    g.fill();
    return;
  }
  if (mark === 'working') {
    g.fillStyle = PANEL.working;
    g.fillRect(x - r * 0.7, y - r * 0.7, r * 1.4, r * 1.4);
    return;
  }
  if (mark === 'queued') {
    g.strokeStyle = PANEL.muted;
    g.strokeRect(x - r * 0.7, y - r * 0.7, r * 1.4, r * 1.4);
    return;
  }
  if (mark === 'done') {
    g.strokeStyle = PANEL.settled;
    g.moveTo(x - r * 0.75, y);
    g.lineTo(x - r * 0.2, y + r * 0.55);
    g.lineTo(x + r * 0.8, y - r * 0.6);
    g.stroke();
    return;
  }
  g.strokeStyle = PANEL.stuck;
  g.moveTo(x, y - r);
  g.lineTo(x + r, y + r * 0.8);
  g.lineTo(x - r, y + r * 0.8);
  g.closePath();
  g.stroke();
}

export function clip(g: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (g.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && g.measureText(`${s}...`).width > maxW) s = s.slice(0, -1);
  return `${s}...`;
}
