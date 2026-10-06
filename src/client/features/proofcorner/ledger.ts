// The Proof corner's ledger: the screen on the west wall over the escrow vault and the plinth, a table
// of the floor's bounties in escrow on devnet (issue, amount, where each stands, who has it, what's
// next) beside a table of the units' ERC-8004 records (merges, merge rate, reverts). The words under
// the vault and the plinth said only "ESCROW DEVNET" and "ERC-8004"; this says what's in them.
// ledgerView is pure (tests/tables.test.ts); paintLedger draws it on the ledger's screen.
import type { BountiesState, BountyPhase, BountyView, ReputationState } from '../../../shared/protocol';
import { sumUnits, tokenUnits } from '../../../shared/money';
import { timeLeft } from '../../../shared/bounty-text';
import { ago } from '../../../shared/rowtext';
import { PANEL } from '../boards/world';
import { INK, MONO, UI, ground, type Screen } from '../boards/screen';
import { emptyBox, label, table, type Chip, type TableRow } from '../boards/table';
import type { FarCount, FarSpec } from '../boards/far';

/** Where a phase sorts on the ledger: what waits for a person first, then what's live, then the past. */
const ORDER: Record<BountyPhase, number> = { 'awaiting-approval': 0, blocked: 1, paying: 2, claimed: 3, open: 4, released: 5, refunded: 6, cancelled: 7, expired: 8 };
/** Still in escrow: counted in the vault's total. */
const HELD: ReadonlySet<BountyPhase> = new Set(['open', 'claimed', 'awaiting-approval', 'blocked', 'paying']);

/** A phase as the ledger's chip: proof's violet for the chain's own steps, a state's hue only for that state. */
export function phaseChip(p: BountyPhase): Chip {
  switch (p) {
    case 'awaiting-approval':
      return { text: 'approve', hue: PANEL.review, glyph: 'review', strong: true };
    case 'blocked':
      return { text: 'blocked', hue: PANEL.stuck, glyph: 'stuck' };
    case 'paying':
      return { text: 'paying', hue: PANEL.proof };
    case 'claimed':
      return { text: 'claimed', hue: PANEL.proof };
    case 'open':
      return { text: 'open', hue: INK.dim, glyph: 'queued' };
    case 'released':
      return { text: 'paid', hue: PANEL.settled, glyph: 'done' };
    default:
      return { text: p, hue: INK.muted };
  }
}

/** The last column: what's next for a bounty, or when it was settled. */
function detail(b: BountyView, now: number): string {
  if (b.phase === 'open') return timeLeft(b.expiry, now);
  if (b.phase === 'claimed') return b.claimPr ? `PR #${b.claimPr}` : timeLeft(b.expiry, now);
  if (b.phase === 'awaiting-approval' || b.phase === 'paying') return b.claimPr ? `PR #${b.claimPr}` : '';
  const at = b.txs.length ? b.txs[b.txs.length - 1].at : 0;
  return at ? `${ago(now - at)} ago` : '';
}

export interface LedgerView {
  /** Bounties are on for this floor. */
  on: boolean;
  network: string;
  /** Rows sorted by what needs a person first. */
  bounties: TableRow[];
  /** In escrow now: how many, and the total ("75.00 USDC"). */
  held: { count: number; total: string };
  /** Paid out: how many, and the total ("50.00 USDC"). */
  paid: number;
  paidTotal: string;
  /** Reputation is on. */
  rep: boolean;
  agents: TableRow[];
  /** Attestations the office still owes the chain. */
  owed: number;
}

