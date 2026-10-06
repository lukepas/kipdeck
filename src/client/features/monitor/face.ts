// The service monitor's card, on its face whenever the live page isn't laid over it (live.ts): laid out
// like the wall boards (boards/screen.ts), its name and the service's port in the title bar, then the
// service in big type, whose it is and its command, and the keys. With nothing running, a clean "No
// service running". At Low quality, or where this page can't frame the service, an Open button (E opens
// it full screen, or in a tab). From across the deck, its counts (boards/far.ts). Pure painters.
import { INK, MONO, UI, clip, emptyBody, ground, titleBar, type Screen } from '../boards/screen';
import { paintFar, type FarSpec } from '../boards/far';
import { chip } from '../boards/table';
import { PANEL } from '../boards/world';
import { DECK } from '../../world/office/materials';

/** The face's canvas units a metre: read standing a few metres off. */
export const MONITOR_UNITS = 640;

/** What the card says. */
export interface MonitorCard {
  /** The service on it, or none running. */
  service: { port: number; title: string; who: string; command: string } | null;
  /** How many the office lists. */
  count: number;
  /** How the page is offered: laid live over the screen when near, or behind the Open button. */
  mode: 'live' | 'open';
  /** Why it's behind Open, said under the button. */
  why?: string;
}

/** A key cap and its word, at (x, y) on the baseline; returns where the next starts. */
function keyCap(g: CanvasRenderingContext2D, k: string, word: string, x: number, y: number): number {
  g.font = MONO(26, 700);
  const kw = g.measureText(k).width + 22;
  g.strokeStyle = INK.lineStrong;
  g.lineWidth = 3;
  g.beginPath();
  g.roundRect(x, y - 30, kw, 40, 6);
  g.stroke();
  g.fillStyle = INK.text;
  g.textAlign = 'left';
  g.fillText(k, x + 11, y - 1);
  g.font = UI(600, 28);
  g.fillStyle = INK.dim;
  g.fillText(word, x + kw + 10, y - 2);
  return x + kw + 10 + g.measureText(word).width + 30;
}

/** Paints the card on `s` (MONITOR_UNITS a metre). */
export function paintMonitor(s: Screen, c: MonitorCard) {
  const { g, W, H } = s;
  ground(g, W, H);
  const svc = c.service;
  titleBar(g, W, 'Service monitor', svc ? `:${svc.port}` : 'none', svc ? DECK.ship : INK.lineStrong);
  if (!svc) {
    emptyBody(g, W, H, 'No service running', 'A unit\'s dev server shows here once it starts');
    s.texture.needsUpdate = true;
    return;
  }
  const pad = 32;
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  g.fillStyle = INK.text;
  g.font = UI(700, 58);
  g.fillText(clip(g, svc.title, W - pad * 2), pad, 168);
  g.font = UI(500, 32);
  g.fillStyle = INK.dim;
  g.fillText(clip(g, svc.who, W - pad * 2), pad, 214);
  g.font = MONO(28, 600);
  g.fillText(clip(g, svc.command, W - pad * 2), pad, 256);
  if (c.mode === 'open') {
    // The Open button, in the Signal outline the office gives its one action.
    const bw = 300;
    const bh = 92;
    const bx = pad;
    const by = 300;
    g.beginPath();
    g.roundRect(bx, by, bw, bh, 12);
    g.fillStyle = 'rgba(255,106,26,0.16)';
    g.fill();
    g.strokeStyle = PANEL.signal;
    g.lineWidth = 5;
    g.stroke();
    g.fillStyle = INK.text;
    g.font = UI(700, 44);
    g.textBaseline = 'middle';
    g.fillText('OPEN', bx + 36, by + bh / 2 + 2);
    g.font = MONO(30, 700);
    g.fillStyle = PANEL.signal;
    g.textAlign = 'right';
    g.fillText('E', bx + bw - 36, by + bh / 2 + 2);
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    if (c.why) {
      g.font = UI(500, 28);
      g.fillStyle = INK.dim;
      g.fillText(clip(g, c.why, W - bx - bw - pad * 2), bx + bw + 28, by + bh / 2 + 10);
    }
  } else {
    // Live: walk up and the page itself is laid over this card.
    chip(g, { text: 'live', hue: DECK.ship, strong: true }, pad, 340, 40);
    g.font = UI(500, 30);
    g.fillStyle = INK.dim;
    g.fillText(clip(g, 'Walk up to see the page itself', W - pad * 2 - 170), pad + 150, 351);
  }
  let x = pad;
  const y = H - 36;
  x = keyCap(g, 'E', c.mode === 'live' ? 'Use' : 'Open', x, y);
  x = keyCap(g, 'O', 'Full screen', x, y);
  if (c.count > 1) x = keyCap(g, 'C', `Next (${c.count})`, x, y);
  keyCap(g, 'R', 'Reload', x, y);
  s.texture.needsUpdate = true;
}

/** The monitor from across the deck: the port on it in its name, and how many services run, big. Pure. */
export function monitorFar(c: MonitorCard): FarSpec {
  if (!c.service) return { title: 'Service monitor', hue: INK.lineStrong, counts: [], empty: 'No service running' };
  return { title: `Monitor :${c.service.port}`, hue: DECK.ship, counts: [{ n: String(c.count), word: 'running', hue: PANEL.settled, glyph: 'done' }] };
}

/** Paints the card, or from afar its counts. */
export function paintMonitorFace(s: Screen, c: MonitorCard, far: boolean) {
  if (far) paintFar(s, MONITOR_UNITS, monitorFar(c));
  else paintMonitor(s, c);
}
