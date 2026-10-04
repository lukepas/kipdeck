// The NaN guard for the office's own shaders: GLSL leaves pow(x, y) undefined for x < 0, and on
// Apple GPUs (ANGLE Metal) it returns NaN. A base like `1.0 - vY` goes a hair negative where a
// varying overshoots its end, and in Night mode the bloom blurs that one NaN pixel over the whole
// frame, a black flash (it was the holo cone over the mission table). So every pow() in a shader
// string keeps its base off the negative side: max(..., 0.0), clamp(...), or 1.0 - clamp(x, 0, 1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const client = path.join(import.meta.dirname, '../src/client');

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : e.name.endsWith('.ts') ? [p] : [];
  });
}

/** The first argument of the call whose `(` is at `open`, up to its top-level comma. */
function firstArg(src: string, open: number): string {
  let depth = 0;
  for (let i = open + 1; i < src.length; i++) {
    const c = src[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) return src.slice(open + 1, i).trim();
  }
  return src.slice(open + 1).trim();
}

/** Each GLSL pow() base in `src`: a pow( outside a // comment that isn't Math.pow or a method call. */
export function powBases(source: string): string[] {
  const src = source.replace(/(?<!:)\/\/.*$/gm, '');
  const out: string[] = [];
  for (const m of src.matchAll(/(?<![.\w])pow\(/g)) out.push(firstArg(src, m.index + 3));
  return out;
}

/** Whether `s` is one call of `fn` as a whole: `fn(...)` with its closing paren last. */
function wholeCall(s: string, fn: string): boolean {
  if (!s.startsWith(fn + '(')) return false;
  let depth = 0;
  for (let i = fn.length; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')' && --depth === 0) return i === s.length - 1;
  }
  return false;
}

/** A base that can't be negative, whatever its inputs. */
export function guarded(base: string): boolean {
  if (/, 0\.0\)$/.test(base) && wholeCall(base, 'max')) return true;
  if (wholeCall(base, 'clamp')) return /, 0\.0, [\w.]+\)$/.test(base);
  const rest = base.replace(/^1\.0 - /, '');
  return rest !== base && wholeCall(rest, 'clamp') && /, 0\.0, 1\.0\)$/.test(rest);
}

test('powBases finds GLSL pow() calls and their bases, not Math.pow', () => {
  const src = 'const k = Math.pow(2, 3); const s = `// pow(x) of a negative\nfloat a = pow(1.0 - vY, 1.6) * pow(max(dot(a, b), 0.0), 2.0);`;';
  assert.deepEqual(powBases(src), ['1.0 - vY', 'max(dot(a, b), 0.0)']);
});

test('guarded accepts a clamped base and refuses one that can go negative', () => {
  assert.ok(guarded('max(1.0 - vY, 0.0)'));
  assert.ok(guarded('clamp(x, 0.0, 1.0)'));
  assert.ok(guarded('1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0)'));
  assert.ok(!guarded('1.0 - vY'));
  assert.ok(!guarded('vFacing'));
  assert.ok(!guarded('1.0 - abs(dot(normalize(normal), normalize(vViewPosition)))'));
  assert.ok(!guarded('max(a, 0.0) - b'));
  assert.ok(!guarded('max(a, -1.0)'));
  assert.ok(!guarded('1.0 - clamp(x, 0.0, 2.0)'));
});

test('every pow() in a client shader has a base that cannot go negative', () => {
  const bad: string[] = [];
  let seen = 0;
  for (const file of files(client)) {
    for (const base of powBases(readFileSync(file, 'utf8'))) {
      seen++;
      if (!guarded(base)) bad.push(`${path.relative(client, file)}: pow(${base}, ...)`);
    }
  }
  assert.ok(seen > 0, 'found no shader pow() at all: the scan is broken');
  assert.deepEqual(bad, [], 'wrap these bases in max(..., 0.0): pow() of a negative is NaN on Apple GPUs, and the bloom turns one NaN pixel into a black frame');
});
