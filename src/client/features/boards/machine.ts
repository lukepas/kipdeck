import * as THREE from 'three';
import type { MachineState } from '../../../shared/protocol';
import { officeFull } from '../../../shared/machine';

import { MACHINE_MONITOR } from '../../../shared/layout';
import { MONO_FONT, PANEL, UI_FONT } from './world';
import { INK, LAYOUT, ground, screen, titleBar } from './screen';

/** Steel while there's room, amber when it's getting full, red from where deploying gets a warning. */
export function loadColor(pct: number): string {
  return pct >= 90 ? PANEL.stuck : pct >= 70 ? PANEL.review : PANEL.working;
}

export function fmtGb(bytes: number): string {
  const gb = bytes / 2 ** 30;
  return `${gb.toFixed(gb < 10 ? 1 : 0)} GB`;
}

/** Whether a panel `W` by `H` is a strip (the capacity strip along the arc's foot) rather than a panel. */
export const isStrip = (W: number, H: number) => W > H * 6;

/**
 * The capacity strip along the foot of the situation arc (or a panel, at a panel's shape): how busy the
 * CPU and memory are, and how many units the office runs of the most it takes. As a strip it is one
 * line, read from the conn: its name and whether there's room, each gauge's percent on a bar, and the
 * units as a square each against the limit.
 */
export class MachineTexture {
  readonly texture: THREE.CanvasTexture;
  // The strip's own shape at 260 canvas units a metre: one line of 0.18 m type, a step under the boards'.
  private s = screen(MACHINE_MONITOR.width, MACHINE_MONITOR.height, isStrip(MACHINE_MONITOR.width, MACHINE_MONITOR.height) ? 260 : 354);
  private ctx = this.s.g;
  private drawn = '';

  constructor() {
    this.texture = this.s.texture;
  }

  render(s: MachineState) {
    const key = JSON.stringify(s);
    if (key === this.drawn) return;
    this.drawn = key;
    const g = this.ctx;
    const { W, H } = this.s;
    ground(g, W, H);
    g.textBaseline = 'alphabetic';
    if (isStrip(W, H)) {
      this.strip(s, W, H);
      this.texture.needsUpdate = true;
      return;
    }

    // The title bar: whether there's room for another unit, as a square in its colour and a word.
    const full = officeFull(s);
    const status: [string, string] = !s.memTotal ? ['reading', PANEL.muted] : s.pressure ? ['under pressure', PANEL.stuck] : full ? ['at its limit', PANEL.review] : ['room to deploy', PANEL.settled];
    const at = titleBar(g, W, 'Capacity', status[0]);
    g.fillStyle = status[1];
    g.fillRect(at - 34, LAYOUT.titleBase - 30, 20, 20);

    const memPct = s.memTotal ? Math.round((s.memUsed / s.memTotal) * 100) : 0;
    const gw = (W - 32 * 2 - 24) / 2;
    this.panel(32, 122, gw, 'CPU', s.cpu, s.cores ? `${s.cores} core${s.cores === 1 ? '' : 's'}` : '', s.history.map(([c]) => c));
    this.panel(32 + gw + 24, 122, gw, 'MEMORY', memPct, s.memTotal ? `${fmtGb(s.memUsed)} of ${fmtGb(s.memTotal)}` : '', s.history.map(([, m]) => m));

    // Footer: the units, a square each, against the limit.
    const y = H - 30;
    g.textAlign = 'left';
    g.font = MONO_FONT(30, 600);
    g.fillStyle = INK.text;
    const label = s.limit === undefined ? `${s.workers} unit${s.workers === 1 ? '' : 's'}  no limit` : `${s.workers}/${s.limit} units`;
    g.fillText(label, 30, y + 12);
    if (s.limit !== undefined) {
      const x0 = 30 + g.measureText(label).width + 28;
      const room = W - 30 - x0;
      const pip = Math.min(30, room / Math.max(s.limit, s.workers));
      for (let i = 0; i < Math.max(s.limit, s.workers); i++) {
        const used = i < s.workers;
        g.fillStyle = i >= s.limit ? PANEL.stuck : used ? (full ? PANEL.review : PANEL.working) : PANEL.card;
        g.fillRect(x0 + i * pip, y - 12, Math.max(2, pip - 6), 26);
        if (!used) {
          g.strokeStyle = PANEL.lineStrong;
          g.lineWidth = 2;
          g.strokeRect(x0 + i * pip + 1, y - 11, Math.max(2, pip - 6) - 2, 24);
        }
      }
    }
    this.texture.needsUpdate = true;
  }

