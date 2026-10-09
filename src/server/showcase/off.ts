// What /pom/ says while the showcase is off: still a 404 (nothing is public until an admin turns it
// on), but a page that looks like the product and says how to turn it on, not a bare "Not found".
// Self-contained: its one style block is allowed by its hash, and nothing else loads.
import { createHash } from 'node:crypto';
import { PRODUCT } from '../../shared/copy.js';
import { markSvg } from '../../shared/logo.js';

const STYLE = `
:root { color-scheme: dark; --void: #0d131a; --surface: #141b23; --line: #26313d; --text: #e8ecef; --muted: #8a97a5; --proof: #a68bff; }
@media (prefers-color-scheme: light) { :root { color-scheme: light; --void: #f4f6f8; --surface: #ffffff; --line: #d5dbe1; --text: #0d131a; --muted: #56616d; --proof: #5b3fd1; } }
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; background: var(--void); color: var(--text); font: 15px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif; }
body { display: grid; place-items: center; min-height: 100vh; padding: 24px 16px;
  background-image: linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px); background-size: 48px 48px; background-position: -1px -1px; }
main { width: min(440px, 100%); background: var(--surface); border: 1px solid var(--line); border-top: 2px solid var(--proof); border-radius: 4px; padding: 28px 28px 22px; }
.mark { display: flex; align-items: center; gap: 10px; font-weight: 600; letter-spacing: .08em; font-size: 14px; }
.mark span { color: var(--muted); }
.mark svg { color: var(--text); }
.mark svg .signal { fill: var(--proof); }
.eyebrow { margin: 22px 0 6px; font: 600 11px ui-monospace, 'SF Mono', Menlo, monospace; letter-spacing: .12em; text-transform: uppercase; color: var(--proof); }
h1 { margin: 0 0 10px; font-size: 22px; font-weight: 600; line-height: 1.25; }
p { margin: 0 0 12px; color: var(--muted); }
code { font: 13px ui-monospace, 'SF Mono', Menlo, monospace; color: var(--text); }
a { color: var(--text); text-underline-offset: 3px; }
footer { margin-top: 18px; padding-top: 12px; border-top: 1px solid var(--line); font-size: 12px; color: var(--muted); }
`;

// Kip's mark, his light in violet here.
const MARK = markSvg(24, 'logo');

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Proof of Merge is off - ${PRODUCT}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
  <div class="mark">${MARK}<b>KIP</b><span>DECK</span></div>
  <p class="eyebrow">Proof of Merge</p>
  <h1>The public ledger is off on this deck</h1>
  <p>This office keeps its merges, payouts and attestations private until an admin publishes them.</p>
  <p>To turn it on: open the deck, then <code>Menu &gt; Deck &gt; Settings &gt; Bounties &gt; Public showcase</code>.</p>
  <p><a href="/">Back to the deck</a></p>
  <footer>Built on agent-office (AgentSystemLabs / webdevcody), MIT</footer>
</main>
</body>
</html>
`;

/** The page, and the content security policy that lets its one style block and nothing else run. */
export function showcaseOffPage(): { html: string; csp: string } {
  const hash = createHash('sha256').update(STYLE).digest('base64');
  return { html: HTML, csp: `default-src 'none'; style-src 'sha256-${hash}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` };
}
