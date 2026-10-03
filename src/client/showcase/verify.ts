// "Verify it yourself": the addresses the board is read from, the command that rebuilds it, and a
// button that asks the public testnet RPCs directly from this browser whether the latest
// attestation is valid on EAS and the escrow program is deployed. The page's policy (csp.ts) lets it
// talk to these two endpoints and the office, nothing else.
import type { ShowcaseDoc } from '../../shared/showcase';
import { h } from '../ui/dom';

export const BASE_SEPOLIA_RPC = 'https://sepolia.base.org';
export const DEVNET_RPC = 'https://api.devnet.solana.com';
/** isAttestationValid(bytes32) on EAS. */
const IS_VALID = '0xe30bb563';

async function rpc(url: string, method: string, params: unknown[]): Promise<any> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const body = await res.json();
  if (body.error) throw new Error(body.error.message ?? 'RPC error');
  return body.result;
}

/** Whether EAS on Base Sepolia says attestation `uid` is valid. */
export async function attestationValid(eas: string, uid: string): Promise<boolean> {
  const out = await rpc(BASE_SEPOLIA_RPC, 'eth_call', [{ to: eas, data: IS_VALID + uid.slice(2) }, 'latest']);
  return typeof out === 'string' && /1$/.test(out) && BigInt(out) === 1n;
}

/** Whether Solana devnet has `programId` deployed (an executable account). */
export async function programDeployed(programId: string): Promise<boolean> {
  const out = await rpc(DEVNET_RPC, 'getAccountInfo', [programId, { encoding: 'base64', dataSlice: { offset: 0, length: 0 } }]);
  return !!out?.value?.executable;
}

const line = (label: string, value: string | undefined, href?: string) =>
  value ? h('div.kv', {}, h('span.k', {}, label), href ? h('a.v', { href, target: '_blank', rel: 'noopener' }, value) : h('code.v', {}, value)) : null;

export function verifyPanel(doc: ShowcaseDoc): HTMLElement {
  const v = doc.verify;
  const latest = doc.events.find((e) => e.links.attestation);
  const uid = latest?.links.attestation?.split('/').pop();
  const out = h('ul.checks', { 'aria-live': 'polite' });
  const live = doc.network.base === 'base-sepolia' && doc.network.solana === 'devnet';
  const check = h('button.btn.primary', { type: 'button', disabled: !live, title: live ? '' : 'This data comes from a local test chain' }, 'Check on chain now');
  check.addEventListener('click', async () => {
    check.disabled = true;
    out.replaceChildren();
    const say = (ok: boolean | undefined, text: string) => out.append(h('li', { class: ok === undefined ? 'wait' : ok ? 'ok' : 'no' }, `${ok === undefined ? '...' : ok ? 'Yes' : 'No'}: ${text}`));
    const jobs: Promise<void>[] = [];
    if (uid && v.eas) jobs.push(attestationValid(v.eas, uid).then((ok) => say(ok, `EAS on Base Sepolia says the latest attestation (${uid.slice(0, 10)}...) is valid`), () => say(false, 'Base Sepolia did not answer')));
    if (v.programId) jobs.push(programDeployed(v.programId).then((ok) => say(ok, `the escrow program is deployed on Solana devnet`), () => say(false, 'Solana devnet did not answer')));
    if (!jobs.length) say(false, 'nothing to check yet');
    await Promise.all(jobs);
    check.disabled = false;
  });
  const cmd = h('code.cmd', {}, v.command);
  const copy = h('button.btn', { type: 'button' }, 'Copy');
  copy.addEventListener('click', () => {
    void navigator.clipboard?.writeText(v.command).then(() => (copy.textContent = 'Copied'));
  });
  return h(
    'div.verify',
    {},
    h('p', {}, 'Nothing here needs trusting the office. Every row is an attestation on Base Sepolia or a payout on Solana devnet, and the board is rebuilt from those alone.'),
    h(
      'div.kvs',
      {},
      line('Escrow program (Solana devnet)', v.programId, v.programUrl),
      line('Attestation schema (EAS)', v.schemaUid, v.schemaUrl),
      line('EAS contract', v.eas),
      line('ERC-8004 identity registry', v.identity, v.identityUrl),
      line('ERC-8004 reputation registry', v.reputation, v.reputationUrl),
      ...v.attesters.map((a) => line('Trusted attester', a, doc.network.base === 'base-sepolia' ? `https://sepolia.basescan.org/address/${a}` : undefined)),
    ),
    h('p.small', {}, 'Rebuild the whole board from the chain, with no office and no keys:'),
    h('div.cmdrow', {}, cmd, copy),
    h('div.cmdrow', {}, check),
    out,
  );
}
