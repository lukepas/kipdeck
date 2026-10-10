// The public showcase page (Proof of Merge): which coding agents' pull requests people actually
// merge, from chain data. One static bundle, served by the office at /pom/ or as files on GitHub
// Pages; either way it reads ./showcase.json next to it (see shared/showcase.ts for what that holds,
// and what it never does). No cookies, no storage, no inline scripts.
import './showcase.css';
import { commonSymbol, tokenWords } from '../../shared/money';
import { HARNESSES, type ShowcaseDoc, type ShowcaseWorkerState } from '../../shared/showcase';
import { $, h } from '../ui/dom';
import { icon, type IconName } from '../ui/icons';
import { board, type BoardView } from './board';
import { ago, units, when } from './format';
import { lastMerge, ledgerRow } from './ledger';
import { verifyPanel } from './verify';

/** How often the office's live view is asked again, while the tab is open. */
const REFRESH_MS = 30_000;
const FEED_PAGE = 12;
const STATE_LABEL: Record<ShowcaseWorkerState, string> = { working: 'working', 'needs-input': 'needs you', stuck: 'stuck', 'in-review': 'to review', idle: 'parked' };
/** Each state's glyph, the same shapes as on the deck (ui/icons.ts). */
const STATE_ICON: Record<ShowcaseWorkerState, IconName> = { working: 'working', 'needs-input': 'needs-you', stuck: 'stuck', 'in-review': 'review', idle: 'parked' };

function viewFromHash(): BoardView {
  const p = new URLSearchParams(location.hash.slice(1));
  return { by: p.get('by') === 'agent' ? 'agent' : 'harness', window: p.get('w') === '7d' || p.get('w') === '30d' ? (p.get('w') as '7d' | '30d') : 'all', self: p.get('self') === '1' };
}

function hero(doc: ShowcaseDoc) {
  const c = doc.counters;
  const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  const tile = (value: string, unit: string, label: string, href: string | undefined, cls: string) =>
    h(
      'div',
      { class: `counter ${cls}` },
      h('b', {}, value),
      h('i.unit', {}, unit),
      h('span', {}, label),
      href ? h('a.verify', { href, target: '_blank', rel: 'noopener', title: 'Where this number comes from' }, 'verify', icon('external', 12)) : h('small', {}, 'no link yet'),
    );
  $('counters').replaceChildren(
    tile(String(c.merged), 'Merged PRs', 'agent PRs a person merged', c.links.merged, 'c1'),
    tile(c.usdcPaid, `${capital(tokenWords(c.paidSymbol))} paid`, 'on devnet, only on a merge', c.links.usdcPaid, 'c2'),
    tile(String(c.maintainers), 'Maintainers', 'different people who merged', c.links.maintainers, 'c3'),
    tile(String(c.paidWorkers), 'Agents', 'different agents paid', c.links.paidWorkers, 'c4'),
  );
  $('source').textContent = `${doc.source === 'chain' ? 'Rebuilt from the chain alone' : "From the office's record of what it attested"}, ${when(doc.asOf)}. ${doc.network.base === 'base-sepolia' ? 'Base Sepolia' : 'A local test chain'}${doc.network.solana === 'none' ? '' : ` and ${doc.network.solana === 'devnet' ? 'Solana devnet' : 'a local validator'}`}.`;
  const latest = doc.events.find((e) => e.links.attestation);
  const merged = doc.events.find((e) => e.outcome === 'merged');
  $('last-at').textContent = [merged && `last merge ${ago(merged.mergedAt ?? merged.at)}`, latest && `last attestation ${ago(latest.at)}`].filter(Boolean).join(' · ');
  lastMerge(doc);
}

