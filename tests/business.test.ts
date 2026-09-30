import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The business/ folder: documents only, but they still have to hold together. */
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'business');

const EXPECTED = [
  'README.md',
  'employer-clearance-request.md',
  'upstream-partnership.md',
  'agent-team-lab-offer.md',
  'sow-template.md',
  'pricing-and-metrics.md',
  'naming.md',
  'vendor-credits.md',
  'workshop/README.md',
  'workshop/one-day.md',
  'workshop/three-day.md',
  'workshop/exercise-repos.md',
  'workshop/setup-checklist.md',
  'landing/index.html',
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const rel = (file: string) => path.relative(ROOT, file).split(path.sep).join('/');
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');
const markdown = () => walk(ROOT).filter((f) => f.endsWith('.md'));

/** What a reader sees of a page: no tags, scripts, styles, comments or attributes. */
function visibleText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
}

test('every playbook document is there', () => {
  for (const file of EXPECTED) assert.ok(existsSync(path.join(ROOT, file)), file);
});

test('the playbook is plain printable ASCII: no smart punctuation, dashes, ellipses or hidden characters', () => {
  for (const file of walk(ROOT)) {
    const text = readFileSync(file, 'utf8');
    text.split('\n').forEach((line, i) => {
      const bad = [...line].find((ch) => ch !== '\t' && (ch < ' ' || ch > '~'));
      assert.equal(bad, undefined, `${rel(file)}:${i + 1} has U+${bad?.codePointAt(0)?.toString(16).padStart(4, '0')}`);
    });
  }
});

test('Markdown uses headings, not horizontal rules, and sentence-case headings', () => {
  for (const file of markdown()) {
    const lines = readFileSync(file, 'utf8').split('\n');
    let fenced = false;
    lines.forEach((line, i) => {
      if (line.startsWith('```')) fenced = !fenced;
      if (fenced) return;
      assert.ok(!/^\s*([-*_])(\s*\1){2,}\s*$/.test(line), `${rel(file)}:${i + 1} is a horizontal rule`);
      const heading = /^#{1,6}\s+(.*)$/.exec(line)?.[1];
      if (!heading) return;
      // Title Case gives itself away as three or more capitalized ordinary words after the first.
      const rest = heading.split(/\s+/).slice(1).filter((w) => /^[A-Za-z][a-z]{3,}$/.test(w));
      const capitalized = rest.filter((w) => /^[A-Z]/.test(w));
      assert.ok(!(rest.length >= 3 && capitalized.length === rest.length), `${rel(file)}:${i + 1} looks like Title Case: ${heading}`);
    });
  }
});

test('relative links between the documents point at files that exist', () => {
  for (const file of markdown()) {
    const text = readFileSync(file, 'utf8');
    for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^[a-z]+:/i.test(target) || target.startsWith('#')) continue;
      const resolved = path.resolve(path.dirname(file), target.split('#')[0]);
      assert.ok(existsSync(resolved), `${rel(file)} links to missing ${target}`);
    }
  }
});

test('the prices agree everywhere they are quoted', () => {
  const pricing = read('pricing-and-metrics.md');
  const offer = read('agent-team-lab-offer.md');
  const sow = read('sow-template.md');
  const landing = visibleText(read('landing/index.html'));
  const tiers: Array<[string, string]> = [['Starter', '12,000'], ['Standard', '28,000'], ['Extended', '45,000']];
  for (const [tier, price] of tiers) {
    assert.match(pricing, new RegExp(`\\| ${tier} \\|[^\\n]*\\| EUR ${price} \\|`), `${tier} in pricing-and-metrics.md`);
    assert.ok(offer.includes(price), `${tier} price in the offer`);
    assert.ok(sow.includes(price), `${tier} price in the SOW`);
  }
  assert.match(landing, /Starter pilot EUR 12,000/);
  assert.match(landing, /Standard pilot EUR 28,000/);
  assert.match(pricing, /\| 1 day, remote \| up to 12 \| EUR 4,500 \|/);
  assert.match(landing, /Workshop from EUR 4,500/);
});

test('the pilot tiers add up from the cost basis the pricing document states', () => {
  // Effort days x day rate x 15% contingency, which the document rounds up to the list price.
  const cost = (senior: number, second: number) => (senior * 1000 + second * 700) * 1.15;
  const rows: Array<[number, number, number]> = [[10, 0, 12000], [18, 6, 28000], [28, 12, 45000]];
  for (const [senior, second, price] of rows) {
    const c = cost(senior, second);
    assert.ok(price >= c && price <= c * 1.12, `${price} against ${c}`);
  }
});