  /** The strip: name and room, CPU and memory each as a percent on a bar, and the units against the limit, along one line. */
  private strip(s: MachineState, W: number, H: number) {
    const g = this.ctx;
    const mid = H / 2;
    const full = officeFull(s);
    const status: [string, string] = !s.memTotal ? ['reading', PANEL.muted] : s.pressure ? ['under pressure', PANEL.stuck] : full ? ['at its limit', PANEL.review] : ['room to deploy', PANEL.settled];
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillStyle = INK.text;
    g.font = UI_FONT(700, 46);
    g.letterSpacing = '4px';
    g.fillText('CAPACITY', 26, mid + 2);
    let x = 26 + g.measureText('CAPACITY').width + 26;
    g.letterSpacing = '0px';
    g.fillStyle = status[1];
    g.fillRect(x, mid - 9, 18, 18);
    g.fillStyle = INK.dim;
    g.font = MONO_FONT(30, 600);
    g.fillText(status[0], x + 28, mid + 2);
    x += 28 + g.measureText(status[0]).width + 50;
    const memPct = s.memTotal ? Math.round((s.memUsed / s.memTotal) * 100) : 0;
    for (const [name, pct] of [
      ['CPU', s.cpu],
      ['MEM', memPct],
    ] as const) {
      g.fillStyle = INK.dim;
      g.font = UI_FONT(600, 28);
      g.fillText(name, x, mid + 2);
      x += g.measureText(name).width + 16;
      const bw = 150;
      g.fillStyle = PANEL.card;
      g.fillRect(x, mid - 10, bw, 20);
      g.fillStyle = loadColor(pct);
      g.fillRect(x, mid - 10, (bw * Math.max(0, Math.min(100, pct))) / 100, 20);
      x += bw + 14;
      g.fillStyle = INK.text;
      g.font = MONO_FONT(40, 600);
      g.fillText(`${pct}%`, x, mid + 2);
      x += g.measureText('100%').width + 40;
    }
    // The units, at the right: the count, and a square each against the limit where there is one.
    g.textAlign = 'right';
    g.fillStyle = INK.text;
    g.font = MONO_FONT(40, 600);
    const label = s.limit === undefined ? `${s.workers} units  no limit` : `${s.workers}/${s.limit} units`;
    g.fillText(label, W - 26, mid + 2);
    if (s.limit !== undefined) {
      const x1 = W - 26 - g.measureText(label).width - 24;
      const n = Math.max(s.limit, s.workers);
      const pip = Math.min(26, (x1 - x) / Math.max(1, n));
      for (let i = 0; i < n; i++) {
        const px = x1 - (n - i) * pip;
        const used = i < s.workers;
        g.fillStyle = i >= s.limit ? PANEL.stuck : used ? (full ? PANEL.review : PANEL.working) : PANEL.card;
        g.fillRect(px, mid - 11, Math.max(2, pip - 6), 22);
      }
    }
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
  }

  /** One gauge: its name, the percent now, a line under it, and the last few minutes as a filled graph. */
  private panel(x: number, y: number, w: number, name: string, pct: number, sub: string, history: number[]) {
    const g = this.ctx;
    const color = loadColor(pct);
    g.fillStyle = PANEL.card;
    g.fillRect(x, y, w, 320);
    g.strokeStyle = PANEL.line;
    g.lineWidth = 2;
    g.strokeRect(x + 1, y + 1, w - 2, 318);
    g.textAlign = 'left';
    g.fillStyle = PANEL.muted;
    g.font = UI_FONT(600, 24);
    g.letterSpacing = '3px';
    g.fillText(name, x + 20, y + 42);
    g.letterSpacing = '0px';
    g.fillStyle = color;
    g.font = MONO_FONT(80);
    g.fillText(`${pct}%`, x + 20, y + 124);
    g.fillStyle = PANEL.muted;
    g.font = MONO_FONT(22);
    g.fillText(sub, x + 20, y + 162);
    // The graph: 0-100%, the newest reading on the right.
    const gx = x + 20;
    const gy = y + 196;
    const gw = w - 40;
    const gh = 100;
    // The 90% line: past it, hiring comes with a warning.
    g.strokeStyle = PANEL.lineStrong;
    g.lineWidth = 2;
    g.setLineDash([6, 6]);
    g.beginPath();
    g.moveTo(gx, gy + gh * 0.1);
    g.lineTo(gx + gw, gy + gh * 0.1);
    g.stroke();
    g.setLineDash([]);
    if (history.length < 2) return;
    const step = gw / (history.length - 1);
    const at = (i: number) => [gx + i * step, gy + gh - (Math.max(0, Math.min(100, history[i])) / 100) * gh] as const;
    g.beginPath();
    g.moveTo(gx, gy + gh);
    for (let i = 0; i < history.length; i++) g.lineTo(...at(i));
    g.lineTo(gx + gw, gy + gh);
    g.closePath();
    g.globalAlpha = 0.18;
    g.fillStyle = color;
    g.fill();
    g.globalAlpha = 1;
    g.beginPath();
    for (let i = 0; i < history.length; i++) (i ? g.lineTo : g.moveTo).call(g, ...at(i));
    g.strokeStyle = color;
    g.lineWidth = 3;
    g.stroke();
  }
}

