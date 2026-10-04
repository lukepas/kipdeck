import * as THREE from 'three';
import type { MachineState } from '../../../shared/protocol';
import { officeFull } from '../../../shared/machine';

import { MONO_FONT, PANEL, UI_FONT, panelGround } from './world';

/** Steel while there's room, amber when it's getting full, red from where deploying gets a warning. */
export function loadColor(pct: number): string {
  return pct >= 90 ? PANEL.stuck : pct >= 70 ? PANEL.review : PANEL.working;
}

export function fmtGb(bytes: number): string {
  const gb = bytes / 2 ** 30;
  return `${gb.toFixed(gb < 10 ? 1 : 0)} GB`;
}

/**
 * The capacity panel at the head of the Proof corner: how busy the CPU and memory are, with the last
 * few minutes of each, and how many units the office runs of the most it takes.
 */
export class MachineTexture {
  readonly texture: THREE.CanvasTexture;
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private drawn = '';

  constructor() {
    // The panel's own shape (MACHINE_MONITOR is 2.6 by 1.5 m).
    this.canvas.width = 920;
    this.canvas.height = 520;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
  }

  render(s: MachineState) {
    const key = JSON.stringify(s);
    if (key === this.drawn) return;
    this.drawn = key;
    const g = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    panelGround(g, W, H);
    g.textBaseline = 'alphabetic';

    // Header: whether there's room for another unit, as a state glyph and a word.
    g.textAlign = 'left';
    const full = officeFull(s);
    const status: [string, string] = !s.memTotal ? ['reading', PANEL.muted] : s.pressure ? ['under pressure', PANEL.stuck] : full ? ['at its limit', PANEL.review] : ['room to deploy', PANEL.settled];
    g.fillStyle = status[1];
    g.fillRect(30, 40, 16, 16);
    g.fillStyle = PANEL.text;
    g.font = UI_FONT(600, 32);
    g.fillText(status[0], 60, 58);

    const memPct = s.memTotal ? Math.round((s.memUsed / s.memTotal) * 100) : 0;
    this.panel(30, 90, 415, 'CPU', s.cpu, s.cores ? `${s.cores} core${s.cores === 1 ? '' : 's'}` : '', s.history.map(([c]) => c));
    this.panel(475, 90, 415, 'MEMORY', memPct, s.memTotal ? `${fmtGb(s.memUsed)} of ${fmtGb(s.memTotal)}` : '', s.history.map(([, m]) => m));

    // Footer: the units, a square each, against the limit.
    const y = 450;
    g.textAlign = 'left';
    g.font = MONO_FONT(28);
    g.fillStyle = PANEL.text;
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