/** The ledger's two tables from the floor's bounties and the reputation records. Pure. */
export function ledgerView(b: BountiesState | undefined, rep: ReputationState | undefined, now = Date.now()): LedgerView {
  const items = b?.enabled ? [...b.items] : [];
  items.sort((x, y) => ORDER[x.phase] - ORDER[y.phase] || (ORDER[x.phase] >= 5 ? lastAt(y) - lastAt(x) : x.issue - y.issue));
  const held = items.filter((i) => HELD.has(i.phase));
  const sum = sumUnits(held);
  const symbol = held[0]?.symbol ?? 'USDC';
  const bounties = items.map((i): TableRow => ({
    cells: [`#${i.issue}`, `${tokenUnits(i.amount, i.decimals)} ${i.symbol}`, { chip: phaseChip(i.phase) }, i.workerName ?? (i.phase === 'open' ? 'unclaimed' : '--'), detail(i, now)],
    hue: i.phase === 'awaiting-approval' ? PANEL.review : i.phase === 'blocked' ? PANEL.stuck : undefined,
    quiet: ORDER[i.phase] >= 5,
  }));
  const agents = rep?.enabled ? [...rep.agents].sort((x, y) => (y.stats?.merged ?? 0) - (x.stats?.merged ?? 0) || x.label.localeCompare(y.label)) : [];
  return {
    on: !!b?.enabled,
    network: b?.network === 'mock' ? 'mock' : 'devnet',
    bounties,
    held: { count: held.length, total: `${tokenUnits(sum.units, sum.decimals)} ${symbol}` },
    paid: items.filter((i) => i.phase === 'released').length,
    paidTotal: (() => {
      const paid = items.filter((i) => i.phase === 'released');
      const s = sumUnits(paid);
      return `${tokenUnits(s.units, s.decimals)} ${paid[0]?.symbol ?? symbol}`;
    })(),
    rep: !!rep?.enabled,
    agents: agents.map((a): TableRow => {
      const s = a.stats;
      return {
        cells: [a.label, a.agentId ? `#${a.agentId}` : { text: '--', color: INK.muted }, String(s?.merged ?? 0), s?.mergeRate == null ? '--' : `${Math.round(s.mergeRate * 100)}%`, String(s?.reverted ?? 0)],
        quiet: !a.workers.length,
      };
    }),
    owed: rep?.owed ?? 0,
  };
}

/**
 * The ledger from across the deck (boards/far.ts): what's held in escrow, what waits for your approval,
 * what's blocked, what's been paid, and how many units have ERC-8004 records. Pure.
 */
export function ledgerFar(v: LedgerView): FarSpec {
  const title = v.network === 'mock' ? 'Proof  mock chain' : 'Proof  devnet test usdc';
  if (!v.on) return { title, hue: PANEL.proof, counts: [], empty: 'Bounties are off' };
  const chips = v.bounties.map((r) => r.cells[2]).filter((c): c is { chip: Chip } => !!c && typeof c === 'object' && 'chip' in c);
  const n = (text: string) => chips.filter((c) => c.chip.text === text).length;
  // Whole amounts without their cents, so the figure is as big as the panel allows.
  const counts: FarCount[] = [{ n: v.held.total.replace(/ \S+$/, '').replace(/\.00$/, ''), word: `${v.held.count} in escrow`, hue: PANEL.proof }];
  if (n('approve')) counts.push({ n: String(n('approve')), word: 'to approve', hue: PANEL.review, glyph: 'review' });
  if (n('blocked')) counts.push({ n: String(n('blocked')), word: 'blocked', hue: PANEL.stuck, glyph: 'stuck' });
  counts.push({ n: String(v.paid), word: 'paid', hue: PANEL.settled, glyph: 'done' });
  if (v.rep && counts.length < 4) counts.push({ n: String(v.agents.length), word: 'erc-8004', hue: PANEL.proof });
  return { title, hue: PANEL.proof, counts: counts.slice(0, 4) };
}

const lastAt = (b: BountyView) => (b.txs.length ? b.txs[b.txs.length - 1].at : 0);

/** The ledger's canvas units a metre: read from across the Proof corner, a few metres off. */
export const LEDGER_UNITS = 400;

/**
 * Paints `v` on the ledger's screen: one header line (PROOF, the network, what's held and paid; the
 * ERC-8004 records and what's owed), the escrow table on the left and the records on the right, a
 * violet hairline between.
 */
