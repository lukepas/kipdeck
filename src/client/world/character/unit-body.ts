import * as THREE from 'three';
import { DECK, flat, matte, matteUnique, practical } from '../office/materials';
import { mesh, textPlane } from '../toon';
import { drawMark } from '../office/floorpaint';

// A unit's body: a faceless figure on a hover base. A slim faceted torso with a lit band round its
// chest and the Formation mark on its chest plate (the one thing on it that is the brand's own), a flat
// head plate with a dark visor strip, short tapered arm blades, and a provider stripe down its back plate. Forward is +z, its origin is where it docks (the stool's pad, or the floor),
// and it stands 1.3 m before its seat scales it. Built once per unit from shared shapes.

/** Heights (m, unscaled) the rest of the unit lines up with. */
export const UNIT = {
  /** The gap under the hover base. */
  hover: 0.1,
  band: 0.8,
  head: 1.19,
  /** The top of the head plate. */
  top: 1.31,
  shoulder: 0.93,
} as const;

/**
 * A unit's shell with a cool rim light: its edges, where they turn away from you, catch a little
 * cold light, so a unit holds its silhouette against the dark walls and consoles behind it.
 */
function rimmed(color: string, rim: number): THREE.MeshStandardMaterial {
  const m = matteUnique(color, { flat: true });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      totalEmissiveRadiance += vec3(0.42, 0.62, 0.72) * ${rim.toFixed(3)} * pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 2.5);`,
    );
  };
  m.customProgramCacheKey = () => `unit-rim-${rim}`;
  return m;
}

const shells: Partial<Record<'live' | 'stuck' | 'asleep', THREE.MeshStandardMaterial>> = {};
/** The body's shell in its three tones: at work, stuck (30% darker) and asleep (darker still); the rim dims with it. */
const SHELL = {
  live: () => (shells.live ??= rimmed(DECK.unit, 0.16)),
  stuck: () => (shells.stuck ??= rimmed('#1E242B', 0.1)),
  asleep: () => flat('#191E24'),
} as const;
export type Shell = keyof typeof SHELL;

/** The Formation mark for the chest plate, drawn once and shared: light steel chevrons on nothing. */
let markTex: THREE.CanvasTexture | null = null;
function chestMark(): THREE.CanvasTexture {
  if (markTex) return markTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  drawMark(c.getContext('2d')!, 4, 4, 5, DECK.text, DECK.steel);
  markTex = new THREE.CanvasTexture(c);
  markTex.colorSpace = THREE.SRGBColorSpace;
  markTex.anisotropy = 4;
  return markTex;
}

let shapes: ReturnType<typeof makeShapes> | null = null;
/** The shapes every unit shares. */
function makeShapes() {
  return {
    disc: new THREE.CylinderGeometry(0.17, 0.2, 0.05, 8),
    column: new THREE.CylinderGeometry(0.085, 0.15, 0.3, 6),
    glow: new THREE.CircleGeometry(0.15, 16).rotateX(Math.PI / 2),
    torso: new THREE.CapsuleGeometry(0.19, 0.22, 3, 8).scale(1, 1, 0.8),
    band: new THREE.CylinderGeometry(0.2, 0.2, 0.045, 8, 1, true).scale(1, 1, 0.8),
    stripe: new THREE.BoxGeometry(0.05, 0.3, 0.02),
    neck: new THREE.CylinderGeometry(0.05, 0.065, 0.09, 6),
    head: new THREE.BoxGeometry(0.34, 0.2, 0.26),
    crown: new THREE.BoxGeometry(0.28, 0.03, 0.2),
    visor: new THREE.BoxGeometry(0.29, 0.065, 0.012),
    edge: new THREE.BoxGeometry(0.28, 0.008, 0.008),
    blade: new THREE.CylinderGeometry(0.036, 0.018, 0.34, 4).scale(1, 1, 1.7),
    mark: new THREE.PlaneGeometry(0.13, 0.13),
  };
}

export interface UnitBody {
  /** Everything that moves as the figure: leans, slumps and turns. */
  figure: THREE.Group;
  /** The shell's meshes, to swap between tones (see Shell). */
  shell: THREE.Mesh[];
  /** The chest band: its color is the unit's state. */
  band: THREE.MeshBasicMaterial;
  /** The visor strip: dark, flickering with the unit's terminal output. */
  visor: THREE.MeshBasicMaterial;
  /** The glow under the hover base. */
  under: THREE.MeshBasicMaterial;
  stripe: THREE.MeshStandardMaterial;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  /** The provider's letters on the visor (see setGlyph). */
  glyphAt: THREE.Group;
}

/** A unit's body, in neutral steel until its state and provider are set. */
export function buildUnit(): UnitBody {
  shapes ??= makeShapes();
  const s = shapes;
  const figure = new THREE.Group();
  const shell: THREE.Mesh[] = [];
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, shadow = true, parent: THREE.Object3D = figure) => {
    const m = mesh(geo, mat, x, y, z, shadow);
    parent.add(m);
    return m;
  };
  const body = SHELL.live();
  const steel = matte(DECK.steel, { metalness: 0.15, roughness: 0.7, flat: true });
  // The hover base: a faceted column on a disc, a glow under it, and the gap below. The small parts
  // inside the big ones' shadow (the disc under the column, the neck, the crown on the head) cast none
  // of their own: a shadow draw each, for nothing anyone could see.
  add(s.disc, steel, 0, UNIT.hover + 0.025, 0, false);
  const under = new THREE.MeshBasicMaterial({ color: DECK.working, toneMapped: false, transparent: true, opacity: 0.55, depthWrite: false });
  add(s.glow, under, 0, UNIT.hover - 0.002, 0, false);
  shell.push(add(s.column, body, 0, UNIT.hover + 0.2, 0));
  // The torso, the band round its chest, and the provider stripe down its back.
  shell.push(add(s.torso, body, 0, 0.72, 0));
  const band = new THREE.MeshBasicMaterial({ color: DECK.working, toneMapped: false, side: THREE.DoubleSide, fog: false });
  add(s.band, band, 0, UNIT.band, 0, false);
  const stripe = matte(DECK.muted, { flat: true }).clone();
  add(s.stripe, stripe, 0, 0.72, -0.155, false);
  // The Formation mark on the chest plate, above the band.
  const mark = new THREE.MeshBasicMaterial({ map: chestMark(), transparent: true, toneMapped: false, depthWrite: false });
  add(s.mark, mark, 0, 0.905, 0.148, false);
  // The head plate on its neck, a thinner plate on top for the bevel, and the visor across its face.
  add(s.neck, steel, 0, 1.065, 0, false);
  shell.push(add(s.head, body, 0, UNIT.head, 0));
  shell.push(add(s.crown, body, 0, UNIT.top - 0.015, -0.01, false));
  // A lit hairline along the head plate's top front edge: it holds the silhouette against the slate.
  add(s.edge, practical(DECK.steel), 0, UNIT.top - 0.001, 0.1, false);
  const visor = new THREE.MeshBasicMaterial({ color: '#0E151C', toneMapped: false });
  add(s.visor, visor, 0, UNIT.head + 0.005, 0.131, false);
  const glyphAt = new THREE.Group();
  glyphAt.position.set(0.1, UNIT.head + 0.005, 0.139);
  figure.add(glyphAt);
  // Arm blades from the shoulders, hanging a little out from the torso.
  const arm = (x: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, UNIT.shoulder, 0);
    pivot.rotation.z = Math.sign(x) * 0.12;
    shell.push(add(s.blade, body, 0, -0.17, 0, true, pivot));
    figure.add(pivot);
    return pivot;
  };
  const armL = arm(-0.245);
  const armR = arm(0.245);
  return { figure, shell, band, visor, under, stripe, armL, armR, glyphAt };
}

/** Paints the shell in `tone`. */
export function paintShell(u: UnitBody, tone: Shell) {
  const m = SHELL[tone]();
  for (const part of u.shell) part.material = m;
}

/** The provider's letters, small, on the visor's right end. */
export function setGlyph(u: UnitBody, letters: string) {
  for (const c of u.glyphAt.children) {
    const p = c as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    p.material.map?.dispose();
    p.material.dispose();
    p.geometry.dispose();
  }
  u.glyphAt.clear();
  if (!letters) return;
  const plate = textPlane(letters, { face: 'mono', size: 40, color: '#8A97A5' });
  plate.scale.multiplyScalar(0.16);
  u.glyphAt.add(plate);
}
