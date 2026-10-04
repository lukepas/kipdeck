import * as THREE from 'three';
import { MISSION_TABLE } from '../../../shared/layout';
import type { Fixture } from '../../world/office/fixture';
import { DECK } from '../../world/office/materials';
import { onBridgeLayer } from '../bridge/shapes';

// The ticker over the overhead strip: on its west end the ship's clock and how long the deck has been
// under way, ticking by the second; along the rest the deck's log (the timeline's latest events, in
// the office's own words) running right to left like a station's wire. Hung on the strip's rods, on
// the bridge layer like the strip, so the Overview never sees it. No state's hue on it: the strip
// under it already counts the states. The ship's voice (features/vesper) may put one line at the head
// of the log, under its name.

export interface Ticker {
  /** The log's lines, newest first. */
  setLog(lines: string[]): void;
  /** A line from the ship's voice (features/vesper), run at the head of the log under its name; null takes it off. */
  setVoice(line: string | null): void;
  /** The clock's two readings: the time and how long under way (or holding station). */
  setClock(time: string, underWay: string): void;
  /** Runs the log on `dt` seconds at `k` times its pace (0 holds it). */
  run(dt: number, k: number): void;
}

declare module '../../world/types' {
  interface OfficeHandles {
    /** The clock and the log over the overhead strip (features/life). */
    ticker: Ticker;
  }
}

/** Where it hangs: the overhead strip's radius and arc (displays.ts), just over its top rim. */
const TICK = { r: 11.4, arc: 1.06, y: 5.22, h: 0.32, clock: 0.22 } as const;
/** How fast the log runs: its whole width every 70 s. */
const PACE = 1 / 70;

const UI = (weight: number, size: number) => `${weight} ${size}px Archivo, system-ui, sans-serif`;
const MONO = (size: number) => `500 ${size}px "JetBrains Mono", ui-monospace, monospace`;

/** A slice of the inside of a cylinder round the table, `from` to `to` (radians), its canvas mirrored to read from inside. */
function slice(from: number, to: number, w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d')!;
  // Seen from inside, the cylinder's u runs right to left: draw everything mirrored.
  g.setTransform(-1, 0, 0, 1, w, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(TICK.r, TICK.r, TICK.h, 40, 1, true, from, to - from), new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, toneMapped: false }));
  mesh.position.set(MISSION_TABLE.x, TICK.y + TICK.h / 2, MISSION_TABLE.z);
  return { canvas, g, texture, mesh };
}

export const ticker: Fixture<'ticker'> = (site) => {
  // Due north is pi; the arc's east end is its start. The clock takes the west end.
  const east = Math.PI - TICK.arc / 2;
  const west = Math.PI + TICK.arc / 2;
  const split = west - TICK.arc * TICK.clock;
  const log = slice(east, split, 4096, 154);
  log.texture.wrapS = THREE.RepeatWrapping;
  const clock = slice(split, west, 1024, 140);
  const group = new THREE.Group();
  group.add(log.mesh, clock.mesh);
  group.name = 'life-ticker';
  site.group.add(onBridgeLayer(group));

  let voice: string | null = null;
  const paintLog = (lines: string[]) => {
    const { g, canvas } = log;
    const W = canvas.width;
    const H = canvas.height;
    g.fillStyle = DECK.instrument;
    g.fillRect(0, 0, W, H);
    g.fillStyle = DECK.shipDim;
    g.fillRect(0, 0, W, 3);
    g.fillRect(0, H - 3, W, 3);
    g.textBaseline = 'middle';
    let x = 30;
    if (voice) {
      // The ship's voice goes first: its name in mono, its line in italics, a rule after it.
      g.font = MONO(Math.round(H * 0.36));
      g.fillStyle = DECK.ship;
      g.fillText('VESPER', x, H / 2);
      x += g.measureText('VESPER').width + 24;
      g.font = `italic ${UI(500, Math.round(H * 0.46))}`;
      g.fillStyle = DECK.text;
      g.fillText(voice, x, H / 2);
      x += g.measureText(voice).width + 60;
      g.fillStyle = DECK.shipDim;
      g.fillRect(x - 30, H * 0.25, 3, H * 0.5);
      x += 30;
    }
    for (const l of lines) {
      const [time, ...rest] = l.split('  ');
      const text = rest.join('  ');
      g.font = MONO(Math.round(H * 0.42));
      if (text) {
        g.fillStyle = DECK.ship;
        g.fillText(time, x, H / 2);
        x += g.measureText(time).width + 24;
      }
      g.font = UI(600, Math.round(H * 0.46));
      g.fillStyle = DECK.text;
      const words = text || time;
      if (x + g.measureText(words).width > W - 30) break;
      g.fillText(words, x, H / 2);
      x += g.measureText(words).width + 90;
    }
  };
  const paintClock = (time: string, underWay: string) => {
    const { g, canvas } = clock;
    const W = canvas.width;
    const H = canvas.height;
    g.fillStyle = DECK.instrument;
    g.fillRect(0, 0, W, H);
    g.fillStyle = DECK.shipDim;
    g.fillRect(0, 0, W, 3);
    g.fillRect(0, H - 3, W, 3);
    // A rule between the clock and the log.
    g.fillRect(W - 4, 0, 4, H);
    g.textBaseline = 'middle';
    g.font = MONO(Math.round(H * 0.3));
    g.fillStyle = DECK.ship;
    g.fillText('SHIP', 28, H / 2);
    g.font = MONO(Math.round(H * 0.6));
    g.fillStyle = DECK.text;
    g.fillText(time, 150, H / 2 + 2);
    g.font = MONO(Math.round(H * 0.32));
    g.fillStyle = DECK.steel;
    g.textAlign = 'right';
    g.fillText(underWay, W - 30, H / 2);
    g.textAlign = 'left';
  };

  let logKey = '';
  let clockKey = '';
  let logLines: string[] = [];
  const setLog = (lines: string[]) => {
    const k = `${voice}\n${lines.join('\n')}`;
    if (k === logKey) return;
    logKey = k;
    logLines = lines;
    paintLog(lines);
    log.texture.needsUpdate = true;
  };
  const setVoice = (line: string | null) => {
    voice = line;
    setLog(logLines);
  };
  const setClock = (time: string, underWay: string) => {
    const k = `${time}|${underWay}`;
    if (k === clockKey) return;
    clockKey = k;
    paintClock(time, underWay);
    clock.texture.needsUpdate = true;
  };
  setLog(['LOG IS QUIET ON THIS DECK']);
  setClock('--:--', 'HOLDING STATION');
  const run = (dt: number, k: number) => {
    // Content moves left on screen: toward the higher u, so the offset falls.
    log.texture.offset.x = (log.texture.offset.x - PACE * dt * k) % 1;
  };
  return { handle: { ticker: { setLog, setVoice, setClock, run } } };
};
