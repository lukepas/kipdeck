// The showcase's share card (og.png, 1200 x 630): a Mergeline title block on the deck's grid, with the
// Formation mark, the latest merge that shows the whole money path (its PR, its bounty in large type and
// the four steps with their short hashes), the totals and the credit, drawn in a 5 x 7 pixel font
// straight into a PNG. No browser, no canvas and no
// dependencies (node:zlib only), so the office can draw it on request and onchain/indexer's static
// export can draw it at build time, from the same public document the page shows.
import { UPSTREAM_CREDIT } from '../../shared/copy.js';
import { deflateSync } from 'node:zlib';
import { HARNESSES, type ShowcaseDoc } from '../../shared/showcase.js';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

// 5 x 7 glyphs, a row per string, '#' lit.
const GLYPHS: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '..#..', '.#...'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  "'": ['..#..', '..#..', '.#...', '.....', '.....', '.....', '.....'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '%': ['##..#', '##..#', '...#.', '..#..', '.#...', '#..##', '#..##'],
  '#': ['.#.#.', '.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.#.#.'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
};

type RGB = readonly [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
// The Mergeline tokens (src/client/styles/tokens.css), dark set.
const VOID = hex('#0d131a');
const SURFACE = hex('#141b23');
const GRID_MINOR = hex('#151c24');
const GRID_MAJOR = hex('#1c2530');
const LINE = hex('#26313d');
const LINE_STRONG = hex('#3a4756');
const TEXT = hex('#e8ecef');
const MUTED = hex('#8a97a5');
const FAINT = hex('#5f6c7a');
const PROOF = hex('#a68bff');
const SETTLED = hex('#3ddc97');

class Raster {
  readonly px: Buffer;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.px = Buffer.alloc(w * h * 3);
  }
  rect(x: number, y: number, w: number, h: number, c: RGB) {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.w, Math.floor(x + w));
    const y1 = Math.min(this.h, Math.floor(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const i = (yy * this.w + xx) * 3;
        this.px[i] = c[0];
        this.px[i + 1] = c[1];
        this.px[i + 2] = c[2];
      }
    }
  }
  /** A straight stroke `w` pixels wide, from (x0, y0) to (x1, y1). */
  line(x0: number, y0: number, x1: number, y1: number, w: number, c: RGB) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let i = 0; i <= n; i++) this.rect(x0 + ((x1 - x0) * i) / n - w / 2, y0 + ((y1 - y0) * i) / n - w / 2, w, w, c);
  }
  /** A 1-pixel ruled box (the title block's frame). */
  frame(x: number, y: number, w: number, h: number, c: RGB, t = 1) {
    this.rect(x, y, w, t, c);
    this.rect(x, y + h - t, w, t, c);
    this.rect(x, y, t, h, c);
    this.rect(x + w - t, y, t, h, c);
  }
  /** Text at pixel size `s`; returns its width. Characters the font lacks draw as spaces. */
  text(x: number, y: number, s: number, str: string, c: RGB): number {
    let cx = x;
    for (const ch of str.toUpperCase()) {
      const g = GLYPHS[ch] ?? GLYPHS[' '];
      for (let r = 0; r < 7; r++) for (let col = 0; col < 5; col++) if (g[r][col] === '#') this.rect(cx + col * s, y + r * s, s, s, c);
      cx += 6 * s;
    }
    return cx - x - s;
  }
}

export const textWidth = (str: string, s: number) => Math.max(0, str.length * 6 * s - s);

