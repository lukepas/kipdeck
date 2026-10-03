// Proof of Merge bounties on the issue board: a chip on each issue card with a bounty (how much, where
// it stands, how long it has left), the Fund window (a browser wallet signs; or the Blink link to
// share), and the badge over a worker holding a claimed bounty. Devnet only.
import './bounty.css';
import type { BountyPhase, BountyView } from '../../shared/protocol';
import { tokenAmount } from '../../shared/review';
import type { Net } from '../net';
import { store } from '../state';
import { h, openModal, toast } from './dom';
import { connect, signAndSend, solanaWallets, type StdAccount, type StdWallet } from './wallet';

const PHASE_LABEL: Record<BountyPhase, string> = {
  open: 'open',
  claimed: 'claimed',
  'awaiting-approval': 'merged: waits for approval',
  blocked: 'blocked',
  paying: 'paying out',
  released: 'paid',
  refunded: 'refunded',
  cancelled: 'cancelled',
  expired: 'expired',
};

/** The floor you're on's bounties, when they're on. */
export function floorBounties() {
  const s = store.floor ? store.bounties[store.floor] : undefined;
  return s?.enabled ? s : undefined;
}

export function bountyOf(issue: number): BountyView | undefined {
  return floorBounties()?.items.find((b) => b.issue === issue);
}

/** "3 d left", "5 h left", "expired". */
export function timeLeft(expiry: number, now = Date.now()): string {
  const ms = expiry - now;
  if (ms <= 0) return 'expired';
  const h = Math.floor(ms / 3_600_000);
  return h >= 48 ? `${Math.floor(h / 24)} d left` : h >= 1 ? `${h} h left` : `${Math.max(1, Math.floor(ms / 60_000))} min left`;
}

export const amountOf = (b: BountyView) => `${tokenAmount(b.amount, b.decimals)} ${b.symbol}`;

/** The chip on an issue card: the bounty's amount, phase and time left, and a Fund button while it takes funds. */
export function bountyChip(issue: number, net: Net): HTMLElement | '' {
  const s = floorBounties();
  if (!s) return '';
  const b = s.items.find((x) => x.issue === issue);
  const live = !b || b.phase === 'open' || b.phase === 'claimed';
  const fund = live
    ? h('button.bounty-fund', { type: 'button', title: 'Put devnet USDC on this issue', onclick: ((e: Event) => (e.stopPropagation(), openFund(issue, net))) as EventListener }, b ? '+ Fund' : '💰 Fund')
    : null;
  if (!b) return h('span.bounty-chip.none', {}, fund);
  const left = b.phase === 'open' || b.phase === 'claimed' ? ` · ${timeLeft(b.expiry)}` : '';
  const pr = b.claimPr ? ` · PR #${b.claimPr}` : '';
  return h('span.bounty-chip', { class: b.phase, title: b.note ?? `${amountOf(b)} in escrow on ${s.network}` }, `💰 ${amountOf(b)} · ${PHASE_LABEL[b.phase]}${pr}${left}`, fund);
}

/** The badge over a worker holding a claimed bounty on your floor, or undefined. */
export function workerBounty(workerId: string): string | undefined {
  const b = floorBounties()?.items.find((x) => x.workerId === workerId && (x.phase === 'claimed' || x.phase === 'awaiting-approval' || x.phase === 'paying'));
  return b ? `💰 ${amountOf(b)}` : undefined;
}

/** The public Action's URL for an issue, and a dial.to link that renders it on devnet. */
export function blinkLinks(repo: string, issue: number): { action: string; dial: string } {
  const action = `${location.origin}/api/actions/fund?repo=${encodeURIComponent(repo)}&issue=${issue}`;
  return { action, dial: `https://dial.to/?action=${encodeURIComponent(`solana-action:${action}`)}&cluster=devnet` };
}

/** Funds waiting for their transaction from the office, by issue: the wallet that will sign it. */
const pending = new Map<number, { wallet: StdWallet; account: StdAccount; amount: string }>();

/** The office built the transaction: the wallet signs and sends it. */
export async function prepared(m: { issue: number; tx?: string; error?: string }) {
  const p = pending.get(m.issue);
  pending.delete(m.issue);
  if (m.error) return void toast(`💰 ${m.error}`, 'warn');
  if (!m.tx) return void toast(`💰 Funded #${m.issue} on the mock`);
  if (!p) return;
  try {
    const sig = await signAndSend(p.wallet, p.account, m.tx);
    toast(`💰 Sent ${p.amount} to #${m.issue}'s bounty: https://explorer.solana.com/tx/${sig}?cluster=devnet`);
  } catch (err) {
    toast(`💰 ${p.wallet.name} didn't send it: ${(err as Error).message}`, 'warn');
  }
}

/**
 * An admin approved a payout and the office answered with the release its attester signed: the
 * approver's wallet (the address the office named) adds its signature, pays the fee and sends it.
 * The office then looks at the chain, which says whether it paid.
 */
