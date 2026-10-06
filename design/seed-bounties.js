// A seeded demo crew's bounties for the shots (SHOOT_EVAL="$(cat design/seed-bounties.js)"): five held in
// escrow on devnet (#43 waiting for approval with its PR merged, bound to the first unit; #46 blocked;
// #42 claimed; #41 and #45 funded), one paid, and two units with ERC-8004 records. Played in as if the
// server had sent them, so nothing touches a chain. Returns what it seeded.
(() => {
  const o = window.__office;
  const s = o.store;
  const f = s.floor;
  const units = [...s.workers.values()];
  const now = Date.now();
  const H = 3600e3;
  const b = (issue, usdc, phase, extra = {}) => ({ issue, nonce: 1, pda: `Pda${issue}`, amount: String(usdc * 1e6), decimals: 6, symbol: 'USDC', funders: 1, expiry: now + 5 * 24 * H, phase, txs: [{ kind: 'funded', sig: `Fund${issue}`, at: now - 3 * H }], ...extra });
  const items = [
    b(43, 75, 'awaiting-approval', { claimPr: 77, workerName: units[0]?.name }),
    b(46, 15, 'blocked', { claimPr: 81 }),
    b(42, 120, 'claimed', { claimPr: 78, workerName: units[1]?.name }),
    b(41, 250, 'open'),
    b(45, 40, 'open'),
    b(40, 50, 'released', { workerName: units[2]?.name, txs: [{ kind: 'paid', sig: 'Paid40', at: now - 2 * H }] }),
  ];
  window.__world.bounties.replay({ t: 'bounties', floor: f, state: { enabled: true, network: 'solana-devnet', items, blink: false } });
  return { floor: f, held: items.filter((i) => i.phase !== 'released').length, unit: units[0]?.name };
})()
