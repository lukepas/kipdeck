import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DECK, flat, matte, matteUnique, practical } from '../office/materials';
import { mesh, textPlane } from '../toon';
import { drawMark } from '../office/floorpaint';

// A unit's body: a faceless figure on a hover base. A slim faceted torso with a lit band round its
// chest and the Formation mark on its chest plate (the one thing on it that is the brand's own), a flat
// head plate with a dark visor strip, short tapered arm blades, and a provider stripe down its back plate. Forward is +z, its origin is where it docks (the stool's pad, or the floor),
// and it stands 1.3 m before its seat scales it. Built once per unit from shared shapes.
//
// Drawn in few pieces: the shell (hover column, torso, head plate, its bevel and both arm blades) is
// one skinned mesh over three bones (the figure, and each arm's pivot), so it is one draw and one
// shadow draw where it was six and five; the steel (the disc under the column and the neck) is one
// more. Twelve units on a deck were nearly a third of the frame's draws before.

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
 * A unit's shell: a two-tone suit and a fresnel rim in its state's colour. The suit's upper half (the
 * head plate, the shoulders and the chest plate over the band) is a lighter graphite than its lower
 * half and the hover column, so a unit reads as a figure with a face and a body from across the deck;
 * its edges, where they turn away from you, catch its state's light (ship-cyan at work, orange when it
 * needs you, red stuck, amber to review, violet just merged, a cool steel standing by), so a unit holds
 * its silhouette against the dark hull and says its state in its outline too. Needing you keeps its
 * rim faint: orange over the cool starlight on its plates reads as violet, proof's hue, and the
 * diamond, the beam and the eye stripe already say it. All in the existing
 * material's shader (onBeforeCompile): no draw is added, and every tone shares one program.
 */
function rimmed(color: string, rim: number, rimColor: string): THREE.MeshStandardMaterial {
  const m = matteUnique(color, { flat: true });
  // A satin suit, not chalk: a little sheen on its plates.
  m.roughness = 0.55;
  m.metalness = 0.18;
  const uRim = { value: new THREE.Color(rimColor) };
  const uRimK = { value: rim };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = uRim;
    shader.uniforms.uRimK = uRimK;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', 'varying float vUnitY;\n#include <common>')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vUnitY = position.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', 'uniform vec3 uRim;\nuniform float uRimK;\nvarying float vUnitY;\n#include <common>')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
      // The two-tone suit: lighter plates over the band (and the head), darker under it and on the column.
      diffuseColor.rgb *= mix(vec3(0.62, 0.66, 0.72), vec3(1.55, 1.6, 1.68), smoothstep(${(UNIT.band + 0.03).toFixed(3)}, ${(UNIT.band + 0.07).toFixed(3)}, vUnitY));`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
      totalEmissiveRadiance += uRim * uRimK * pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 3.0);`,
      );
  };
  m.customProgramCacheKey = () => 'unit-shell-rim';
  return m;
}

const shells: Partial<Record<Shell, THREE.MeshStandardMaterial>> = {};
/**
 * The body's shell in its tones: at work (a ship-cyan rim), standing by (a cool steel rim), needing you,
 * to review, just merged (each its state's hue), stuck (30% darker, a red rim) and asleep (darker still,
 * no rim). The colours are the states' own (DECK), so the rim never says anything the band doesn't.
 */
const SHELL_LOOK = {
  live: [DECK.unit, 0.5, DECK.ship],
  idle: [DECK.unit, 0.3, '#8FA0C8'],
  needs: [DECK.unit, 0.1, DECK.signal],
  review: [DECK.unit, 0.42, DECK.review],
  merged: [DECK.unit, 0.45, DECK.proof],
  stuck: ['#1E242B', 0.32, DECK.stuck],
} as const;
export type Shell = keyof typeof SHELL_LOOK | 'asleep';
const SHELL = (tone: Shell): THREE.MeshStandardMaterial => {
  if (tone === 'asleep') return flat('#191E24');
  const [c, k, rim] = SHELL_LOOK[tone];
  return (shells[tone] ??= rimmed(c, k, rim));
};

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
    visor: new THREE.BoxGeometry(0.3, 0.1, 0.012),
    eye: new THREE.BoxGeometry(0.17, 0.016, 0.006),
    edge: new THREE.BoxGeometry(0.28, 0.008, 0.008),
    blade: new THREE.CylinderGeometry(0.036, 0.018, 0.34, 4).scale(1, 1, 1.7),
    mark: new THREE.PlaneGeometry(0.13, 0.13),
  };
}

/** Where the arms hang from, and how far out they lean (rad about z). */
const ARM_X = 0.245;
const ARM_TILT = 0.12;

/** `geo` moved by `m`, with every vertex bound wholly to bone `bone`. */
function boneBaked(geo: THREE.BufferGeometry, m: THREE.Matrix4, bone: number): THREE.BufferGeometry {
  const g = geo.clone().applyMatrix4(m);
  const n = g.attributes.position.count;
  const index = new Uint16Array(n * 4);
  const weight = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    index[i * 4] = bone;
    weight[i * 4] = 1;
  }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(index, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weight, 4));
  return g;
}

