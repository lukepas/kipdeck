// The product is Kipdeck. No earlier product name may show on the pages people see.
// The wordmark is split over tags (`KIP<span>DECK</span>`), so a plain grep would miss `MERGE<span>LINE`:
// this strips the tags first and reads the text a person would.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OLD = /mergeline|ugc ?army/i;

/** What a page says once its tags are gone, with the pieces of one word kept together. */
function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, '');
}

const PAGES = ['src/client/index.html', 'src/client/bridge.html', 'src/client/login.html', 'src/client/join.html', 'src/client/claim.html', 'src/client/showcase/index.html', 'src/server/showcase/off.ts'];
/** Every page carries the two-tone wordmark beside Kip's mark, the home page's top bar too. */
const WORDMARKED = PAGES;

test('the split markup is read as one word', () => {
  assert.match(visibleText('<span>MERGE<span>LINE</span></span>'), OLD);
  assert.doesNotMatch(visibleText('<b>KIP</b><span>DECK</span>'), OLD);
});

for (const page of PAGES) {
  test(`${page} shows the Kipdeck wordmark and no old name`, () => {
    const text = visibleText(readFileSync(path.join(ROOT, page), 'utf8'));
    assert.doesNotMatch(text, OLD);
    if (WORDMARKED.includes(page)) assert.match(text, /KIPDECK/);
  });
}

test('the wordmark reads KIPDECK on the home page, the bridge, its loading screen, the sign-in pages and the showcase', () => {
  for (const f of WORDMARKED) {
    const src = readFileSync(path.join(ROOT, f), 'utf8');
    assert.doesNotMatch(src, /MERGE(?:<\/b>)?<span>LINE/, `${f} still spells the old name`);
    assert.match(src, /KIP(?:<\/b>)?<span>DECK<\/span>/, `${f} has no KIPDECK wordmark`);
  }
});

test("every page's wordmark sits beside Kip's mark (src/shared/logo.ts), not the old chevrons", () => {
  for (const f of WORDMARKED) {
    const src = readFileSync(path.join(ROOT, f), 'utf8');
    assert.match(src, /data-logo="(?:mark|small)"|markSvg\(/, `${f} draws no Kip mark`);
    assert.doesNotMatch(src, /M4 10 11 3l1 1 1-1 7 7v4l-8-8-8 8Z/, `${f} still draws the old chevron mark`);
  }
});
