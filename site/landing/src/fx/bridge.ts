// The Bridge, in three.js: a lazy chunk the Labs tile loads only once its CSS deck has settled, on a
// device with memory to spare. A wireframe deck seen from above: five consoles on an arc facing the
// captain's ring, a viewscreen arc ahead, and a unit seated at each console in its status glyph
// (an octahedron for needs you, in Signal with a beam; a ring for to review; a steel bar for
// working). Lines and flat colors only: no lights, no textures. The camera drifts slowly round and
// leans toward the pointer; it renders only while the tile is on screen.
import {
  BoxGeometry, BufferGeometry, Color, CylinderGeometry, EdgesGeometry, Float32BufferAttribute, Group, Line, LineBasicMaterial,
  LineSegments, Mesh, MeshBasicMaterial, OctahedronGeometry, PerspectiveCamera, Scene, TorusGeometry, WebGLRenderer,
} from 'three';
import { rgbOf } from '../engine/env';

const STATIONS: { status: 'needs' | 'review' | 'working'; angle: number }[] = [
  { status: 'working', angle: -64 },
  { status: 'review', angle: -32 },
  { status: 'needs', angle: 0 },
  { status: 'working', angle: 32 },
  { status: 'working', angle: 64 },
];

export function mountBridge(host: HTMLElement) {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  host.append(canvas);
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  const scene = new Scene();
  const camera = new PerspectiveCamera(32, 1, 0.1, 100);
  const c = (name: string, fallback: string) => {
    const f = new Color(fallback);
    return new Color(...rgbOf(name, [f.r, f.g, f.b]));
  };
  const ship = c('--ship', '#6fc3df'), dim = c('--ship-dim', '#2c5e70'), signal = c('--signal', '#ff6a1a');
  const review = c('--review', '#f5c542'), steel = c('--working', '#c9d2dc');
  const lines = (geo: BufferGeometry, color: Color, opacity = 1) =>
    new LineSegments(new EdgesGeometry(geo), new LineBasicMaterial({ color, transparent: opacity < 1, opacity }));

  const deck = new Group();
  scene.add(deck);
  // The floor: rings and spokes.
  for (const r of [1.2, 2.4, 3.6, 4.4]) {
    const pts: number[] = [];
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      pts.push(Math.cos(a) * r, 0, Math.sin(a) * r);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pts, 3));
    deck.add(new Line(g, new LineBasicMaterial({ color: r === 4.4 ? ship : dim, transparent: true, opacity: r === 4.4 ? 0.8 : 0.5 })));
  }
  const spokes: number[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    spokes.push(Math.cos(a) * 1.2, 0, Math.sin(a) * 1.2, Math.cos(a) * 4.4, 0, Math.sin(a) * 4.4);
  }
  const sg = new BufferGeometry();
  sg.setAttribute('position', new Float32BufferAttribute(spokes, 3));
  deck.add(new LineSegments(sg, new LineBasicMaterial({ color: dim, transparent: true, opacity: 0.35 })));
  // The captain's ring and the viewscreen.
  const chair = lines(new CylinderGeometry(0.45, 0.45, 0.3, 24, 1, true), ship);
  chair.position.y = 0.15;
  deck.add(chair);
  const arc: number[] = [];
  for (let i = 0; i <= 40; i++) {
    const a = (-60 + (i / 40) * 120) * (Math.PI / 180);
    arc.push(Math.sin(a) * 5.2, 1.6, -Math.cos(a) * 5.2);
  }
  const ag = new BufferGeometry();
  ag.setAttribute('position', new Float32BufferAttribute(arc, 3));
  deck.add(new Line(ag, new LineBasicMaterial({ color: ship })));

  // Consoles and their units.
  const spin: Mesh[] = [];
  let beam: LineSegments | null = null;
  let bob: Mesh | null = null;
  for (const s of STATIONS) {
    const a = s.angle * (Math.PI / 180);
    const station = new Group();
    station.position.set(Math.sin(a) * 3, 0, -Math.cos(a) * 3);
    station.rotation.y = -a;
    const desk = lines(new BoxGeometry(1.3, 0.5, 0.6), ship);
    desk.position.y = 0.25;
    station.add(desk);
    const color = s.status === 'needs' ? signal : s.status === 'review' ? review : steel;
    const geo = s.status === 'needs' ? new OctahedronGeometry(0.22) : s.status === 'review' ? new TorusGeometry(0.17, 0.045, 8, 24) : new BoxGeometry(0.42, 0.09, 0.09);
    const unit = new Mesh(geo, new MeshBasicMaterial({ color }));
    unit.position.set(0, 0.95, 0.55);
    station.add(unit);
    spin.push(unit);
    if (s.status === 'needs') {
      bob = unit;
      const bg = new BufferGeometry();
      bg.setAttribute('position', new Float32BufferAttribute([0, 1.2, 0.55, 0, 3.2, 0.55], 3));
      beam = new LineSegments(bg, new LineBasicMaterial({ color: signal, transparent: true, opacity: 0.6 }));
      station.add(beam);
    }
    deck.add(station);
  }

  function size() {
    const r = host.getBoundingClientRect();
    renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
    camera.aspect = r.width / Math.max(1, r.height);
    camera.updateProjectionMatrix();
  }
  size();
  new ResizeObserver(size).observe(host);

  let px = 0, py = 0;
  host.addEventListener('pointermove', (e) => {
    const r = host.getBoundingClientRect();
    px = (e.clientX - r.left) / r.width - 0.5;
    py = (e.clientY - r.top) / r.height - 0.5;
  }, { passive: true });

  let raf = 0;
  let visible = true;
  const t0 = performance.now();
  const frame = (now: number) => {
    raf = 0;
    const t = (now - t0) / 1000;
    const orbit = -0.6 + Math.sin(t * 0.12) * 0.35 + px * 0.4;
    camera.position.set(Math.sin(orbit) * 8.8, 6.2 - py * 1.5, Math.cos(orbit) * 8.8);
    camera.lookAt(0, 0.4, -0.6);
    spin.forEach((m, i) => (m.rotation.y = t * (0.8 + i * 0.1)));
    if (bob) bob.position.y = 0.95 + Math.sin(t * 3) * 0.06;
    if (beam) (beam.material as LineBasicMaterial).opacity = 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(t * 4));
    renderer.render(scene, camera);
    if (visible && !document.hidden) raf = requestAnimationFrame(frame);
  };
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !raf) raf = requestAnimationFrame(frame);
  }).observe(host);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && visible && !raf) raf = requestAnimationFrame(frame);
  });
  raf = requestAnimationFrame((now) => {
    frame(now);
    host.classList.add('gl');
  });
}
