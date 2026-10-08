// The office's own words in plain ASCII: every string literal in src/server and src/shared (what
// reaches a toast, a board, a CLI, a commit or an agent's prompt) has no em or en dash, no ellipsis
// glyph, no curly quotes and no emoji, and names the product Kipdeck rather than Agent Office.
// Comments and regular expressions are left out (a regex may match what other people type).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');

/**
 * Terminal drawing that is not copy: the DeepSeek Harness worker paints its own TUI in its terminal
 * (prompt arrows, a spinner), which is the harness's look, not the office's voice.
 */
const EXEMPT = new Set(['src/server/dsh.ts']);

const BANNED = /[–—…‘’“”☰⬀-⯿☀-➿]|[\u{1F300}-\u{1FAFF}]/u;

function files(dir: string): string[] {
  return readdirSync(path.join(root, dir)).flatMap((f) => {
    const rel = path.join(dir, f);
    return statSync(path.join(root, rel)).isDirectory() ? files(rel) : rel.endsWith('.ts') ? [rel] : [];
  });
}

/** The string literals of a TypeScript source, with their lines: comments and regexes skipped. */
export function literals(src: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  let i = 0;
  let prev = '';
  const lineAt = (at: number) => src.slice(0, at).split('\n').length;
  while (i < src.length) {
    const c = src[i];
    if (src.startsWith('//', i)) {
      i = src.indexOf('\n', i);
      if (i < 0) break;
      continue;
    }
    if (src.startsWith('/*', i)) {
      const end = src.indexOf('*/', i + 2);
      i = end < 0 ? src.length : end + 2;
      continue;
    }
    if (c === '/' && (prev === '' || '(,=:[!&|?{};+-*%<>~^'.includes(prev) || /\breturn$/.test(src.slice(Math.max(0, i - 7), i).trimEnd()))) {
      // A regex: to its closing slash, past escapes and character classes.
      let j = i + 1;
      let cls = false;
      while (j < src.length && (src[j] !== '/' || cls) && src[j] !== '\n') {
        if (src[j] === '\\') j++;
        else if (src[j] === '[') cls = true;
        else if (src[j] === ']') cls = false;
        j++;
      }
      i = j + 1;
      prev = '/';
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      let depth = 0;
      while (j < src.length) {
        if (src[j] === '\\') j += 2;
        else if (c === '`' && depth === 0 && src.startsWith('${', j)) {
          depth = 1;
          j += 2;
        } else if (c === '`' && depth > 0) {
          if (src[j] === '{') depth++;
          else if (src[j] === '}') depth--;
          j++;
        } else if (src[j] === c) break;
        else j++;
      }
      out.push({ line: lineAt(i), text: src.slice(i + 1, j) });
      i = j + 1;
      prev = c;
      continue;
    }
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out;
}

test('server and shared strings are plain ASCII copy: no em dash, ellipsis glyph, curly quote or emoji', () => {
  const bad: string[] = [];
  for (const f of [...files('src/server'), ...files('src/shared')]) {
    if (EXEMPT.has(f.split(path.sep).join('/'))) continue;
    for (const { line, text } of literals(readFileSync(path.join(root, f), 'utf8'))) {
      const m = BANNED.exec(text);
      if (m) bad.push(`${f}:${line}: ${JSON.stringify(m[0])} in ${JSON.stringify(text.slice(0, 80))}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('the product calls itself Kipdeck wherever agents, tools and commits see it', () => {
  const bad: string[] = [];
  for (const f of [...files('src/server'), ...files('src/shared'), 'bin/office-workers.js', 'bin/office-queue.js']) {
    for (const { line, text } of literals(readFileSync(path.join(root, f), 'utf8'))) if (/Agent Office|Mergeline|UGC Army/.test(text)) bad.push(`${f}:${line}`);
  }
  assert.deepEqual(bad, []);
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'kipdeck');
  assert.equal(pkg.bin.kipdeck, pkg.bin['agent-office']);
});

test('the scanner sees strings, not comments or regexes', () => {
  const src = "// a — comment\nconst r = /[“”]/;\nconst s = 'plain';\nconst t = `x ${'—'} y`;";
  assert.deepEqual(
    literals(src).map((l) => l.text),
    ['plain', "x ${'—'} y"],
  );
});

for (const file of ['src/shared/shiplog.ts', 'src/shared/shipvoice.ts', 'src/shared/epithet.ts', 'src/shared/commendations.ts', 'src/shared/launch.ts', 'src/shared/pace.ts', 'src/shared/turnaround.ts'])
test(`the bridge's world speaks calmly: no exclamation marks, no war words, no emoji (${file})`, () => {
  const src = readFileSync(path.join(root, file), 'utf8');
  const words = literals(src).map((l) => l.text);
  assert.ok(words.length > 10, 'the phrasebook has its words');
  for (const w of words) {
    assert.ok(!w.includes('!'), `an exclamation mark in ${JSON.stringify(w)}`);
    assert.ok(!/\b(war|attack|kill|troops?|battle|enemy|fire|destroy|weapon|strike)\b/i.test(w), `a war word in ${JSON.stringify(w)}`);
    assert.ok(/^[\x20-\x7e]*$/.test(w), `not plain ASCII: ${JSON.stringify(w)}`);
  }
});
