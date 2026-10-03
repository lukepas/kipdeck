// A queue task someone outside the office paid for over x402 (see server/x402/): what it says on the
// queue board, and the admin's buttons. It waits, held, until an admin approves it (its worker then
// runs on the approver's sign-ins) or turns it down; a turned-down task is refunded by hand from the
// office's wallet, and the admin records that transaction here so it shows on the timeline.
import type { QueueTask } from '../../shared/protocol';
import { explorerLink } from '../../shared/protocol';
import type { Net } from '../net';
import { store } from '../state';
import { h } from './dom';
import { confirmDialog, openPrompt } from './prompt';

const short = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a);
const NETWORK: Record<string, string> = { 'eip155:84532': 'Base Sepolia', 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1': 'Solana devnet' };

/** The line about its payment, and its buttons, for a paid task's row; nothing for any other task. */
export function paidParts(t: QueueTask, net: Net): { meta: string[]; buttons: HTMLElement[] } {
  const p = t.paid;
  if (!p) return { meta: [], buttons: [] };
  const meta = [`💰 ${short(p.payer)} paid ${p.amount} test USDC on ${NETWORK[p.network] ?? p.network}${p.tx ? '' : ' (settling)'}`];
  const buttons: HTMLElement[] = [];
  const link = (href: string | undefined, text: string) => (explorerLink(href) ? h('a.btn', { href, target: '_blank', rel: 'noopener noreferrer' }, text) : null);
  const paidLink = link(p.explorer, '🔗 Payment');
  if (paidLink) buttons.push(paidLink);
  const admin = store.me.admin;
  if (t.held) {
    meta.push(admin ? 'waits for you to approve it' : 'waits for an admin to approve it');
    if (admin && p.tx) {
      buttons.push(h('button.btn.primary', { type: 'button', title: 'Let a worker start on it, on your sign-ins', onclick: () => confirmDialog('Approve this paid task?', `A worker will run this prompt from someone outside the office, on your sign-ins:\n\n${t.prompt.slice(0, 600)}`, 'Approve', () => net.send({ t: 'queue.approve', taskId: t.id })) }, '✓ Approve'));
      buttons.push(h('button.btn', { type: 'button', title: 'Turn it down: the payment is then refunded by hand', onclick: () => confirmDialog('Turn this paid task down?', `${short(p.payer)} paid ${p.amount} test USDC for it. Refund that from the office's wallet, then record the transaction here.`, 'Turn down', () => net.send({ t: 'queue.reject', taskId: t.id })) }, 'Turn down'));
    }
  } else if (t.outcome === 'rejected') {
    if (p.refundTx) {
      meta.push('refunded');
      const r = link(p.refundExplorer, '🔗 Refund');
      if (r) buttons.push(r);
    } else {
      meta.push(`a refund of ${p.amount} test USDC is owed`);
      if (admin) buttons.push(h('button.btn', { type: 'button', title: 'Record the refund you sent from the office wallet', onclick: () => openPrompt({ title: 'Record the refund', subtitle: `The transaction that sent ${p.amount} test USDC back to ${p.payer} on ${NETWORK[p.network] ?? p.network}.`, placeholder: p.network.startsWith('eip155') ? '0x... transaction hash' : 'Transaction signature', submitLabel: 'Record', onSubmit: (tx) => net.send({ t: 'queue.refunded', taskId: t.id, tx: tx.trim() }) }) }, '↩️ Record refund'));
    }
  }
  return { meta, buttons };
}
