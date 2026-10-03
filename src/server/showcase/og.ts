// The showcase's share card (og.png, 1200 x 630): the hero line, the counters and the top rows of the
// board per harness, drawn in a 5 x 7 pixel font straight into a PNG. No browser, no canvas and no
// dependencies (node:zlib only), so the office can draw it on request and onchain/indexer's static
// export can draw it at build time, from the same public document the page shows.
import { deflateSync } from 'node:zlib';
import { leaderboard, rateLabel } from '../../shared/reputation.js';
import { asRepEvents, HARNESSES, type ShowcaseDoc } from '../../shared/showcase.js';

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
const INK = hex('#2b2d42');
const PAPER = hex('#fffaf3');
const PAPER_2 = hex('#fff1de');
const ACCENT = hex('#ff8a5b');
const GOOD = hex('#06d6a0');
const MUTED = hex('#7a6f65');
const SKY = hex('#bfe3ff');

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
  /** A chunky panel: ink border and a drop shadow, as the office's panels have. */
  panel(x: number, y: number, w: number, h: number, fill: RGB, b = 6) {
    this.rect(x + b, y + b, w, h, INK);
    this.rect(x, y, w, h, INK);
    this.rect(x + b, y + b, w - 2 * b, h - 2 * b, fill);
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

/** The share card for a showcase document. */
export function ogImage(doc: ShowcaseDoc): Buffer {
  const r = new Raster(OG_WIDTH, OG_HEIGHT);
  r.rect(0, 0, OG_WIDTH, OG_HEIGHT, SKY);
  // A floor of pixel tiles along the bottom, as the office's floor.
  for (let x = 0; x < OG_WIDTH; x += 40) r.rect(x, OG_HEIGHT - 40, 38, 38, (x / 40) % 2 ? PAPER_2 : hex('#e0a96d'));
  r.panel(40, 34, OG_WIDTH - 86, OG_HEIGHT - 110, PAPER);

  r.text(80, 74, 8, 'PROOF OF MERGE', INK);
  r.rect(80, 142, textWidth('PROOF OF MERGE', 8), 8, ACCENT);
  r.text(80, 172, 4, "A person's merge is the only thing", INK);
  r.text(80, 206, 4, 'that pays an agent.', INK);

  // The counters.
  const c = doc.counters;
  const tiles: [string, string, RGB][] = [
    [String(c.merged), 'merged PRs', ACCENT],
    [c.usdcPaid, 'USDC paid', GOOD],
    [String(c.maintainers), 'maintainers', hex('#5bc0eb')],
    [String(c.paidWorkers), 'paid agents', hex('#ffd166')],
  ];
  const tw = 240;
  tiles.forEach(([value, label, color], i) => {
    const x = 80 + i * (tw + 20);
    r.panel(x, 256, tw, 104, color, 5);
    r.text(x + 18, 274, 6, fit(value, 6, tw - 36), INK);
    r.text(x + 18, 330, 3, label, INK);
  });

  // The top of the board per harness, over all time, self-merges left out.
  const rows = leaderboard(asRepEvents(doc.events, false), 'harness').slice(0, 3);
  r.text(80, 386, 3, 'Which coding agent gets merged? (all time)', MUTED);
  rows.forEach((s, i) => {
    const y = 416 + i * 40;
    r.text(80, y, 4, `${i + 1}. ${fit(HARNESSES[s.key] ?? s.key, 4, 300)}`, INK);
    if (s.mergeRate === null) r.text(470, y, 4, 'too few yet', MUTED);
    else r.text(470, y, 4, `${rateLabel(s.mergeRate)} merged`, INK);
    r.text(840, y, 4, `n=${s.samples}`, INK);
  });
  if (!rows.length) r.text(80, 420, 4, 'No merges yet', MUTED);

  const foot = 'Testnet only: Solana devnet and Base Sepolia. Built on agent-office by webdevcody (MIT).';
  r.rect(40, OG_HEIGHT - 36, textWidth(foot, 2) + 16, 26, PAPER);
  r.text(48, OG_HEIGHT - 30, 2, foot, INK);
  return encodePng(r);
}
