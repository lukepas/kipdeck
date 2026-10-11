import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { qrMatrix, qrPath } from '../src/shared/qr.js';

// The QR encoder behind Pair a phone (shared/qr.ts). The codes it makes were checked to decode with a
// real reader (Chrome's BarcodeDetector) across versions 1 to 29 and both levels; tests/phone-e2e
// decodes the one the window shows. Here: the fixed patterns, the format information, the version it
// picks, and a fingerprint of one code so a change to the encoder can't slip by unnoticed.

/** The 15 format bits around the top-left finder, as the spec reads them. */
function formatBits(m: boolean[][]): number {
  let bits = 0;
  const at = (x: number, y: number) => (m[y][x] ? 1 : 0);
  // Bits 0..5 at (8, 0..5), 6 at (8,7), 7 at (8,8), 8 at (7,8), 9..14 at (5..0, 8).
  const cells: [number, number][] = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  cells.forEach(([x, y], i) => (bits |= at(x, y) << i));
  return bits ^ 0x5412;
}

/** Whether 15 format bits are a valid BCH(15,5) codeword. */
function bchOk(bits: number): boolean {
  let rem = bits;
  for (let i = 14; i >= 10; i--) if ((rem >>> i) & 1) rem ^= 0x537 << (i - 10);
  return rem === 0;
}

function finderAt(m: boolean[][], x0: number, y0: number): boolean {
  for (let dy = 0; dy < 7; dy++) {
    for (let dx = 0; dx < 7; dx++) {
      const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
      if (m[y0 + dy][x0 + dx] !== (ring !== 2)) return false;
    }
  }
  return true;
}

test('the smallest version that holds the text, at the level asked for', () => {
  // Byte mode capacity of version 1: 17 bytes at L, 14 at M.
  assert.equal(qrMatrix('x'.repeat(17), 'L').length, 21);
  assert.equal(qrMatrix('x'.repeat(18), 'L').length, 25);
  assert.equal(qrMatrix('x'.repeat(14), 'M').length, 21);
  assert.equal(qrMatrix('x'.repeat(15), 'M').length, 25);
  // A pairing link is a version 5 or so at M.
  const link = qrMatrix('https://agent-office.tail1234.ts.net/login#pair=AbCdEfGhIjKlMnOpQrStUvWxYz012345');
  assert.ok(link.length >= 33 && link.length <= 45, String(link.length));
  // Multi-byte text counts in UTF-8 bytes.
  assert.equal(qrMatrix('é'.repeat(7), 'M').length, 21);
  assert.equal(qrMatrix('é'.repeat(8), 'M').length, 25);
  assert.throws(() => qrMatrix('x'.repeat(3000), 'M'), /Too long/);
});

test('finders, timing, the dark module and valid format information', () => {
  for (const [text, level] of [['hi', 'M'], ['x'.repeat(120), 'L'], ['x'.repeat(300), 'M']] as const) {
    const m = qrMatrix(text, level);
    const s = m.length;
    assert.equal((s - 17) % 4, 0);
    assert.ok(m.every((row) => row.length === s));
    assert.ok(finderAt(m, 0, 0) && finderAt(m, s - 7, 0) && finderAt(m, 0, s - 7), 'three finder patterns');
    for (let i = 8; i < s - 8; i++) {
      assert.equal(m[6][i], i % 2 === 0, `timing row at ${i}`);
      assert.equal(m[i][6], i % 2 === 0, `timing column at ${i}`);
    }
    assert.equal(m[s - 8][8], true, 'the dark module');
    const f = formatBits(m);
    assert.ok(bchOk(f), 'format bits are a BCH codeword');
    assert.equal(f >>> 13, level === 'L' ? 1 : 0, 'the level in the format bits');
  }
});

test('the same text always gives the same code', () => {
  const m = qrMatrix('https://kipdeck.example/login#pair=fixed-test-token');
  const hash = createHash('sha256').update(m.map((r) => r.map((d) => (d ? '1' : '0')).join('')).join('\n')).digest('hex').slice(0, 16);
  assert.equal(hash, FINGERPRINT);
  const path = qrPath([[true, false], [false, true]], 4);
  assert.equal(path, 'M4,4h1v1h-1zM5,5h1v1h-1z');
});

/** sha256 of the code above, from the encoder as it was checked against a real reader. */
const FINGERPRINT = 'f28e2e0a6c8806a8';