/** Fits `str` into `width` pixels at size `s`, cutting it with "..." when it's longer. */
function fit(str: string, s: number, width: number): string {
  const max = Math.floor((width + s) / (6 * s));
  return str.length <= max ? str : `${str.slice(0, Math.max(0, max - 3))}...`;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** An RGB raster as a PNG (8-bit, no filtering). */
export function encodePng(r: Raster): Buffer {
  const head = Buffer.alloc(13);
  head.writeUInt32BE(r.w, 0);
  head.writeUInt32BE(r.h, 4);
  head[8] = 8;
  head[9] = 2;
  const rows = Buffer.alloc((r.w * 3 + 1) * r.h);
  for (let y = 0; y < r.h; y++) r.px.copy(rows, y * (r.w * 3 + 1) + 1, y * r.w * 3, (y + 1) * r.w * 3);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', head), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** The Formation mark at (x, y), `s` pixels per unit of its 24 grid: the lead chevron violet, the trailing two light. */
function mark(r: Raster, x: number, y: number, s: number) {
  const chevron = (dy: number, w: number, c: RGB) => {
    r.line(x + 4 * s, y + (10 + dy) * s, x + 12 * s, y + (2 + dy) * s, w, c);
    r.line(x + 12 * s, y + (2 + dy) * s, x + 20 * s, y + (10 + dy) * s, w, c);
  };
  chevron(0, 4 * s, PROOF);
  chevron(7, 2.5 * s, TEXT);
  chevron(12, 2.5 * s, TEXT);
}

/** The hash at the end of an explorer link, as "0x55b5...7c3c". */
function shortHash(link: string | undefined): string {
  const m = /\/([^/?#]+)(?:\?[^#]*)?$/.exec(link ?? '');
  if (!m) return '';
  const h = m[1];
  return h.length > 13 ? `${h.slice(0, 6)}...${h.slice(-4)}` : h;
}

/** Whole tokens from base units, two places: "25.00". */
function amount(a: string, decimals: number): string {
  try {
    const v = BigInt(a);
    const base = 10n ** BigInt(decimals);
    const cents = ((v % base) * 100n) / base;
    return `${v / base}.${cents.toString().padStart(2, '0')}`;
  } catch {
    return '0.00';
  }
}

/** The share card for a showcase document. */
export function ogImage(doc: ShowcaseDoc): Buffer {
  const W = OG_WIDTH;
  const H = OG_HEIGHT;
  const r = new Raster(W, H);
  r.rect(0, 0, W, H, VOID);
  // The deck's grid: a line every 20 px, every fifth stronger.
  for (let x = 0; x < W; x += 20) r.rect(x, 0, 1, H, x % 100 ? GRID_MINOR : GRID_MAJOR);
  for (let y = 0; y < H; y += 20) r.rect(0, y, W, 1, y % 100 ? GRID_MINOR : GRID_MAJOR);

  // The title block.
  const X = 40;
  const Y = 40;
  const BW = W - 80;
  const BH = H - 80;
  r.rect(X, Y, BW, BH, SURFACE);
  r.frame(X, Y, BW, BH, LINE_STRONG, 2);
  const HEAD = Y + 108;
  const SIDE = X + BW - 320;
  const FOOT = Y + BH - 46;
  r.rect(X, HEAD, BW, 2, LINE_STRONG);
  r.rect(X, FOOT, BW, 1, LINE);
  r.rect(SIDE, HEAD, 1, FOOT - HEAD, LINE);

  // Head: the mark, the wordmark and the product, the networks on the right.
  mark(r, X + 28, Y + 20, 2.4);
  let cx = X + 112;
  cx += r.text(cx, Y + 34, 4, 'MERGE', TEXT);
  cx += r.text(cx, Y + 34, 4, 'LINE', MUTED) + 28;
  r.text(cx, Y + 34, 4, '/ PROOF OF MERGE', PROOF);
  const net = 'SOLANA DEVNET - BASE SEPOLIA';
  r.rect(X + BW - 28 - textWidth(net, 2) - 22, Y + 40, 10, 10, SETTLED);
  r.text(X + BW - 28 - textWidth(net, 2), Y + 40, 2, net, MUTED);
  r.text(X + 112, Y + 80, 2, "A person's merge is the only thing that pays an agent.", MUTED);

  // The latest merge that shows the whole path, else the latest merge.
  const merged = doc.events.filter((e) => e.outcome === 'merged');
  const e = merged.find((x) => !x.self && x.paid && x.links.attestation) ?? merged.find((x) => !x.self && x.links.attestation) ?? merged[0];
  const L = X + 32;
  const LW = SIDE - L - 32;
  if (e) {
    r.text(L, HEAD + 28, 2, 'LAST MERGE', FAINT);
    const label = (doc.agents.find((a) => a.agentId === e.agentId)?.label ?? `agent #${e.agentId}`).replace(/-/g, ' ');
    r.text(L, HEAD + 52, 3, fit(`${e.repo ? `${e.repo}#${e.pr}` : `PR #${e.pr} in a private repo`} - ${label} (${HARNESSES[e.harness] ?? e.harness})`, 3, LW), MUTED);
    r.text(L, HEAD + 84, 4, fit(e.title ?? 'Merged by a person', 4, LW), TEXT);
    const bounty = e.paid ? `${amount(e.paid.amount, e.paid.decimals)} USDC` : 'NO BOUNTY';
    r.text(L, HEAD + 136, 9, fit(bounty, 9, LW), e.paid ? PROOF : FAINT);
    r.text(L, HEAD + 210, 2, e.paid ? 'RELEASED FROM ESCROW ON SOLANA DEVNET, ONLY ON A HUMAN MERGE' : 'MERGED BY A PERSON', MUTED);
    // The money path: four steps, each a node and a short hash.
    const steps: [string, boolean, string][] = [
      ['UNIT DONE', true, `PR #${e.pr}`],
      ['HUMAN MERGED', true, e.maintainer ? e.maintainer.slice(0, 10) : ''],
      ['ESCROW PAID', !!e.paid, shortHash(e.links.solana)],
      ['ATTESTED', !!e.links.attestation, shortHash(e.links.attestation)],
    ];
    const sy = HEAD + 262;
    const step = Math.floor(LW / 4);
    steps.forEach(([name, done, hash], i) => {
      const sx = L + i * step;
      if (i < steps.length - 1) r.rect(sx + 18, sy + 8, step - 18, 2, steps[i + 1][1] ? PROOF : LINE_STRONG);
      if (done) r.rect(sx, sy, 18, 18, PROOF);
      else r.frame(sx, sy, 18, 18, LINE_STRONG, 2);
      r.text(sx, sy + 32, 2, fit(name, 2, step - 12), done ? TEXT : FAINT);
      if (hash) r.text(sx, sy + 54, 2, fit(hash, 2, step - 12), MUTED);
    });
  } else {
    r.text(L, HEAD + 40, 4, 'No merges on chain yet.', MUTED);
    r.text(L, HEAD + 84, 3, 'The first one lights the rail.', FAINT);
  }

  // The totals down the right.
  const c = doc.counters;
  const totals: [string, string, RGB][] = [
    [String(c.merged), 'MERGES ATTESTED', PROOF],
    [c.usdcPaid, 'USDC PAID ON A MERGE', TEXT],
    [String(c.maintainers), 'MAINTAINERS', TEXT],
  ];
  totals.forEach(([value, name, color], i) => {
    const ty = HEAD + 26 + i * 112;
    r.text(SIDE + 32, ty, 7, fit(value, 7, 256), color);
    r.text(SIDE + 32, ty + 64, 2, name, MUTED);
    if (i < totals.length - 1) r.rect(SIDE, ty + 92, X + BW - SIDE, 1, LINE);
  });

  // The foot: testnet only, and the credit.
  r.text(L, FOOT + 17, 2, 'TESTNET ONLY: NO REAL FUNDS.', FAINT);
  const credit = UPSTREAM_CREDIT;
  r.text(X + BW - 32 - textWidth(credit, 2), FOOT + 17, 2, credit, MUTED);
  return encodePng(r);
}