export async function approved(m: { issue: number; floor?: string; tx?: string; approver?: string }, net: Net) {
  if (!m.tx || !m.approver) return;
  const wallets = solanaWallets();
  const w = wallets.find((x) => x.accounts.some((a) => a.address === m.approver)) ?? wallets[0];
  if (!w) return void toast(`💰 #${m.issue}: no Solana wallet in this browser to sign as the approver (${m.approver})`, 'warn');
  try {
    const account = w.accounts.find((a) => a.address === m.approver) ?? (await connect(w));
    if (account.address !== m.approver) return void toast(`💰 #${m.issue}: ${w.name} is on ${account.address}, not the approver wallet ${m.approver}`, 'warn');
    const sig = await signAndSend(w, account, m.tx);
    net.send({ t: 'bounty.release.sent', issue: m.issue, ...(m.floor ? { floor: m.floor } : {}), sig });
    toast(`💸 Payout of #${m.issue}'s bounty sent: https://explorer.solana.com/tx/${sig}?cluster=devnet`);
  } catch (err) {
    toast(`💰 ${w.name} didn't send the payout: ${(err as Error).message}`, 'warn');
  }
}

export function openFund(issue: number, net: Net) {
  const s = floorBounties();
  if (!s) return;
  const b = s.items.find((x) => x.issue === issue);
  const amount = h('input', { type: 'text', inputmode: 'decimal', value: '20', 'aria-label': 'Amount', spellcheck: 'false', autocomplete: 'off' }) as HTMLInputElement;
  const presets = h('div.seg', {}, ...['5', '20', '50'].map((v) => h('button.btn', { type: 'button', onclick: () => (amount.value = v) }, `${v} USDC`)));
  const note = h('p.setting-note');
  const list = h('div.bounty-wallets');
  const mock = s.network === 'mock';
  const fundWith = async (w: StdWallet | undefined) => {
    const text = amount.value.trim();
    if (!/^\d{1,6}(\.\d{1,6})?$/.test(text) || Number(text) <= 0) return amount.focus();
    try {
      if (!w) {
        // The mock has no wallet to sign: any address stands for you.
        net.send({ t: 'bounty.fund.prepare', issue, amount: text, wallet: store.bountySettings?.myWallet ?? '11111111111111111111111111111112' });
      } else {
        const account = await connect(w);
        pending.set(issue, { wallet: w, account, amount: `${text} USDC` });
        net.send({ t: 'bounty.fund.prepare', issue, amount: text, wallet: account.address });
      }
      modal.close();
    } catch (err) {
      note.textContent = `${w?.name ?? 'The wallet'} didn't connect: ${(err as Error).message}`;
    }
  };
  const wallets = solanaWallets();
  if (mock) list.append(h('button.btn.primary', { type: 'button', onclick: () => void fundWith(undefined) }, '💰 Fund on the mock'));
  else for (const w of wallets) list.append(h('button.btn.primary', { type: 'button', onclick: () => void fundWith(w) }, h('img', { src: w.icon, alt: '', width: '18', height: '18' }), ` ${w.name}`));
  if (!mock && !wallets.length) list.append(h('p.setting-note', {}, 'No Solana wallet in this browser (Phantom, Backpack or Solflare, set to devnet). Share the Blink below instead.'));
  const links = s.blink && s.repo ? blinkLinks(s.repo, issue) : undefined;
  const copy = (text: string, what: string) => () => void navigator.clipboard?.writeText(text).then(() => toast(`Copied the ${what}`), () => toast(text));
  const close = h('button.btn.close', { 'aria-label': 'Close' }, '✕');
  const el = h(
    'div.modal.bounty-modal',
    { role: 'dialog', 'aria-label': `Fund issue #${issue}` },
    h('header', {}, h('h2', {}, `💰 Fund #${issue}`), close),
    h(
      'div.bounty-body',
      {},
      h('p', {}, b ? `${amountOf(b)} from ${b.funders} funder${b.funders === 1 ? '' : 's'} so far, ${PHASE_LABEL[b.phase]}, ${timeLeft(b.expiry)}.` : 'No bounty on this issue yet: funding it opens one.'),
      h('p.setting-note', {}, `Devnet ${mock ? 'mock' : 'USDC'}, no real money. It's paid to the agent operator only when a person with write access merges the office's pull request for this issue and an office admin approves; otherwise you can take yours back after the expiry.`),
      h('label', {}, 'Amount (USDC) ', amount),
      presets,
      list,
      note,
      links ? h('div.seg', {}, h('button.btn', { type: 'button', onclick: copy(links.dial, 'Blink (dial.to) link') }, '🔗 Copy the Blink'), h('button.btn', { type: 'button', onclick: copy(links.action, 'Action URL') }, 'Copy the Action URL')) : null,
    ),
  );
  const modal = openModal(el, { doing: '💰 funding a bounty' });
  close.addEventListener('click', () => modal.close());
  amount.focus();
  amount.select();
}