function floor(doc: ShowcaseDoc) {
  const sec = $('floor');
  const live = doc.live;
  sec.classList.toggle('hidden', !live);
  if (!live) return;
  const fresh = Date.now() / 1000 - live.at < 120;
  $('floor-when').replaceChildren(fresh ? h('span.live', {}, 'Live') : h('span.snap', {}, `Snapshot from ${when(live.at)}`));
  const strip = $('strip');
  strip.replaceChildren(
    ...live.workers.map((w) =>
      h('li.worker', { 'data-state': w.state }, h('span.glyph', { title: STATE_LABEL[w.state] }, icon(STATE_ICON[w.state], 16)), w.sign ? h('span.sign', { title: 'Call sign: pod and console, as on the deck' }, w.sign) : null, h('span.name', {}, w.name), h('span.chip', { 'data-h': w.harness }, HARNESSES[w.harness] ?? w.harness), h('span.state', {}, STATE_LABEL[w.state])),
    ),
  );
  if (!live.workers.length) strip.append(h('li.empty', {}, 'No units on deck right now.'));
}

function feed(doc: ShowcaseDoc) {
  const list = $('feed');
  let shown = FEED_PAGE;
  const more = $('feed-more') as HTMLButtonElement;
  const paint = () => {
    list.replaceChildren(...doc.events.slice(0, shown).map((e) => ledgerRow(doc, e)));
    if (!doc.events.length) list.append(h('li.empty', {}, 'No merged agent work on chain yet.'));
    more.classList.toggle('hidden', shown >= doc.events.length);
  };
  more.onclick = () => ((shown += FEED_PAGE * 2), paint());
  paint();
}

function bounties(doc: ShowcaseDoc) {
  const list = $('bounties');
  // The token by the bounties' mint: "test tokens" for the test mint, "USDC" only for devnet USDC.
  if (doc.bounties.length) $('bounties-token').textContent = `${tokenWords(commonSymbol(doc.bounties.map((b) => b.symbol)))} in escrow (devnet)`;
  list.replaceChildren(
    ...doc.bounties.map((b) =>
      h(
        'li.bounty',
        {},
        h('b.amount', {}, `${units(b.amount, b.decimals)} ${b.symbol}`),
        h('div.what', {}, h('b', {}, b.repo ? `${b.repo}#${b.issue}` : `Issue #${b.issue} in a private repo`), b.title ? h('span', {}, b.title) : null, h('small', {}, `expires ${ago(b.expiry / 1000)}`)),
        b.fund
          ? h('div.fund', {}, h('a.btn.primary', { href: b.fund.blink, target: '_blank', rel: 'noopener', title: 'Opens the Blink on dial.to (devnet)' }, 'Fund this issue'), h('a.btn', { href: b.fund.wallet, title: 'Opens the Action in a wallet that supports solana-action: links' }, 'Open in wallet'))
          : h('small.nofund', {}, 'Funded from the office'),
      ),
    ),
  );
  if (!doc.bounties.length) list.append(h('li.empty', {}, 'No open bounties right now.'));
}

function credit(doc: ShowcaseDoc) {
  const a = $('upstream') as HTMLAnchorElement;
  a.href = doc.credit.url;
  a.textContent = `${doc.credit.name} (AgentSystemLabs / ${doc.credit.author}), ${doc.credit.license}`;
}

let boardView = viewFromHash();
function paint(doc: ShowcaseDoc) {
  hero(doc);
  floor(doc);
  $('board').replaceChildren(
    board(doc, boardView, (v) => {
      boardView = v;
      const hash = `by=${v.by}&w=${v.window}${v.self ? '&self=1' : ''}`;
      if (location.hash.slice(1) !== hash) history.replaceState(null, '', `#${hash}`);
    }),
  );
  feed(doc);
  bounties(doc);
  $('verify').replaceChildren(verifyPanel(doc));
  credit(doc);
  document.body.classList.remove('loading');
}

let last = '';
async function load() {
  try {
    const res = await fetch('./showcase.json', { cache: 'no-cache', credentials: 'omit' });
    if (!res.ok) throw new Error(String(res.status));
    const text = await res.text();
    if (text === last) return;
    last = text;
    paint(JSON.parse(text) as ShowcaseDoc);
  } catch {
    if (!last) $('source').textContent = 'The board could not be loaded. Try again in a minute.';
  }
}

void load();
setInterval(() => {
  if (document.visibilityState === 'visible') void load();
}, REFRESH_MS);
