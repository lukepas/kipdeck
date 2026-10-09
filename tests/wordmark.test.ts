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
/** The pages that carry the two-tone wordmark (the home page has none). */
const WORDMARKED = PAGES.filter((p) => p !== 'src/client/index.html');

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

test('the wordmark reads KIPDECK on the bridge, its loading screen, the sign-in pages and the showcase', () => {
  for (const f of WORDMARKED) {
    const src = readFileSync(path.join(ROOT, f), 'utf8');
    assert.doesNotMatch(src, /MERGE(?:<\/b>)?<span>LINE/, `${f} still spells the old name`);
    assert.match(src, /KIP(?:<\/b>)?<span>DECK<\/span>/, `${f} has no KIPDECK wordmark`);
  }
});
