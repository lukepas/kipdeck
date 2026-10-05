import * as THREE from 'three';
import { MEETING_PATTERNS, meetingSpend, meetingStage, meetingSummary } from '../../../shared/meetings';
import type { Meeting, MeetingState } from '../../../shared/protocol';

import { PANEL, panelGround } from './world';
import { sharp } from '../../world/sharp';

const FONT = 'Archivo, system-ui, sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, monospace';
const INK = PANEL.text;

function canvasTexture(w: number, h: number): { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D; texture: THREE.CanvasTexture } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  sharp(texture);
  return { canvas, g: canvas.getContext('2d')!, texture };
}

/** Breaks text into lines no wider than `maxW`, cutting words too long for a line of their own. */
function wrap(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const word of text.split(/\s+/)) {
    if (!word) continue;
    if (cur && g.measureText(`${cur} ${word}`).width > maxW) {
      lines.push(cur);
      cur = word;
    } else cur = cur ? `${cur} ${word}` : word;
    while (g.measureText(cur).width > maxW && cur.length > 1) {
      let cut = cur.length - 1;
      while (cut > 1 && g.measureText(cur.slice(0, cut)).width > maxW) cut--;
      lines.push(cur.slice(0, cut));
      cur = cur.slice(cut);
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Who has the floor right now: the roles on the parts being worked on. */
export function speaking(m: Meeting): string[] {
  return m.turns.filter((t) => t.state !== 'done').map((t) => m.seats[t.seat]?.role ?? '?');
}

/**
 * The board on the Review bay's east wall: the review's output file as it's being written, like a
 * shared screen, with what's being worked on across the top.
 */
export class MeetingBoardTexture {
  readonly texture: THREE.CanvasTexture;
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;

  constructor() {
    const c = canvasTexture(1440, 640);
    this.canvas = c.canvas;
    this.g = c.g;
    this.texture = c.texture;
  }

  render(state: MeetingState) {
    const { g } = this;
    const W = this.canvas.width;
    const H = this.canvas.height;
    panelGround(g, W, H);
    const m = state.current;
    g.textBaseline = 'alphabetic';
    if (!m) {
      g.fillStyle = INK;
      g.textAlign = 'center';
      g.font = `600 52px ${FONT}`;
      g.fillText('The Review bay is free', W / 2, H / 2 - 10);
      g.font = `500 30px ${FONT}`;
      g.fillStyle = PANEL.muted;
      g.fillText('Press E at the table to call a review: whatever it writes shows up here.', W / 2, H / 2 + 46);
      g.textAlign = 'left';
      this.texture.needsUpdate = true;
      return;
    }
    const p = MEETING_PATTERNS[m.pattern];
    // Across the top: the file, and where the meeting is.
    g.fillStyle = PANEL.card;
    g.fillRect(0, 0, W, 70);
    g.fillStyle = m.status === 'stopped' ? PANEL.stuck : m.status === 'done' ? PANEL.settled : PANEL.review;
    g.fillRect(0, 68, W, 2);
    g.fillStyle = INK;
    g.font = `500 32px ${MONO}`;
    g.fillText(m.output, 24, 48);
    g.font = `600 30px ${FONT}`;
    g.textAlign = 'right';
    g.fillStyle = PANEL.muted;
    g.fillText(`${p.label}  ${m.status === 'running' ? meetingStage(m) : m.status === 'done' ? 'done' : 'stopped'}`, W - 24, 48);
    g.textAlign = 'left';

    const text = (m.preview ?? '').replace(/\r/g, '');
    if (!text.trim()) {
      g.fillStyle = PANEL.muted;
      g.font = `600 40px ${FONT}`;
      g.textAlign = 'center';
      g.fillText(m.status === 'running' ? `Nothing written yet: ${speaking(m).join(', ') || 'the table'} ${speaking(m).length === 1 ? 'is' : 'are'} on it` : m.reason ? m.reason : 'Nothing was written', W / 2, H / 2 + 30);
      g.textAlign = 'left';
      this.texture.needsUpdate = true;
      return;
    }
    // The file, markdown-ish: headings bold and bigger, the rest as it is. Only what fits: its start.
    let y = 118;
    const x = 30;
    const maxW = W - 60;
    for (const raw of text.split('\n')) {
      if (y > H - 14) break;
      const heading = /^(#{1,6})\s+(.*)$/.exec(raw);
      const line = heading ? heading[2] : raw.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]*)`/g, '$1');
      const size = heading ? (heading[1].length === 1 ? 44 : 36) : 28;
      g.font = heading ? `700 ${size}px ${FONT}` : `500 ${size}px ${FONT}`;
      g.fillStyle = heading ? INK : PANEL.working;
      if (!line.trim()) {
        y += size * 0.5;
        continue;
      }
      for (const l of wrap(g, line, maxW)) {
        if (y > H - 14) break;
        g.fillText(l, x, y);
        y += size * 1.25;
      }
    }
    this.texture.needsUpdate = true;
  }
}

/**
 * The panel on the glass beside the Review bay's door, like a room-booking screen: what's on, the
 * round, who has the floor and what it has used so far; once it's over, its one-line summary.
 */
export class MeetingSignTexture {
  readonly texture: THREE.CanvasTexture;
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;

  constructor() {
    const c = canvasTexture(500, 800);
    this.canvas = c.canvas;
    this.g = c.g;
    this.texture = c.texture;
  }

  render(state: MeetingState) {
    const { g } = this;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const m = state.current;
    const pad = 28;
    const lines = (text: string, font: string, color: string, y: number, max: number, lh: number) => {
      g.font = font;
      g.fillStyle = color;
      for (const l of wrap(g, text, W - 2 * pad).slice(0, max)) {
        g.fillText(l, pad, y);
        y += lh;
      }
      return y;
    };
    panelGround(g, W, H);
    g.textBaseline = 'alphabetic';
    // A rule across the top in the state's hue, and the state in words.
    const [strip, label] = !m ? [PANEL.settled, 'FREE'] : m.status === 'running' ? [PANEL.review, 'IN REVIEW'] : m.status === 'done' ? [PANEL.settled, 'DONE'] : [PANEL.stuck, 'STOPPED'];
    g.fillStyle = strip;
    g.fillRect(0, 0, W, 6);
    g.fillStyle = PANEL.card;
    g.fillRect(0, 6, W, 72);
    g.fillStyle = strip;
    g.font = `500 34px ${MONO}`;
    g.fillText(label, pad, 56);
    if (!m) {
      const y = lines('Review bay', `600 48px ${FONT}`, INK, 160, 2, 58);
      lines('Press E at the table to call a review: a debate, lead and team, map-reduce, red and blue, or a panel.', `500 30px ${FONT}`, PANEL.muted, y + 30, 8, 40);
      this.texture.needsUpdate = true;
      return;
    }
    const p = MEETING_PATTERNS[m.pattern];
    let y = lines(p.label, `600 32px ${FONT}`, PANEL.review, 130, 1, 40);
    y = lines(m.title, `600 42px ${FONT}`, INK, y + 16, 3, 50);
    y += 18;
    if (m.status === 'running') {
      y = lines(meetingStage(m), `500 30px ${FONT}`, PANEL.working, y, 3, 40);
      const who = speaking(m);
      if (who.length) lines(`on it: ${who.join(', ')}`, `500 28px ${MONO}`, PANEL.muted, y + 8, 3, 38);
      // What's been spent, along the bottom.
      if (m.tokens) lines(`${meetingSpend(m)} so far`, `500 28px ${MONO}`, INK, H - 40, 1, 38);
    } else {
      // The summary line after the pattern, which is up top already.
      lines(meetingSummary(m).split(' · ').slice(1).join('  '), `500 28px ${FONT}`, PANEL.working, y, Math.floor((H - y) / 38), 38);
    }
    this.texture.needsUpdate = true;
  }
}