test('the landing page is self-contained: nothing loads from elsewhere and nothing tracks', () => {
  const html = read('landing/index.html');
  // Anything that makes the browser fetch: scripts, styles, images, frames, fonts.
  for (const m of html.matchAll(/<(script|link|img|iframe|source|video|audio|embed|object)\b[^>]*>/gi)) {
    const tag = m[0];
    const url = /\b(?:src|href|data)\s*=\s*"([^"]*)"/i.exec(tag)?.[1];
    if (url === undefined) continue;
    assert.ok(url.startsWith('data:'), `loads ${url}`);
  }
  assert.ok(!/@import|url\(\s*['"]?https?:/i.test(html), 'CSS pulls something in');
  assert.ok(!/(google-analytics|googletagmanager|gtag\(|plausible|segment\.|hotjar|mixpanel|facebook\.net|clarity\.ms|posthog|matomo)/i.test(html), 'tracker');
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? '';
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /connect-src 'none'/);
  assert.match(csp, /form-action 'none'/);
  // The only outbound link is the credit to the upstream project, and it leaks no referrer.
  const external = [...html.matchAll(/<a\b[^>]*href="(https?:[^"]+)"[^>]*>/gi)];
  assert.equal(external.length, 1);
  assert.match(external[0][0], /rel="noopener noreferrer"/);
});

test('the landing page carries a working name, not the upstream or Microsoft-like marks', () => {
  const html = read('landing/index.html');
  const title = /<title>([^<]+)<\/title>/.exec(html)?.[1] ?? '';
  assert.ok(title.length > 0);
  const names = [...html.matchAll(/<span data-name>([^<]+)<\/span>/g)].map((m) => m[1]);
  assert.ok(names.length >= 2);
  for (const n of names) assert.equal(n, title, 'every data-name matches the <title>');
  const text = visibleText(html);
  assert.ok(!/agent[\s-]?office/i.test(text + title), 'upstream name in the page text');
  for (const mark of [/\boffice\b/i, /\bteams\b/i, /\bcopilot\b/i, /\bmicrosoft\b/i]) assert.ok(!mark.test(title + ' ' + text), `${mark} in the page text`);
  assert.ok(naming().includes(title), 'the working name is one of the candidates in naming.md');
  // MIT asks for credit; the footer gives it.
  assert.match(text, /MIT license/);
});

function naming(): string {
  return read('naming.md');
}

test('naming.md lists ten candidates and asks for a trademark check', () => {
  const doc = naming();
  const table = doc.split('## Candidates')[1].split('\n## ')[0];
  const rows = table.split('\n').filter((l) => /^\| [A-Z][a-z]+ \|/.test(l) && !l.startsWith('| Name |'));
  assert.equal(rows.length, 10);
  assert.match(doc, /trademark/i);
  assert.match(doc, /EUIPO/);
});

test('the workshop exercises refer to seeded issues that the repository specs define', () => {
  const specs = read('workshop/exercise-repos.md');
  const defined = new Set([...specs.matchAll(/^\| ([A-Z]\d{1,2}) \|/gm)].map((m) => m[1]));
  const repos = [...specs.matchAll(/^## ([a-z-]+)$/gm)].map((m) => m[1]);
  assert.ok(repos.length >= 3 && repos.length <= 5, `${repos.length} exercise repositories`);
  for (const file of ['workshop/one-day.md', 'workshop/three-day.md']) {
    const text = read(file);
    for (const [, id] of text.matchAll(/\b([LTSWB]\d{1,2})\b/g)) assert.ok(defined.has(id), `${file} uses ${id}, which exercise-repos.md does not define`);
    for (const [, repo] of text.matchAll(/`([a-z]+-[a-z-]+)`/g)) {
      if (repo === 'workshop-start') continue;
      assert.ok(repos.includes(repo), `${file} uses repository ${repo}`);
    }
  }
});

test('vendor-credits.md says when it was checked and lists its sources', () => {
  const doc = read('vendor-credits.md');
  assert.match(doc, /2026-09-30/);
  const sources = doc.split('## Sources')[1] ?? '';
  assert.ok((sources.match(/https:\/\//g) ?? []).length >= 10);
});
