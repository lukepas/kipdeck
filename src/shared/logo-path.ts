// The logo's SVG paths (shared/logo.ts) as plain geometry, for the places that draw it without SVG
// or a canvas: the /pom/ share card's raster, and the landing page's March, whose units fall into rank
// along Kip's outline. Handles the commands the logo uses (M L H V C Q A Z, absolute and relative).

export type Pt = [number, number];

const TOKEN = /[MLHVCQAZmlhvcqaz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g;

/** Points along an elliptical arc, from SVG's endpoint form (SVG 1.1, F.6.5). */
function arc(x1: number, y1: number, rx: number, ry: number, deg: number, large: boolean, sweep: boolean, x2: number, y2: number, step: number): Pt[] {
  const phi = (deg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const xp = cos * dx + sin * dy;
  const yp = -sin * dx + cos * dy;
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const lambda = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
  const den = rx * rx * yp * yp + ry * ry * xp * xp;
  const co = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (co * rx * yp) / ry;
  const cyp = (-co * ry * xp) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const ux = (xp - cxp) / rx;
  const uy = (yp - cyp) / ry;
  const t1 = angle(1, 0, ux, uy);
  let dt = angle(ux, uy, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(4, Math.ceil((Math.abs(dt) * Math.max(rx, ry)) / step));
  const out: Pt[] = [];
  for (let i = 1; i <= n; i++) {
    const t = t1 + (dt * i) / n;
    out.push([cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos]);
  }
  return out;
}

/** A path as closed polygons, one a subpath, with curves cut into pieces about `step` long. */
export function flatten(d: string, step = 0.4): Pt[][] {
  const t = d.match(TOKEN) ?? [];
  const polys: Pt[][] = [];
  let poly: Pt[] = [];
  let x = 0;
  let y = 0;
  let i = 0;
  let cmd = '';
  const num = () => Number(t[i++]);
  const close = () => {
    if (poly.length > 1) polys.push(poly);
    poly = [];
  };
  while (i < t.length) {
    if (/[a-z]/i.test(t[i])) cmd = t[i++];
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case 'M':
        close();
        x = ox + num();
        y = oy + num();
        poly.push([x, y]);
        cmd = rel ? 'l' : 'L';
        break;
      case 'L':
        x = ox + num();
        y = oy + num();
        poly.push([x, y]);
        break;
      case 'H':
        x = ox + num();
        poly.push([x, y]);
        break;
      case 'V':
        y = oy + num();
        poly.push([x, y]);
        break;
      case 'C':
      case 'Q': {
        const cubic = cmd.toUpperCase() === 'C';
        const p = Array.from({ length: cubic ? 6 : 4 }, (_, k) => (k % 2 ? oy : ox) + num());
        const [x0, y0] = [x, y];
        const n = Math.max(4, Math.ceil(Math.hypot(p[p.length - 2] - x0, p[p.length - 1] - y0) / step));
        for (let k = 1; k <= n; k++) {
          const s = k / n;
          const r = 1 - s;
          poly.push(
            cubic
              ? [r * r * r * x0 + 3 * r * r * s * p[0] + 3 * r * s * s * p[2] + s * s * s * p[4], r * r * r * y0 + 3 * r * r * s * p[1] + 3 * r * s * s * p[3] + s * s * s * p[5]]
              : [r * r * x0 + 2 * r * s * p[0] + s * s * p[2], r * r * y0 + 2 * r * s * p[1] + s * s * p[3]],
          );
        }
        [x, y] = [p[p.length - 2], p[p.length - 1]];
        break;
      }
      case 'A': {
        const [rx, ry, rot, large, sweep] = [num(), num(), num(), num(), num()];
        const nx = ox + num();
        const ny = oy + num();
        poly.push(...arc(x, y, rx, ry, rot, !!large, !!sweep, nx, ny, step));
        [x, y] = [nx, ny];
        break;
      }
      case 'Z':
        if (poly.length) [x, y] = poly[0];
        close();
        poly.push([x, y]);
        break;
      default:
        i++;
    }
  }
  close();
  return polys;
}

/** Whether (x, y) is inside the polygons by the nonzero rule, as SVG fills them. */
export function inside(polys: Pt[][], x: number, y: number): boolean {
  let wind = 0;
  for (const p of polys) {
    for (let k = 0; k < p.length; k++) {
      const [ax, ay] = p[k];
      const [bx, by] = p[(k + 1) % p.length];
      const side = (bx - ax) * (y - ay) - (x - ax) * (by - ay);
      if (ay <= y && by > y && side > 0) wind++;
      else if (ay > y && by <= y && side < 0) wind--;
    }
  }
  return wind !== 0;
}

/** `n` points spaced evenly along every outline of the polygons. */
export function alongOutline(polys: Pt[][], n: number): Pt[] {
  const edges: [Pt, Pt, number][] = [];
  for (const p of polys) for (let k = 0; k < p.length; k++) edges.push([p[k], p[(k + 1) % p.length], Math.hypot(p[(k + 1) % p.length][0] - p[k][0], p[(k + 1) % p.length][1] - p[k][1])]);
  const total = edges.reduce((s, e) => s + e[2], 0);
  const out: Pt[] = [];
  let at = 0;
  let walked = 0;
  for (const [a, b, len] of edges) {
    while (out.length < n && at <= walked + len) {
      const f = len ? (at - walked) / len : 0;
      out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
      at += total / n;
    }
    walked += len;
  }
  return out;
}
