import * as THREE from 'three';
import { MISSION_TABLE } from '../../../shared/layout';
import type { Fixture } from '../../world/office/fixture';
import { DECK } from '../../world/office/materials';
import { sharp } from '../../world/sharp';

// The holo table's heading: a band of light lettering floating round the course plot, turning slowly
// the other way, that says where the ship is making for and how far it has come ("CAPTAIN, WE ARE 40%
// OF THE WAY TO AUTH REWRITE", the waypoint, what's left, who's on it, the course); and a progress
// ring on the table's top, an arc from the bow round as far as the waypoint has come. Additive
// ship-cyan like the plot, writing no depth, so it hides nothing behind it.

export interface HoloHeading {
  /** What the band says, phrase by phrase, and how far round the ring goes (0-1, none without a measure). */
  set(phrases: string[], progress: number | undefined): void;
  /** Turns the band on `dt` seconds at `k` times its pace (0 holds it). */
  turn(dt: number, k: number): void;
}

declare module '../../world/types' {
  interface OfficeHandles {
    /** The holo table's heading band and progress ring (features/life). */
    heading: HoloHeading;
  }
}

/** The band: its radius, how high its middle is over the table's top, how tall, how many times the text goes round. */
const BAND = { r: MISSION_TABLE.r * 0.72 + 0.32, y: 0.56, h: 0.12, repeat: 2 } as const;
/** The progress ring on the tabletop, out past the emitter. */
const RING = { inner: MISSION_TABLE.r * 0.72 + 0.36, outer: MISSION_TABLE.r * 0.72 + 0.44 } as const;
/** The band's pace: a turn every 150 s (against the plot's two minutes the other way). */
const TURN = (Math.PI * 2) / 150;

const MONO = (size: number) => `600 ${size}px "JetBrains Mono", ui-monospace, monospace`;

function light(opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: DECK.ship, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
}

/** Lays `phrases` along the canvas, spaced evenly, as many times as fit, in white for the material to tint. */
function paintBand(g: CanvasRenderingContext2D, W: number, H: number, phrases: string[]) {
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#000000';
  g.fillRect(0, 0, W, H);
  g.font = MONO(Math.round(H * 0.62));
  g.letterSpacing = `${Math.round(H * 0.08)}px`;
  g.textBaseline = 'middle';
  g.fillStyle = '#ffffff';
  const sep = '   ·   ';
  let body = phrases.join(sep);
  while (body.length > 3 && g.measureText(body + sep).width > W) body = `${body.slice(0, -4).trimEnd()}...`;
  const line = body + sep;
  const w = g.measureText(line).width;
  const times = Math.max(1, Math.floor(W / w));
  const gap = (W - w * times) / times;
  for (let i = 0; i < times; i++) g.fillText(line, i * (w + gap) + gap / 2, H * 0.54);
  g.letterSpacing = '0px';
  // A hairline over and under the lettering.
  g.fillRect(0, 2, W, 2);
  g.fillRect(0, H - 4, W, 2);
}

export const heading: Fixture<'heading'> = (site) => {
  const root = new THREE.Group();
  root.position.set(MISSION_TABLE.x, MISSION_TABLE.h, MISSION_TABLE.z);

  const canvas = document.createElement('canvas');
  canvas.width = 4096;
  canvas.height = 90;
  const g = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.repeat.x = BAND.repeat;
  sharp(texture);
  const bandMat = light(0.42);
  bandMat.map = texture;
  // Only the side toward you, so the far side's lettering never shows through backward.
  bandMat.side = THREE.FrontSide;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(BAND.r, BAND.r, BAND.h, 96, 1, true), bandMat);
  band.position.y = BAND.y;
  root.add(band);

  const track = new THREE.Mesh(new THREE.RingGeometry(RING.inner, RING.outer, 128).rotateX(-Math.PI / 2), light(0.06));
  track.position.y = 0.013;
  root.add(track);
  const arcMat = light(0.6);
  const arc = new THREE.Mesh(new THREE.BufferGeometry(), arcMat);
  arc.position.y = 0.014;
  root.add(arc);
  root.traverse((o) => {
    o.renderOrder = 3;
    o.castShadow = false;
    o.receiveShadow = false;
  });
  root.name = 'life-heading';
  site.group.add(root);

  let key = '';
  const set = (phrases: string[], progress: number | undefined) => {
    const k = JSON.stringify([phrases, progress]);
    if (k === key) return;
    key = k;
    paintBand(g, canvas.width, canvas.height, phrases);
    texture.needsUpdate = true;
    arc.geometry.dispose();
    const p = Math.max(0, Math.min(1, progress ?? 0));
    // From the bow (-z), clockwise as seen from above; a sliver at 0% so the start reads.
    arc.geometry = new THREE.RingGeometry(RING.inner, RING.outer, 128, 1, Math.PI / 2, -Math.max(0.02, p) * Math.PI * 2).rotateX(-Math.PI / 2);
    arc.visible = progress !== undefined;
  };
  set([], undefined);
  const turn = (dt: number, k: number) => {
    band.rotation.y -= TURN * dt * k;
  };
  return { handle: { heading: { set, turn } } };
};
