// The whole exact-scheme payment on a real chain, locally: TestUSDC on anvil, a payer signing with
// @x402/evm, and @x402/evm's own facilitator settling it with transferWithAuthorization.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { chainFacilitator, serveFacilitator } from '../src/facilitator.js';
import type { PaymentRequired } from '../src/networks.js';
import { createPayment } from '../src/payer.js';
import { ANVIL_KEY, deployTestUsdc, devWallet, startAnvil, testUsdcArtifact, type Anvil } from './support/anvil.js';

let anvil: Anvil;
let token: `0x${string}`;
const payer = privateKeyToAccount(generatePrivateKey());
const office = privateKeyToAccount(generatePrivateKey());

before(async () => {
  anvil = await startAnvil();
  token = await deployTestUsdc(anvil.rpc);
  const w = devWallet(anvil.rpc);
  const { abi } = testUsdcArtifact();
  await w.waitForTransactionReceipt({ hash: await w.writeContract({ address: token, abi, functionName: 'mint', args: [payer.address, 1_000_000n] }) });
});

after(async () => {
  await anvil?.stop();
});

const balance = async (who: `0x${string}`) => (await devWallet(anvil.rpc).readContract({ address: token, abi: testUsdcArtifact().abi, functionName: 'balanceOf', args: [who] })) as bigint;

test('a payment settles on anvil through @x402/evm, once', async () => {
  const facilitator = chainFacilitator({ account: privateKeyToAccount(ANVIL_KEY), rpc: anvil.rpc, chainId: 31337 });
  const served = await serveFacilitator(facilitator);
  try {
    const required: PaymentRequired = {
      x402Version: 2,
      resource: { url: 'http://127.0.0.1/api/x402/task' },
      accepts: [{ scheme: 'exact', network: 'eip155:31337', amount: '100000', asset: token, payTo: office.address, maxTimeoutSeconds: 300, extra: { name: 'USDC', version: '2' } }],
    };
    const payment = await createPayment(required, required.accepts[0], payer);
    const body = JSON.stringify({ x402Version: 2, paymentPayload: payment, paymentRequirements: required.accepts[0] });
    const verified = await (await fetch(`${served.url}/verify`, { method: 'POST', body })).json();
    assert.equal(verified.isValid, true, JSON.stringify(verified));
    const settled = await (await fetch(`${served.url}/settle`, { method: 'POST', body })).json();
    assert.equal(settled.success, true, JSON.stringify(settled));
    assert.match(settled.transaction, /^0x[0-9a-f]{64}$/);
    assert.equal(await balance(office.address), 100_000n);
    assert.equal(await balance(payer.address), 900_000n);
    // The token itself refuses the same authorization twice.
    const again = await (await fetch(`${served.url}/settle`, { method: 'POST', body })).json();
    assert.equal(again.success, false);
    assert.equal(await balance(office.address), 100_000n);
  } finally {
    await served.close();
  }
});

test('a payment for more than the payer holds is refused before anything is sent', async () => {
  const facilitator = chainFacilitator({ account: privateKeyToAccount(ANVIL_KEY), rpc: anvil.rpc, chainId: 31337 });
  const required: PaymentRequired = {
    x402Version: 2,
    resource: { url: 'http://127.0.0.1/api/x402/task' },
    accepts: [{ scheme: 'exact', network: 'eip155:31337', amount: '5000000', asset: token, payTo: office.address, maxTimeoutSeconds: 300, extra: { name: 'USDC', version: '2' } }],
  };
  const payment = await createPayment(required, required.accepts[0], payer);
  const verified = await facilitator.verify({ x402Version: 2, paymentPayload: payment, paymentRequirements: required.accepts[0] });
  assert.equal(verified.isValid, false);
});
