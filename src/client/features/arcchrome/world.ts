import * as THREE from 'three';
import { ARC } from '../../../shared/amphitheater';
import { BOARDS, MACHINE_MONITOR, TV } from '../../../shared/layout';
import type { Fixture } from '../../world/office/fixture';
import { CHROME, CHROME_IDS, PULL, chromeBars, pullAt, type ChromeId, type PanelBox } from './logic';

// The situation arc's chrome: round every board's face a thin lit bezel and four corner brackets, in the
// colour of that board's most urgent state (ship-cyan dim with nothing waiting), so the arc reads as
// lit glass in a frame, never a black rectangle. While a board has someone who needs the captain (or
// someone stuck), a brighter run of light chases round its bezel. All of it is one instanced draw: a
// unit box per bar, each bar's place round its board's perimeter an attribute the chase reads.

declare module '../../world/types' {
  interface OfficeHandles {
    /** The bezels and corner brackets round the arc's boards (features/arcchrome). */
    arcChrome: ArcChrome;
  }
}

export interface ArcChrome {
  /** Fits board `id`'s chrome round its face where it stands now. */
  place(id: ChromeId, box: PanelBox): void;
  /** Colours board `id`'s chrome `hue` at `gain` of its full strength, with the chase round it at `chase` (0 none, 1 full). */
  paint(id: ChromeId, hue: THREE.ColorRepresentation, chase: number, gain?: number): void;
  /** Runs the chase on to `t` seconds (held still by whoever calls it), the idle edge-light chase at `idle` (0 none, 1 full). */
  step(t: number, idle?: number): void;
  /**
   * How far board `id`'s chrome is drawn (0 none, 1 whole): the take-the-conn build draws it round its
   * perimeter from the top left, a bright head at the drawing end (features/holoui).
   */
  build(id: ChromeId, k: number): void;
  /** Folds the whole arc's chrome flat toward each board's middle (0 open, 1 a line): the warp (features/holoui). */
  fold(k: number): void;
  /**
   * The pull toward waiting units off the sides of the view: chevrons past the arc's outer edge on each
   * side in `sides`, in its hue (null for none), stepping outward at `t` seconds (`moving` false holds them).
   */
  pull(sides: Readonly<Record<-1 | 1, THREE.ColorRepresentation | null>>, t: number, moving: boolean): void;
}

