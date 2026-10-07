// Painting a pod's ground label into its canvas: the pod's letter, the goal's title in bold over the
// counts line, each count in its state's color ("1 needs you" Signal orange, "stuck" red, "to review"
// yellow, the rest grey), on a dark chip so it reads on the deck by night and by day. A count that
// changes rolls: the old number slides up and out as the new one comes in from below (`k` 0 to 1).
// The goal's hue isn't painted here: it's the bar down the label's left (world.ts), which fades with
// the zone.
import { stretch } from '../../world/toon';
import { DECK } from '../../world/office/materials';
import { SEP, segmentText, type PodLabelText, type Tone } from './label';

const UI = (weight: number, size: number) => `${weight} ${size}px Archivo, system-ui, sans-serif`;

/** Archivo's narrower cut for the title, so more of a goal's name fits (where the canvas can stretch). */
function narrow(g: CanvasRenderingContext2D, on: boolean) {
  const c = g as CanvasRenderingContext2D & { fontStretch?: string };
  if ('fontStretch' in c) c.fontStretch = on ? 'semi-condensed' : 'normal';
}

export const TONE_COLOR: Record<Tone, string> = {
  'needs-you': DECK.signal,
  stuck: DECK.stuck,
  review: DECK.review,
  working: DECK.muted,
  idle: DECK.muted,
};

/** How much of the canvas's width the hue bar takes, on the left (world.ts lays its mesh there). */
export const BAR = 0.022;

/** The label's chip: instrument black, a little see-through, with a steel hairline. */
function chip(g: CanvasRenderingContext2D, W: number, H: number) {
  const r = H * 0.1;
  g.beginPath();
  g.roundRect(2, 2, W - 4, H - 4, r);
  g.fillStyle = 'rgba(11, 18, 25, 0.84)';
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = DECK.steel;
  g.stroke();
}

/** Paints `text` (rolling from `prev`'s numbers, `k` of the way). */
export function paintLabel(g: CanvasRenderingContext2D, W: number, H: number, text: PodLabelText, rolling: Map<Tone, number | undefined>, k: number) {
  g.clearRect(0, 0, W, H);
  chip(g, W, H);
  const left = W * BAR + H * 0.12;
  // The letter, big, in its own ruled square.
  g.fillStyle = DECK.text;
  g.font = UI(700, Math.round(H * 0.5));
  stretch(g, true);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const sq = H * 0.52;
  g.fillText(text.letter, left + sq / 2, H * 0.53);
  stretch(g, false);
  g.strokeStyle = DECK.steel;
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(left + sq + H * 0.06, H * 0.18);
  g.lineTo(left + sq + H * 0.06, H * 0.82);
  g.stroke();

  const x0 = left + sq + H * 0.18;
  const max = W - x0 - H * 0.14;
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  // Line 1: the goal, bold.
  g.fillStyle = text.goal ? DECK.text : DECK.muted;
  g.font = UI(700, Math.round(H * 0.36));
  narrow(g, true);
  let title = text.title;
  while (title.length > 3 && g.measureText(title).width > max) title = `${title.slice(0, -2).trimEnd()}…`;
  g.fillText(title, x0, H * 0.47);
  narrow(g, false);

  // Line 2: the counts, each in its tone.
  const size = Math.round(H * 0.27);
  const base = H * 0.83;
  g.font = UI(600, size);
  let x = x0;
  const band = { top: base - size * 1.05, h: size * 1.35 };
  const e = 1 - (1 - Math.min(1, Math.max(0, k))) ** 3;
  for (const [i, s] of text.segments.entries()) {
    if (i) {
      g.fillStyle = DECK.muted;
      g.fillText(SEP, x, base);
      x += g.measureText(SEP).width;
    }
    g.fillStyle = TONE_COLOR[s.tone];
    if (s.n !== undefined && rolling.has(s.tone) && e < 1) {
      const now = String(s.n);
      const was = rolling.get(s.tone);
      const w = g.measureText(now).width;
      g.save();
      g.beginPath();
      g.rect(x - 2, band.top, Math.max(w, was === undefined ? 0 : g.measureText(String(was)).width) + 4, band.h);
      g.clip();
      if (was !== undefined) {
        g.globalAlpha = 1 - e;
        g.fillText(String(was), x, base - e * band.h);
      }
      g.globalAlpha = e;
      g.fillText(now, x, base + (1 - e) * band.h);
      g.restore();
      x += w;
      const rest = ` ${s.words}`;
      g.fillText(rest, x, base);
      x += g.measureText(rest).width;
    } else {
      const t = segmentText(s);
      g.fillText(t, x, base);
      x += g.measureText(t).width;
    }
  }
}
