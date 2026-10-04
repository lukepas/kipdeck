import * as THREE from 'three';
import { MISSION_TABLE } from '../../../shared/layout';
import { mesh, stretch } from '../toon';
import type { Fixture } from './fixture';
import { DECK, contactShadow, flat, matte, practical } from './materials';
import { drawMark } from './floorpaint';

// The mission table in the middle of the deck: a dark plinth, a lit edge, and a top that shows the
// floor's mission. Each milestone is a wedge (filled once it's done, ruled brighter while it's the one
// the team is on), with a tick ring at the rim for each, and the statement in the middle.

/** What the table shows: the mission's statement and its milestones, in order. */
export interface TableMission {
  statement: string;
  milestones: { title: string; done: boolean; active: boolean }[];
}

/** The top's drawing, pixels across. */
const PX = 1024;

const UI = (weight: number, size: number) => `${weight} ${size}px Archivo, system-ui, sans-serif`;
const MONO = (size: number) => `500 ${size}px "JetBrains Mono", ui-monospace, monospace`;

/** Cuts `text` with a dot until it fits `max` pixels. */
function fit(g: CanvasRenderingContext2D, text: string, max: number): string {
  let t = text;
  while (t.length > 3 && g.measureText(t).width > max) t = `${t.slice(0, -2).trimEnd()}.`;
  return t;
}

/** Wraps `text` into at most `lines` lines `max` pixels wide. */
function wrap(g: CanvasRenderingContext2D, text: string, max: number, lines: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (g.measureText(next).width <= max || !line) line = next;
    else {
      out.push(line);
      line = word;
    }
  }
  if (line) out.push(line);
  if (out.length > lines) {
    out.length = lines;
    out[lines - 1] = fit(g, `${out[lines - 1]}...`, max);
  }
  return out.map((l) => fit(g, l, max));
}

function paintTop(g: CanvasRenderingContext2D, m: TableMission) {
  const c = PX / 2;
  const R = c - 6;
  g.clearRect(0, 0, PX, PX);
  // The glass: a faint wash, darker toward the middle.
  const wash = g.createRadialGradient(c, c, R * 0.2, c, c, R);
  wash.addColorStop(0, 'rgba(201,210,220,0.10)');
  wash.addColorStop(0.7, 'rgba(201,210,220,0.05)');
  wash.addColorStop(1, 'rgba(174,184,196,0.28)');
  g.fillStyle = wash;
  g.beginPath();
  g.arc(c, c, R, 0, Math.PI * 2);
  g.fill();
  const inner = R * 0.36;
  const n = m.milestones.length;
  // North (up the canvas) is the north of the deck: the first milestone starts there, and they go round clockwise.
  const start = -Math.PI / 2;
  const step = n ? (Math.PI * 2) / n : 0;
  m.milestones.forEach((ms, i) => {
    const a0 = start + i * step;
    const a1 = a0 + step;
    g.beginPath();
    g.arc(c, c, R * 0.86, a0, a1);
    g.arc(c, c, inner, a1, a0, true);
    g.closePath();
    g.fillStyle = ms.done ? 'rgba(201,210,220,0.22)' : ms.active ? 'rgba(201,210,220,0.08)' : 'rgba(201,210,220,0.03)';
    g.fill();
    if (ms.active) {
      g.strokeStyle = DECK.working;
      g.lineWidth = 4;
      g.stroke();
    }
    // Its tick on the rim: solid once done, an outline until then.
    const mid = (a0 + a1) / 2;
    g.beginPath();
    g.arc(c, c, R * 0.93, mid - Math.min(0.12, step * 0.3), mid + Math.min(0.12, step * 0.3));
    g.lineWidth = ms.done ? 18 : 4;
    g.strokeStyle = ms.done ? DECK.working : DECK.steel;
    g.stroke();
    // Its title, upright, in the wedge.
    const tr = (R * 0.86 + inner) / 2;
    g.save();
    g.translate(c + Math.cos(mid) * tr, c + Math.sin(mid) * tr);
    g.fillStyle = ms.done || ms.active ? DECK.text : DECK.muted;
    g.font = UI(600, n > 6 ? 22 : 28);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const width = Math.min(260, 2 * tr * Math.sin(Math.min(Math.PI / 2, step / 2)) - 24);
    const lines = wrap(g, ms.title, Math.max(80, width), 2);
    lines.forEach((l, k) => g.fillText(l, 0, (k - (lines.length - 1) / 2) * 30 - 10));
    g.font = MONO(18);
    g.fillStyle = DECK.muted;
    g.fillText(ms.done ? 'DONE' : ms.active ? 'ON NOW' : `M${i + 1}`, 0, (lines.length / 2) * 30 + 6);
    g.restore();
  });
  // The separators between wedges, and the rings.
  g.strokeStyle = DECK.steel;
  g.lineWidth = 2;
  for (let i = 0; i < n; i++) {
    const a = start + i * step;
    g.beginPath();
    g.moveTo(c + Math.cos(a) * inner, c + Math.sin(a) * inner);
    g.lineTo(c + Math.cos(a) * R * 0.86, c + Math.sin(a) * R * 0.86);
    g.stroke();
  }
  for (const r of [inner, R * 0.86, R * 0.995]) {
    g.beginPath();
    g.arc(c, c, r, 0, Math.PI * 2);
    g.stroke();
  }
  // The middle: the mark, and the statement.
  drawMark(g, c - 48, c - 118, 4, DECK.text, DECK.muted);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = DECK.muted;
  g.font = UI(700, 20);
  stretch(g, true);
  g.letterSpacing = '4px';
  g.fillText('MISSION', c, c + 6);
  g.letterSpacing = '0px';
  stretch(g, false);
  g.fillStyle = m.statement ? DECK.text : DECK.muted;
  g.font = UI(500, 24);
  const lines = wrap(g, m.statement || 'No mission set. Set one in Mission control.', inner * 1.6, 3);
  lines.forEach((l, k) => g.fillText(l, c, c + 44 + k * 30));
}

