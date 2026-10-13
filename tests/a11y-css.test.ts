// Two stylesheet rules a browser won't warn about when they break. --focus (styles/tokens.css) is a
// whole box-shadow list, so it only works as a list item of its own: put inside another shadow it
// makes the declaration invalid and the element loses its shadow, ring and all. And on a phone every
// control in the inbox's pane is at least 44px to tap (home/phone.css): a control a pane sheet sets
// shorter than that has to be in phone.css's list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');

function cssFiles(dir: string): string[] {
  return readdirSync(path.join(root, dir)).flatMap((f) => {
    const rel = `${dir}/${f}`;
    return statSync(path.join(root, rel)).isDirectory() ? cssFiles(rel) : rel.endsWith('.css') ? [rel] : [];
  });
}

/** A value's comma-separated items, commas inside var(...) and other brackets left alone. */
function items(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const c of value) {
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (c === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

test('var(--focus) is only ever a box-shadow item of its own', () => {
  const bad: string[] = [];
  for (const f of cssFiles('src')) {
    const css = readFileSync(path.join(root, f), 'utf8');
    for (const m of css.matchAll(/([\w-]+)\s*:\s*([^;{}]*var\(--focus\)[^;{}]*)/g)) {
      const line = css.slice(0, m.index).split('\n').length;
      if (m[1] !== 'box-shadow') bad.push(`${f}:${line}: ${m[1]} takes var(--focus), a shadow list`);
      else for (const it of items(m[2].replace(/!important/, ''))) if (it.includes('var(--focus)') && it !== 'var(--focus)') bad.push(`${f}:${line}: "${it}"`);
    }
  }
  assert.deepEqual(bad, []);
});

test('the Approval card on a phone: its buttons and reason box are in the 44px list', () => {
  const phone = readFileSync(path.join(root, 'src/client/home/phone.css'), 'utf8');
  const list = /:is\(([^)]*)\)\s*\{\s*min-height:\s*44px/.exec(phone)?.[1].split(',').map((s) => s.trim()) ?? [];
  assert.ok(list.length, 'phone.css has its 44px list');
  // Every control the card's sheet sets under 44px tall.
  const short: string[] = [];
  const css = readFileSync(path.join(root, 'src/client/home/approval.css'), 'utf8');
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const h = /(?:^|[;\s])height:\s*(\d+)px/.exec(m[2]);
    if (!h || Number(h[1]) >= 44) continue;
    for (const sel of m[1].split(',').map((s) => s.trim())) if (/(\.btn|\binput|\bbutton)$/.test(sel)) short.push(sel);
  }
  for (const sel of [...short, '.ap-deny .btn']) assert.ok(list.includes(sel), `${sel} is under 44px on a phone`);
});
