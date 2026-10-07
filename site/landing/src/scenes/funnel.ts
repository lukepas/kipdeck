// 02 The funnel: every vendor, one list. Five streams of agent units leave the five vendor chips
// (Claude Code, Codex, Cursor, OpenCode, Pi) and flow to the inbox card. As the visitor scrolls they
// leave their streams, spiral into a vortex around the card, and collapse into its rows: the units
// bound for a row that waits on you turn Signal on the way. The canvas then hands over to the real
// DOM card. Each row's branch writes itself in ("each on its own branch"), and last the rows leave
// the order a vendor's dashboard would list them in (by vendor) for the one this inbox uses: whoever
// has waited on you longest, on top, with the section headings sliding in and the wait bars filling.
//
// The three sentences of the heading light up with the three beats. Pinned on wide screens; on a
// phone it plays once in time as the card comes into view.
import { drive, ease, span, setter, lerp } from '../engine/drive';
import { tier, token, env } from '../engine/env';
import { stackOffsets } from '../engine/stack';

const VENDORS = ['CC', 'Cx', 'Cu', 'OC', 'Pi'];

export function mountFunnel(section: HTMLElement) {
  const track = section.querySelector<HTMLElement>('.track')!;
  const canvas = section.querySelector<HTMLCanvasElement>('canvas.swarm')!;
  const card = section.querySelector<HTMLElement>('.app.ranked')!;
  const list = card.querySelector<HTMLElement>('.ranked-list')!;
  const items = [...list.children] as HTMLElement[];
  const rows = items.filter((el) => el.classList.contains('row'));
  const heads = items.filter((el) => el.classList.contains('sec'));
  const chips = [...section.querySelectorAll<HTMLElement>('.vendors li')];
  const beats = [...section.querySelectorAll<HTMLElement>('h2 .beat')];
  const branches = rows.map((r) => r.querySelector<HTMLElement>('.branch'));
  const bars = rows.map((r) => r.querySelector<HTMLElement>('.waitbar > i'));
  const barTo = rows.map((r) => {
    const m = /w-(\d+)/.exec(r.querySelector('.waitbar')?.className ?? '');
    return m ? Number(m[1]) / 100 : 0;
  });
  const rowSign = rows.map((r) => r.querySelector('.sign')?.textContent?.trim() ?? '');
  const rowNeeds = rows.map((r) => r.classList.contains('needs'));
  const set = setter();

  // The order a single vendor's dashboard would show: by vendor, then title.
  const byVendor = [...rows].sort((a, b) => {
    const va = VENDORS.indexOf(rowSign[rows.indexOf(a)]), vb = VENDORS.indexOf(rowSign[rows.indexOf(b)]);
    return va - vb || rows.indexOf(a) - rows.indexOf(b);
  });
  let shuffled = new Map<HTMLElement, number>();
  const measure = () => {
    shuffled = stackOffsets(items, [heads[0], ...byVendor]);
  };
  measure();
  new ResizeObserver(measure).observe(list);

  // ---- The units.
  const N = tier === 'full' ? 440 : 170;
  const ctx = canvas.getContext('2d')!;
  const uv = new Uint8Array(N); // vendor
  const ur = new Uint8Array(N); // target row
  const uz = new Uint8Array(N); // depth
  const uph = new Float32Array(N); // phase along the stream
  const usp = new Float32Array(N); // speed
  const ulane = new Float32Array(N); // offset across the stream
  const uslot = new Float32Array(N); // place along its row
  const uang = new Float32Array(N); // angle in the vortex
  const urad = new Float32Array(N); // radius factor in the vortex
  const hx = new Float32Array(N), hy = new Float32Array(N); // heading
  const lx = new Float32Array(N), ly = new Float32Array(N); // last position
  let s = 4242;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const rowsOf = VENDORS.map((v) => rows.map((_, i) => i).filter((i) => rowSign[i] === v));
  for (let i = 0; i < N; i++) {
    const v = i % 5;
    uv[i] = v;
    const pool = rowsOf[v].length ? rowsOf[v] : [0];
    ur[i] = pool[Math.floor(rnd() * pool.length)];
    uz[i] = rnd() < 0.45 ? 0 : rnd() < 0.6 ? 1 : 2;
    uph[i] = rnd();
    usp[i] = 0.09 + rnd() * 0.08;
    ulane[i] = (rnd() - 0.5) * 2;
    uslot[i] = rnd();
    uang[i] = rnd() * Math.PI * 2;
    urad[i] = 0.55 + rnd() * 0.6;
    lx[i] = ly[i] = -1;
  }

  let w = 0, h = 0, dpr = 1;
  let colors = { unit: '', signal: '' };
  const readColors = () => (colors = { unit: token('--working') || '#c9d2dc', signal: token('--signal') || '#ff6a1a' });
  readColors();
  new MutationObserver(readColors).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, env.phone ? 1.25 : 1.5);
    w = Math.max(1, Math.round(r.width));
    h = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  resize();
  new ResizeObserver(resize).observe(canvas);

  // Rects in canvas coordinates, read once per frame.
  type R = { x: number; y: number; w: number; h: number };
  const rect = (el: Element, o: DOMRect): R => {
    const r = el.getBoundingClientRect();
    return { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height };
  };

  let cardR: R = { x: 0, y: 0, w: 0, h: 0 };
  let listR0: R | null = null;
  let chipR0: R[] = [];
  let rowR0: R[] = [];
  let reading = true;
  function readRects() {
    const o = canvas.getBoundingClientRect();
    cardR = rect(card, o);
    listR0 = rect(list, o);
    chipR0 = chips.map((c) => rect(c, o));
    rowR0 = rows.map((r) => rect(r, o));
  }

  let t = 0;
  let canvasOn = true;
  const xs = new Float32Array(N), ys = new Float32Array(N);

  function frame(p: number, dt: number) {
    t += dt;
    // Beats of the heading.
    const beat = p < 0.3 ? 0 : p < 0.8 ? 1 : 2;
    beats.forEach((b, i) => b.classList.toggle('lit', i <= beat));

    const vortex = ease(p, 0.26, 0.56);
    const collapse = ease(p, 0.52, 0.68);
    const hand = ease(p, 0.64, 0.72); // canvas to DOM
    const rank = ease(p, 0.82, 0.98);

    // ---- The DOM card.
    set(card, '--frame', ease(p, 0.08, 0.3).toFixed(3));
    rows.forEach((r, i) => {
      set(r, 'opacity', hand.toFixed(3));
      // Rows that climb pass on the right, rows that sink on the left, lifted while they move.
      const k = ease(rank, i * 0.04, 0.76 + i * 0.04);
      const off = shuffled.get(r) ?? 0;
      const side = Math.sin(k * Math.PI) * (off > 0 ? 18 : off < 0 ? -10 : 0);
      set(r, 'transform', `translate(${side.toFixed(1)}px, ${(off * (1 - k)).toFixed(1)}px)`);
      r.classList.toggle('moving', k > 0.02 && k < 0.98 && Math.abs(off) > 2);
      const b = branches[i];
      if (b) set(b, 'clipPath', `inset(0 ${(100 - 100 * span(p, 0.7 + i * 0.016, 0.78 + i * 0.016)).toFixed(1)}% 0 0)`);
      const bar = bars[i];
      if (bar) set(bar, '--w', (barTo[i] * ease(rank, 0.4, 1)).toFixed(3));
    });
    heads.forEach((hd, i) => {
      const k = ease(rank, 0.25 + i * 0.1, 0.65 + i * 0.1);
      set(hd, 'opacity', k.toFixed(3));
      set(hd, 'transform', `translateX(${(-16 * (1 - k)).toFixed(1)}px)`);
    });

    // ---- The canvas.
    const show = 1 - hand;
    if (show <= 0.001) {
      if (canvasOn) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvasOn = false;
      }
      return;
    }
    canvasOn = true;
    if (!listR0) readRects();
    const listR = listR0!, chipR = chipR0, rowR = rowR0;
    const cx = cardR.x + cardR.w / 2, cy = listR.y + listR.h * 0.45;
    const maxR = Math.min(cardR.w, cardR.h) * 0.62;
    const mouthX = cardR.x + 10, mouthY = cy;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // In the vortex the units leave short trails (the last frames fade out rather than clear), so
    // the spin reads as motion even while the scroll holds still.
    const trail = vortex > 0.05 && collapse < 0.6 && tier === 'full';
    if (trail) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = `rgba(0,0,0,${(0.42 + collapse * 0.5).toFixed(2)})`;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    } else ctx.clearRect(0, 0, w, h);
    // The row slots the units are headed for, faint, so the card reads as a mouth with places in it.
    const slots = ease(p, 0.3, 0.5) * show;
    if (slots > 0.01) {
      ctx.strokeStyle = colors.unit;
      ctx.globalAlpha = 0.16 * slots;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      for (const r of rowR) ctx.rect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const stackedNow = cardR.y > (chipR[0]?.y ?? 0);
    const copyRight = chipR.reduce((m, c) => Math.max(m, c.x + c.w), 0) + 12;
    for (let i = 0; i < N; i++) {
      const v = uv[i];
      const c = chipR[v] ?? chipR[0];
      // The stream: from the vendor's chip to the card's mouth, a smooth S (sideways on a wide
      // screen, downward where the card sits under the copy).
      const f = (uph[i] + t * usp[i]) % 1;
      const sx = c.x + c.w / 2, sy = c.y + c.h / 2;
      const stacked = cardR.y > sy + 40;
      const ex = stacked ? cx + ulane[i] * cardR.w * 0.36 : mouthX;
      const ey = stacked ? cardR.y + 14 : mouthY + ulane[i] * cardR.h * 0.32;
      const c1x = stacked ? sx : lerp(sx, ex, 0.45), c1y = stacked ? lerp(sy, ey, 0.55) : sy + ulane[i] * 40;
      const c2x = stacked ? ex : lerp(sx, ex, 0.55), c2y = stacked ? lerp(sy, ey, 0.45) : ey;
      const m = 1 - f;
      let x = m * m * m * sx + 3 * m * m * f * c1x + 3 * m * f * f * c2x + f * f * f * ex;
      let y = m * m * m * sy + 3 * m * m * f * c1y + 3 * m * f * f * c2y + f * f * f * ey;
      // The vortex around the card.
      if (vortex > 0) {
        // A spiral: inner units turn faster, the arms wind as it tightens.
        const rr = maxR * urad[i] * lerp(1.05, 0.5, vortex);
        const a = uang[i] + t * (0.5 + uz[i] * 0.2) * (1 + vortex * 1.6) * (maxR / Math.max(40, rr)) * 0.6 + vortex * 4 - (rr / maxR) * 2.4;
        x = lerp(x, cx + Math.cos(a) * rr, vortex);
        y = lerp(y, cy + Math.sin(a) * rr * 0.62, vortex);
      }
      // Into the row it belongs to.
      if (collapse > 0) {
        const rr = rowR[ur[i]];
        const tx = rr.x + 24 + uslot[i] * (rr.w - 48);
        const ty = rr.y + rr.h / 2 + ulane[i] * rr.h * 0.22;
        const k = ease(collapse, uslot[i] * 0.3, 0.7 + uslot[i] * 0.3);
        x = lerp(x, tx, k);
        y = lerp(y, ty, k);
      }
      // Heading: along the motion, eased.
      if (lx[i] >= 0) {
        const dx = x - lx[i], dy = y - ly[i];
        const d = Math.hypot(dx, dy);
        if (d > 0.05) {
          hx[i] += (dx / d - hx[i]) * 0.3;
          hy[i] += (dy / d - hy[i]) * 0.3;
        }
      } else {
        hx[i] = 1;
        hy[i] = 0;
      }
      lx[i] = x;
      ly[i] = y;
      xs[i] = x;
      ys[i] = y;
    }
    // One path per depth and color.
    for (let z = 0; z < 3; z++) {
      for (let lit = 0; lit < 2; lit++) {
       for (let over = 0; over < 2; over++) {
        ctx.strokeStyle = lit ? colors.signal : colors.unit;
        // Units crossing the copy are dimmed so the words stay crisp.
        ctx.globalAlpha = Math.min(1, show * (0.34 + z * 0.24) * (lit ? 1.25 : 1) * (over ? 0.4 : 1));
        ctx.lineWidth = 1 + z * 0.4;
        const size = (2.8 + z * 1.6) * (1 + vortex * 0.45 * (1 - collapse));
        ctx.beginPath();
        for (let i = 0; i < N; i++) {
          if (uz[i] !== z) continue;
          if ((xs[i] < copyRight && !stackedNow ? 1 : 0) !== over) continue;
          const isLit = rowNeeds[ur[i]] && collapse > 0.35 + uslot[i] * 0.3 ? 1 : 0;
          if (isLit !== lit) continue;
          let ax = hx[i], ay = hy[i];
          const d = Math.hypot(ax, ay) || 1;
          ax /= d;
          ay /= d;
          const x = xs[i], y = ys[i];
          const bx = -ax * size, by = -ay * size, nx = -ay * size * 0.9, ny = ax * size * 0.9;
          ctx.moveTo(x + bx + nx, y + by + ny);
          ctx.lineTo(x, y);
          ctx.lineTo(x + bx - nx, y + by - ny);
        }
        ctx.stroke();
       }
      }
    }
    ctx.globalAlpha = 1;
  }

  drive(track, (p, dt) => {
    frame(p, dt);
    reading = p < 0.72;
  }, { fallback: 'play', playMs: 5600, always: true, read: () => reading && readRects() });
}