const VERT = /* glsl */ `
attribute vec3 aRun;
attribute vec2 aBoard;
uniform float uBuild[6];
uniform float uFold;
varying vec3 vColor;
varying float vS;
varying float vChase;
varying float vBuild;
void main() {
  // aRun: where the bar starts round its board's perimeter (0-1), how much of it the bar covers, and the board's chase.
  vS = aRun.x + (position.x + 0.5) * aRun.y;
  vChase = aRun.z;
  vColor = instanceColor;
  // aBoard: which board the bar is round, and that board's middle height (the warp folds toward it).
  vBuild = uBuild[int(aBoard.x + 0.5)];
  vec4 w = instanceMatrix * vec4(position, 1.0);
  w.y = aBoard.y + (w.y - aBoard.y) * (1.0 - 0.96 * uFold);
  gl_Position = projectionMatrix * modelViewMatrix * w;
}`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform float uIdle;
varying vec3 vColor;
varying float vS;
varying float vChase;
varying float vBuild;
void main() {
  // The take-the-conn build: drawn round the perimeter up to vBuild, a bright head at the drawing end.
  if (vBuild < 0.999 && vS > vBuild) discard;
  float head = vBuild < 0.999 ? exp(-max(vBuild - vS, 0.0) * 40.0) : 0.0;
  // Two heads of light half a lap apart, a lap every 3.2 s, each with a soft tail behind it.
  float d1 = fract(uTime / 3.2 - vS);
  float d2 = fract(uTime / 3.2 + 0.5 - vS);
  float run = exp(-d1 * 18.0) + exp(-d2 * 18.0);
  // The edge-light chase every board gets once every 6 s: one head, a lap in 1.5 s.
  float p = mod(uTime, 6.0) / 1.5;
  float idle = p < 1.0 ? exp(-fract(p - vS) * 14.0) : 0.0;
  vec3 c = vColor * (1.0 + vChase * run * 2.2 + uIdle * idle * 1.4) + vec3(0.55, 0.85, 1.0) * head * 1.4;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

/** The arc's boards as built: the wings' are moved as they fold (features/boards/fold.ts). */
const BUILT: Record<ChromeId, PanelBox> = {
  issues: BOARDS.issues,
  queue: BOARDS.queue,
  tv: TV,
  capacity: MACHINE_MONITOR,
  pulls: BOARDS.pulls,
  services: BOARDS.services,
};

export const arcChrome: Fixture<'arcChrome'> = (site) => {
  const per = chromeBars(BUILT.tv).length;
  const count = CHROME_IDS.length * per;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const run = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
  geo.setAttribute('aRun', run);
  const board = new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2);
  geo.setAttribute('aBoard', board);
  const builds = CHROME_IDS.map(() => 1);
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { uTime: { value: 0 }, uIdle: { value: 0 }, uBuild: { value: builds }, uFold: { value: 0 } }, fog: false });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.name = 'arc-chrome';
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const qz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const size = new THREE.Vector3();
  const c = new THREE.Color();
  const place = (id: ChromeId, box: PanelBox) => {
    const index = CHROME_IDS.indexOf(id);
    const base = index * per;
    chromeBars(box).forEach((b, i) => {
      board.setXY(base + i, index, box.y);
      // Turned to face the way the board does; an upright bar is a level one turned a quarter in the board's plane first.
      q.setFromAxisAngle(up, box.rotY);
      if (b.vertical) q.multiply(qz);
      m.compose(pos.set(b.x, b.y, b.z), q, size.set(b.len, b.thick, CHROME.depth));
      mesh.setMatrixAt(base + i, m);
      run.setXY(base + i, b.s0, b.ds);
    });
    mesh.instanceMatrix.needsUpdate = true;
    run.needsUpdate = true;
    board.needsUpdate = true;
  };
  const paint = (id: ChromeId, hue: THREE.ColorRepresentation, chase: number, gain = 1) => {
    const base = CHROME_IDS.indexOf(id) * per;
    c.set(hue);
    chromeBars(BUILT[id]).forEach((b, i) => {
      // The brackets brighter than the bezel: they're what reads first from the chair.
      mesh.setColorAt(base + i, c.clone().multiplyScalar(gain * (b.bracket ? CHROME.bracketGain : CHROME.bezelGain)));
      run.setZ(base + i, chase);
    });
    mesh.instanceColor!.needsUpdate = true;
    run.needsUpdate = true;
  };
  for (const id of CHROME_IDS) {
    place(id, BUILT[id]);
    paint(id, CHROME.idle, 0);
  }
  site.group.add(mesh);
  // The pull's chevrons: three a side, one draw. A chevron pointing +x, flat in the board's plane.
  const s = PULL.size;
  const chev = new THREE.Shape([new THREE.Vector2(-s * 0.35, s * 0.5), new THREE.Vector2(s * 0.15, s * 0.5), new THREE.Vector2(s * 0.5, 0), new THREE.Vector2(s * 0.15, -s * 0.5), new THREE.Vector2(-s * 0.35, -s * 0.5), new THREE.Vector2(0, 0)]);
  const chevrons = new THREE.InstancedMesh(new THREE.ShapeGeometry(chev), new THREE.MeshBasicMaterial({ fog: false, side: THREE.DoubleSide, transparent: true, depthWrite: false }), PULL.count * 2);
  chevrons.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(PULL.count * 2 * 3), 3);
  chevrons.frustumCulled = false;
  chevrons.count = 0;
  chevrons.visible = false;
  chevrons.renderOrder = 4;
  chevrons.name = 'arc-pull';
  site.group.add(chevrons);
  const wings: Record<-1 | 1, PanelBox> = { [-1]: BUILT.issues, [1]: BUILT.pulls } as Record<-1 | 1, PanelBox>;
  const flip = new THREE.Quaternion().setFromAxisAngle(up, Math.PI);
  const hueOf = new THREE.Color();
  const pull = (sides: Readonly<Record<-1 | 1, THREE.ColorRepresentation | null>>, t: number, moving: boolean) => {
    // Nothing to pull toward, as last frame: nothing to send.
    if (sides[-1] === null && sides[1] === null && chevrons.count === 0) return;
    let n = 0;
    for (const sd of [-1, 1] as const) {
      const hue = sides[sd];
      if (hue === null) continue;
      const color = hueOf.set(hue);
      for (let i = 0; i < PULL.count; i++) {
        // Each a little behind the one before, stepping out and fading as it goes.
        const k = moving ? (((t / PULL.period - i * 0.18) % 1) + 1) % 1 : 0.3;
        const p = pullAt(wings[sd], ARC.bottom, sd, i, k);
        q.setFromAxisAngle(up, p.rotY);
        if (sd < 0) q.multiply(flip);
        m.compose(pos.set(p.x, p.y, p.z), q, size.set(1, 1, 1));
        chevrons.setMatrixAt(n, m);
        chevrons.setColorAt(n, c.copy(color).multiplyScalar(1.5 * (moving ? 1 - k * 0.7 : 1)));
        n++;
      }
    }
    chevrons.count = n;
    chevrons.visible = n > 0;
    chevrons.instanceMatrix.needsUpdate = true;
    chevrons.instanceColor!.needsUpdate = true;
  };
  return {
    handle: {
      arcChrome: {
        place,
        paint,
        step: (t, idle = 0) => {
          mat.uniforms.uTime.value = t;
          mat.uniforms.uIdle.value = idle;
        },
        build: (id, k) => void (builds[CHROME_IDS.indexOf(id)] = Math.max(0, Math.min(1, k))),
        fold: (k) => void (mat.uniforms.uFold.value = Math.max(0, Math.min(1, k))),
        pull,
      },
    },
  };
};