export function paintLedger(s: Screen, v: LedgerView) {
  const { g, W, H } = s;
  ground(g, W, H);
  const pad = 26;
  const split = Math.round(W * 0.6);
  // One header line over both tables: PROOF and the network, what's held and paid at the end of the
  // escrow's half; ERC-8004 and what's owed over the records' half.
  g.fillStyle = PANEL.proof;
  g.fillRect(0, 0, W, 5);
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.fillStyle = INK.text;
  g.font = UI(700, 40);
  g.letterSpacing = '5px';
  g.fillText('PROOF', pad, 38);
  const pw = g.measureText('PROOF').width;
  g.letterSpacing = '0px';
  // What's held and paid at the end of the escrow's half, measured first so the network's label never runs into it.
  g.textAlign = 'right';
  g.font = MONO(26, 600);
  g.fillStyle = INK.text;
  // The token is said once, by the label ("TEST USDC"): the sums are amounts alone.
  const bare = (t: string) => t.replace(/ \S+$/, '');
  const sums = v.on ? `${bare(v.held.total)} held  ${v.paid ? `${bare(v.paidTotal)} paid` : '0 paid'}` : '';
  if (sums) g.fillText(sums, split - 24, 39);
  const sumsW = sums ? g.measureText(sums).width : 0;
  const lx = pad + pw + 26;
  label(g, v.network === 'mock' ? 'mock chain' : 'devnet  test usdc', lx, 39, 22, 'left', PANEL.proof, split - 24 - sumsW - 24 - lx);
  g.textAlign = 'left';
  const rx = split + 24;
  const rw = W - pad - rx;
  label(g, 'ERC-8004', rx, 39, 24, 'left', PANEL.proof);
  if (v.owed) {
    g.textAlign = 'right';
    g.font = MONO(28, 600);
    g.fillStyle = INK.dim;
    g.fillText(`${v.owed} owed`, W - pad, 39);
    g.textAlign = 'left';
  }
  g.fillStyle = INK.lineStrong;
  g.fillRect(pad, 70, W - pad * 2, 3);
  // A violet hairline between the two halves.
  g.fillStyle = PANEL.proof;
  g.globalAlpha = 0.45;
  g.fillRect(split, 14, 2, H - 26);
  g.globalAlpha = 1;

  const top = 82;
  const h = H - top - 8;
  const size = 30;
  const rowH = 50;
  const bx = pad;
  const bw = split - pad - 24;
  if (!v.on) emptyBox(g, bx, top, bw, h, 'Bounties are off', 'An admin turns them on in Settings, Bounties', size);
  else if (!v.bounties.length) emptyBox(g, bx, top, bw, h, 'Nothing in escrow', 'Fund an issue from the Issues board', size);
  else
    table(g, {
      x: bx,
      y: top,
      w: bw,
      h,
      size,
      rowH,
      columns: [
        { label: 'Issue', w: 0.75, mono: true },
        { label: 'Amount', w: 1.55, align: 'right', mono: true },
        { label: 'State', w: 1.4 },
        { label: 'Unit', w: 1.25 },
        { label: 'Next', w: 1.1, align: 'right', mono: true },
      ],
      rows: v.bounties,
    });
  if (!v.rep) emptyBox(g, rx, top, rw, h, 'Reputation is off', 'Start the office with --reputation', size);
  else if (!v.agents.length) emptyBox(g, rx, top, rw, h, 'No records yet', 'A merge by a person writes one', size);
  else
    table(g, {
      x: rx,
      y: top,
      w: rw,
      h,
      size,
      rowH,
      columns: [
        { label: 'Agent', w: 1.6 },
        { label: 'ID', w: 0.7, mono: true },
        { label: 'Merged', w: 0.95, align: 'right', mono: true },
        { label: 'Rate', w: 0.75, align: 'right', mono: true },
        { label: 'Rev', w: 0.55, align: 'right', mono: true },
      ],
      rows: v.agents,
    });
  s.texture.needsUpdate = true;
}