/** The mission table: say what it shows with setMission(). */
export interface MissionTable {
  setMission(m: TableMission): void;
}

declare module '../types' {
  interface OfficeHandles {
    /** The mission table in the middle of the deck. */
    missionTable: MissionTable;
  }
}

/** The mission table, with its plinth, its lit edge and its top. */
export const missionTable: Fixture<'missionTable'> = (site) => {
  const { x, z, r, h } = MISSION_TABLE;
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.add(mesh(new THREE.CylinderGeometry(r * 0.72, r * 0.8, h - 0.12, 32), flat(DECK.wall), 0, (h - 0.12) / 2, 0));
  group.add(mesh(new THREE.CylinderGeometry(r * 0.82, r * 0.82, 0.04, 32), matte(DECK.wallReveal), 0, 0.02, 0, false));
  group.add(mesh(new THREE.CylinderGeometry(r, r * 0.96, 0.12, 64), flat(DECK.console), 0, h - 0.06, 0));
  // The lit edge: what carries the table's silhouette in a dark frame.
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.016, 6, 128), practical('#AEB8C4'));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = h;
  group.add(rim);
  group.add(contactShadow(r * 2.6, r * 2.6));

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = PX;
  const g = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const top = new THREE.Mesh(new THREE.CircleGeometry(r * 0.985, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false }));
  top.position.y = h + 0.003;
  top.renderOrder = 2;
  group.add(top);
  site.group.add(group);
  site.colliders.push({ minX: x - r * 0.75, maxX: x + r * 0.75, minZ: z - r * 0.75, maxZ: z + r * 0.75, top: h, fence: true });

  let shown: TableMission = { statement: '', milestones: [] };
  const setMission = (m: TableMission) => {
    shown = m;
    paintTop(g, shown);
    tex.needsUpdate = true;
  };
  setMission(shown);
  return { handle: { missionTable: { setMission } } };
};
