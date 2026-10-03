// The read-only agent_reputation MCP tool over the recorded dataset: its three tools, and what it
// refuses. It holds no keys and has nothing that writes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { TOOLS, datasetLoader, handleMcp } from '../src/mcp.js';
import type { Dataset } from '../src/indexer.js';

const ds = JSON.parse(readFileSync(path.join(import.meta.dirname, 'fixtures', 'dataset.json'), 'utf8')) as Dataset;
const { asOf } = JSON.parse(readFileSync(path.join(import.meta.dirname, 'fixtures', 'scenario.json'), 'utf8')) as { asOf: number };
const io = { dataset: async () => ds, now: () => asOf * 1000 };
const call = async (name: string, args: Record<string, unknown>) => ((await handleMcp({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, io)) as { result: { content: { text: string }[]; structuredContent?: any; isError?: boolean } }).result;

test('it lists three read-only tools', async () => {
  const r = (await handleMcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, io)) as { result: { tools: typeof TOOLS } };
  assert.deepEqual(r.result.tools.map((t) => t.name), ['get_agent_reputation', 'list_leaderboard', 'verify_merge']);
  assert.ok(r.result.tools.every((t) => t.annotations.readOnlyHint));
  const init = (await handleMcp({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, io)) as { result: { serverInfo: { name: string } } };
  assert.equal(init.result.serverInfo.name, 'agent_reputation');
});

test("get_agent_reputation gives an agent's record, or a harness's", async () => {
  const a = await call('get_agent_reputation', { agentId: '1' });
  assert.equal(a.structuredContent.merged, 6);
  assert.equal(a.structuredContent.card, 'https://office.example/agents/1.json');
  assert.match(a.content[0].text, /^Agent 1 \(claude\): 6 merged by others/);
  const h = await call('get_agent_reputation', { harness: 'codex', window: '30d' });
  assert.deepEqual([h.structuredContent.merged, h.structuredContent.selfMerged, h.structuredContent.mergeRate], [1, 2, null]);
  assert.equal((await call('get_agent_reputation', {})).isError, true);
  assert.equal((await call('get_agent_reputation', { agentId: '1', window: 'forever' })).isError, true);
  assert.match((await call('get_agent_reputation', { agentId: '42' })).content[0].text, /No merges on record/);
});

test('list_leaderboard ranks over a window, per harness by default', async () => {
  const r = await call('list_leaderboard', {});
  assert.deepEqual(r.structuredContent.rows.map((x: { key: string }) => x.key), ['claude', 'codex', 'pi']);
  assert.match(r.content[0].text, /^1\. claude: 5 merged by others/);
  const byAgent = await call('list_leaderboard', { by: 'agent', window: 'all' });
  assert.equal(byAgent.structuredContent.rows[0].merged, 6);
});

test('verify_merge gives the attestation UID and the Solana payout of one pull request', async () => {
  const r = await call('verify_merge', { repo: 'Acme/App', pr: 3 });
  assert.equal(r.structuredContent.merged, true);
  assert.match(r.structuredContent.attestationUid, /^0x[0-9a-f]{64}$/);
  assert.match(r.structuredContent.solanaTx, /^[1-9A-HJ-NP-Za-km-z]{60,90}$/);
  assert.match(r.content[0].text, /bounty paid on Solana in/);
  const reverted = await call('verify_merge', { repo: 'acme/app', pr: 2 });
  assert.equal(reverted.structuredContent.reverted, true);
  const closed = await call('verify_merge', { repo: 'acme/app', pr: 6 });
  assert.deepEqual([closed.structuredContent.merged, closed.structuredContent.closedUnmerged], [false, true]);
  assert.match((await call('verify_merge', { repo: 'acme/app', pr: 404 })).content[0].text, /No proof of merge/);
  assert.equal((await call('verify_merge', { repo: 'not a repo', pr: 3 })).isError, true);
});

test('the dataset loader takes the office public endpoint, refuses plain http elsewhere, and checks the format', async () => {
  const seen: string[] = [];
  const fetchFn = (async (url: string) => {
    seen.push(url);
    return new Response(JSON.stringify(ds));
  }) as unknown as typeof fetch;
  const load = datasetLoader({ officeUrl: 'https://office.example/' }, async () => '', fetchFn);
  assert.equal((await load()).events.length, ds.events.length);
  await load();
  assert.deepEqual(seen, ['https://office.example/api/public/dataset.json']);
  await assert.rejects(datasetLoader({ url: 'http://example.com/dataset.json' }, async () => '', fetchFn)(), /must be https/);
  await assert.rejects(datasetLoader({ file: 'x.json' }, async () => '{"schema":"nope","events":[]}')(), /not a Proof of Merge dataset/);
});