const at = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);

let shellGeo: THREE.BufferGeometry | null = null;
/** The shell's parts in the figure's own space, bone 0 the figure and bones 1 and 2 the arm pivots. Shared by every unit. */
function shellGeometry(s: ReturnType<typeof makeShapes>): THREE.BufferGeometry {
  if (shellGeo) return shellGeo;
  const arm = (side: number, bone: number) =>
    boneBaked(s.blade, new THREE.Matrix4().makeTranslation(side * ARM_X, UNIT.shoulder, 0).multiply(new THREE.Matrix4().makeRotationZ(side * ARM_TILT)).multiply(at(0, -0.17, 0)), bone);
  const parts = [
    boneBaked(s.column, at(0, UNIT.hover + 0.2, 0), 0),
    boneBaked(s.torso, at(0, 0.72, 0), 0),
    boneBaked(s.head, at(0, UNIT.head, 0), 0),
    boneBaked(s.crown, at(0, UNIT.top - 0.015, -0.01), 0),
    arm(-1, 1),
    arm(1, 2),
  ];
  shellGeo = mergeGeometries(parts, false)!;
  for (const g of parts) g.dispose();
  shellGeo.computeBoundingSphere();
  return shellGeo;
}

let steelGeo: THREE.BufferGeometry | null = null;
/** The disc under the column and the neck, as one. */
function steelGeometry(s: ReturnType<typeof makeShapes>): THREE.BufferGeometry {
  if (steelGeo) return steelGeo;
  const parts = [s.disc.clone().applyMatrix4(at(0, UNIT.hover + 0.025, 0)), s.neck.clone().applyMatrix4(at(0, 1.065, 0))];
  steelGeo = mergeGeometries(parts, false)!;
  for (const g of parts) g.dispose();
  return steelGeo;
}

let lightsGeo: THREE.BufferGeometry | null = null;
/**
 * The unit's lights as one: the band round its chest (0), the visor (1), the lit hairline on the head
 * plate (2) and the eye stripe across the visor (3), each vertex tagged with which it is (the `part`
 * attribute). The visor is a dark glass plate with a glint along its top; the eye stripe is its face,
 * lit in the band's colour, so a unit looks at its work and at you.
 */
function lightsGeometry(s: ReturnType<typeof makeShapes>): THREE.BufferGeometry {
  if (lightsGeo) return lightsGeo;
  const tagged = (geo: THREE.BufferGeometry, m: THREE.Matrix4, part: number) => {
    const g = geo.clone().applyMatrix4(m);
    g.setAttribute('part', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(part), 1));
    return g;
  };
  const parts = [tagged(s.band, at(0, UNIT.band, 0), 0), tagged(s.visor, at(0, UNIT.head + 0.005, 0.131), 1), tagged(s.edge, at(0, UNIT.top - 0.001, 0.1), 2), tagged(s.eye, at(-0.02, UNIT.head + 0.008, 0.139), 3)];
  lightsGeo = mergeGeometries(parts, false)!;
  for (const g of parts) g.dispose();
  return lightsGeo;
}

/**
 * The material the lights are drawn with: unlit, each part in its own colour, read live from `band`,
 * `visor` and `edge` (so setting `band.color` repaints the band as before). One program for every unit.
 */
