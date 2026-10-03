// ⚙️ Settings > Bounties: your payout wallet (anyone), and for admins whether Proof of Merge bounties
// are on, the mock or Solana devnet (never a mainnet), the program, the mint, where the key files
// are, and which repositories the public "Fund this issue" Action takes funds for.
import type { ChainSettingsState } from '../../shared/protocol';
import type { Net } from '../net';
import { store } from '../state';
import { h } from './dom';
import { choiceRow } from './settings-rows';

const field = (label: string, input: HTMLElement) => h('label.bounty-field', { style: 'display:flex;flex-direction:column;gap:2px;margin:6px 0' }, h('small', {}, label), input);
const text = (placeholder: string) => h('input', { type: 'text', placeholder, spellcheck: 'false', autocomplete: 'off', style: 'width:100%' }) as HTMLInputElement;

/** The pane's settings, and what to call when the window closes. */
export function bountySettings(net: Net): { nodes: Node[]; off: () => void } {
  net.send({ t: 'bounty.settings.get' });
  const wallet = text('Your Solana devnet address');
  const walletSave = h('button.btn.primary', { type: 'button', onclick: () => net.send({ t: 'bounty.wallet', address: wallet.value.trim() || null }) }, 'Save');
  const walletNote = h('p.setting-note', {}, 'Bounties your workers\' pull requests claim are paid here, once a person with write access merges them and an admin approves. An address, never a key.');

  const s = (): ChainSettingsState | undefined => store.bountySettings;
  const patch = (p: Record<string, unknown>) => net.send({ t: 'bounty.settings', patch: p });
  const onRow = choiceRow('Bounties', [[true, '💰 On'], [false, 'Off']] as const, () => !!s()?.enabled, (v) => patch({ enabled: v }));
  const backendRow = choiceRow('Where', [['solana-devnet', 'Solana devnet'], ['mock', 'Mock (no chain)']] as const, () => s()?.backend ?? 'solana-devnet', (v) => patch({ backend: v }));
  const program = text('Program id (deployments/devnet.json)');
  const mint = text('Mint (default devnet USDC)');
  const attester = text('Attester key file');
  const approver = text('Approver key file');
  const approverWallet = text('Approver wallet address (recommended: no approver key on this machine)');
  const repos = text('owner/name, owner/other');
  const days = h('input', { type: 'number', min: '1', max: '365', style: 'width:6em' }) as HTMLInputElement;
  const titles = h('input', { type: 'checkbox' }) as HTMLInputElement;
  const save = h(
    'button.btn.primary',
    {
      type: 'button',
      onclick: () =>
        patch({
          programId: program.value.trim() || null,
          mint: mint.value.trim() || null,
          attesterKey: attester.value.trim() || undefined,
          approverKey: approver.value.trim() || undefined,
          approverWallet: approverWallet.value.trim() || null,
          actionRepos: repos.value.split(/[\s,]+/).filter(Boolean),
          expiryDays: Number(days.value) || undefined,
          actionTitles: titles.checked,
        }),
    },
    'Save',
  );
  const keysNote = h('p.setting-note');
  const adminBox = h('div', {}, onRow, backendRow, field('Program', program), field('Mint', mint), field('Attester key (signs claims, vouches for merges)', attester), field('Approver wallet (an admin signs each payout in this browser wallet)', approverWallet), field('Approver key (only without an approver wallet; read when an admin approves)', approver), field('Repositories the public Action funds', repos), field('Days a new bounty runs', days), h('label', {}, titles, ' Show issue titles on the public Action'), h('div.seg', { style: 'margin-top:8px' }, save), keysNote);
  const paint = () => {
    const st = s();
    wallet.value = st?.myWallet ?? '';
    adminBox.classList.toggle('hidden', !store.me.admin);
    if (!st) return;
    program.value = st.programId ?? '';
    mint.value = st.mint ?? '';
    attester.value = st.attesterKey;
    approver.value = st.approverKey;
    approverWallet.value = st.approverWallet ?? '';
    repos.value = st.actionRepos.join(', ');
    days.value = String(st.expiryDays);
    titles.checked = st.actionTitles;
    keysNote.textContent = `Testnet only: devnet, or the mock. ${st.attester ? `Attester ${st.attester}.` : 'The attester key isn\'t read yet.'} ${st.approver ? `Approver ${st.approver}.` : ''} Workers run as the same user as the office and could read these files: use dedicated testnet keys with nothing of value on them, and set an approver wallet so no file here can pay anyone.`;
  };
  paint();
  const offs = [store.on('bountySettings', paint), store.on('me', paint)];
  return {
    nodes: [h('div', {}, h('h4', {}, 'Your payout wallet'), h('div.webhook', {}, wallet, walletSave), walletNote), h('div', {}, h('h4', {}, 'Bounties (admins)'), adminBox)],
    off: () => offs.forEach((o) => o()),
  };
}