function lightsMaterial(band: THREE.Color, visor: THREE.Color, edge: THREE.Color): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ toneMapped: false, side: THREE.DoubleSide, fog: false });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uBand = { value: band };
    shader.uniforms.uVisor = { value: visor };
    shader.uniforms.uEdge = { value: edge };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', 'attribute float part;\nvarying float vPart;\nvarying float vLocalY;\n#include <common>')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vPart = part;\n  vLocalY = position.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', 'uniform vec3 uBand;\nuniform vec3 uVisor;\nuniform vec3 uEdge;\nvarying float vPart;\nvarying float vLocalY;\n#include <common>')
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec3 visorGlass = uVisor + vec3(0.07, 0.09, 0.11) * smoothstep(${(UNIT.head + 0.03).toFixed(3)}, ${(UNIT.head + 0.052).toFixed(3)}, vLocalY);
  vec3 eye = mix(uBand, vec3(1.0), 0.3) * 1.15 + uVisor * 0.5;
  vec4 diffuseColor = vec4( vPart < 0.5 ? uBand : ( vPart < 1.5 ? visorGlass : ( vPart < 2.5 ? uEdge : eye ) ), opacity );`,
      );
  };
  m.customProgramCacheKey = () => 'unit-lights-eye';
  return m;
}

export interface UnitBody {
  /** Everything that moves as the figure: leans, slumps and turns. */
  figure: THREE.Group;
  /** The shell's meshes, to swap between tones (see Shell). */
  shell: THREE.Mesh[];
  /** The chest band: its color is the unit's state. Only its colour is read (the lights are one mesh). */
  band: THREE.MeshBasicMaterial;
  /** The visor strip: dark, flickering with the unit's terminal output. Only its colour is read. */
  visor: THREE.MeshBasicMaterial;
  /** The glow under the hover base. */
  under: THREE.MeshBasicMaterial;
  stripe: THREE.MeshStandardMaterial;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  /** The provider's letters on the visor (see setGlyph). */
  glyphAt: THREE.Group;
  /** Its small parts, left out from far off (Quality's detail range): the steel, the stripe, the chest mark and the letters. */
  details: THREE.Object3D[];
}

/** A unit's body, in neutral steel until its state and provider are set. */
export function buildUnit(): UnitBody {
  shapes ??= makeShapes();
  const s = shapes;
  const figure = new THREE.Group();
  const shell: THREE.Mesh[] = [];
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, shadow = true) => {
    const m = mesh(geo, mat, x, y, z, shadow);
    figure.add(m);
    return m;
  };
  const body = SHELL('live');
  const steel = matte(DECK.steel, { metalness: 0.15, roughness: 0.7, flat: true });
  // The shell: the hover column, the torso, the head plate and its bevel, and both arm blades, one
  // skinned mesh. The figure itself is bone 0 and each arm's pivot a bone, so posture and gestures
  // turn the arms as before. It casts the figure's one shadow.
  const root = new THREE.Bone();
  const arm = (x: number) => {
    const pivot = new THREE.Bone();
    pivot.position.set(x, UNIT.shoulder, 0);
    pivot.rotation.z = Math.sign(x) * ARM_TILT;
    figure.add(pivot);
    return pivot;
  };
  figure.add(root);
  const armL = arm(-ARM_X);
  const armR = arm(ARM_X);
  const hull = new THREE.SkinnedMesh(shellGeometry(s), body);
  hull.castShadow = true;
  hull.receiveShadow = true;
  figure.add(hull);
  figure.updateMatrixWorld(true);
  hull.bind(new THREE.Skeleton([root, armL, armR]));
  shell.push(hull);
  // The hover base's disc and the neck in one, the glow under the base, and the gap below. The small
  // parts inside the shell's shadow cast none of their own: a shadow draw each, for nothing anyone could see.
  const steelMesh = add(steelGeometry(s), steel, 0, 0, 0, false);
  const under = new THREE.MeshBasicMaterial({ color: DECK.working, toneMapped: false, transparent: true, opacity: 0.55, depthWrite: false });
  add(s.glow, under, 0, UNIT.hover - 0.002, 0, false);
  // The band round its chest, the visor and the lit hairline along the head plate's top front edge
  // (it holds the silhouette against the slate): one mesh, each part in its own colour.
  const band = new THREE.MeshBasicMaterial({ color: DECK.working });
  const visor = new THREE.MeshBasicMaterial({ color: '#0E151C' });
  const lit = lightsMaterial(band.color, visor.color, practical(DECK.steel).color);
  add(lightsGeometry(s), lit, 0, 0, 0, false);
  lights.set(band, lit);
  // The provider stripe down its back.
  const stripe = matte(DECK.muted, { flat: true }).clone();
  const stripeMesh = add(s.stripe, stripe, 0, 0.72, -0.155, false);
  // The Formation mark on the chest plate, above the band.
  const mark = new THREE.MeshBasicMaterial({ map: chestMark(), transparent: true, toneMapped: false, depthWrite: false });
  const markMesh = add(s.mark, mark, 0, 0.905, 0.148, false);
  const glyphAt = new THREE.Group();
  glyphAt.position.set(0.112, UNIT.head - 0.02, 0.139);
  figure.add(glyphAt);
  return { figure, shell, band, visor, under, stripe, armL, armR, glyphAt, details: [steelMesh, stripeMesh, markMesh, glyphAt] };
}

/** The shared shell and lights geometries, for tests/unit-body.test.ts. */
export function unitGeometries(): { shell: THREE.BufferGeometry; lights: THREE.BufferGeometry; steel: THREE.BufferGeometry } {
  shapes ??= makeShapes();
  return { shell: shellGeometry(shapes), lights: lightsGeometry(shapes), steel: steelGeometry(shapes) };
}

/** Each unit's lights material, by its band (what worker.ts holds), to dispose of with it. */
const lights = new WeakMap<THREE.Material, THREE.Material>();

/** Lets go of the unit's own materials (its band, visor, glow and stripe, and the lights drawn with them). */
export function disposeUnit(u: UnitBody) {
  lights.get(u.band)?.dispose();
  for (const m of [u.band, u.visor, u.under, u.stripe]) m.dispose();
}

/** Paints the shell in `tone`. */
export function paintShell(u: UnitBody, tone: Shell) {
  const m = SHELL(tone);
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
