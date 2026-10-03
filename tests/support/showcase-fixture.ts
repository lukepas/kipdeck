// A showcase input for the tests: the indexer's recorded dataset (onchain/indexer/test/fixtures, a
// local-chain run) read as if from Base Sepolia and Solana devnet, spread over a public, a private
// and a hidden repository, with the live floor, open bounties and pull request titles the office
// would add. Every field the serializer must drop is planted here too, so a leak would show.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { RepEvent } from '../../src/shared/reputation.js';
import type { ShowcaseInput } from '../../src/shared/showcase.js';

const DATASET = path.join(import.meta.dirname, '..', '..', 'onchain', 'indexer', 'test', 'fixtures', 'dataset.json');

/** Strings that must never reach the public document. */
export const SECRETS = ['SECRET-PROMPT', 'TERMINAL-OUTPUT', '/Users/someone/project', 'ops@example.com', 'acct_42', 'ghp_FAKE0TOKEN', 'feature/secret-branch', 'AWS_SECRET', 'operator-alice'];

/** The fixed "now" of the fixture, seconds: a day after the dataset's last outcome. */
export const FIXTURE_NOW = 1790864000;

export function fixtureInput(): ShowcaseInput {
  const d = JSON.parse(readFileSync(DATASET, 'utf8')) as { events: RepEvent[]; agents: { agentId: string; tx: string }[]; sources: Record<string, any> };
  // Spread the outcomes over three repositories: PRs 9 to 11 in a private one, PR 12 in a hidden one.
  const events = d.events.map((e, i) => {
    const repo = e.pr === 12 ? 'acme/hidden' : e.pr >= 9 && e.pr <= 11 ? 'acme/secret' : e.repo;
    // Planted: what an office record might also carry, which must never go out.
    return { ...e, repo, prompt: 'SECRET-PROMPT', branch: 'feature/secret-branch', ...(i === 0 ? { operator: 'operator-alice', email: 'ops@example.com' } : {}) } as RepEvent;
  });
  return {
    asOf: FIXTURE_NOW,
    source: 'chain',
    base: 'base-sepolia',
    solana: 'devnet',
    events,
    agents: [
      { agentId: '1', harness: 'claude', label: 'sunny-otter', tx: d.agents[0].tx, accountId: 'acct_42', operator: 'operator-alice' },
      { agentId: '2', harness: 'codex', label: 'brave-heron', tx: d.agents[1].tx },
      { agentId: '3', harness: 'pi', label: 'jolly-panda', tx: d.agents[2].tx },
    ],
    titles: { 'acme/app#5': 'Fix the login redirect loop', 'acme/secret#9': 'Rotate the billing keys', 'acme/app#1': 'Add a health check' },
    repos: { 'acme/app': { private: false }, 'acme/secret': { private: true }, 'acme/hidden': { private: false } },
    visibility: { 'acme/hidden': 'hidden' },
    bounties: [
      { repo: 'acme/app', issue: 41, title: 'Flaky upload test', amount: '50000000', decimals: 6, symbol: 'USDC', expiry: (FIXTURE_NOW + 20 * 86400) * 1000, blink: true, funders: 3, pda: 'x', note: 'TERMINAL-OUTPUT' },
      { repo: 'acme/secret', issue: 7, title: 'Rotate the billing keys', amount: '15000000', decimals: 6, symbol: 'USDC', expiry: (FIXTURE_NOW + 5 * 86400) * 1000, blink: true },
      { repo: 'acme/hidden', issue: 3, title: 'Hidden work', amount: '1000000', decimals: 6, symbol: 'USDC', expiry: (FIXTURE_NOW + 5 * 86400) * 1000, blink: true },
    ],
    floor: [
      { name: 'Sunny Otter', color: '#4f86f7', harness: 'claude', state: 'working', prompt: 'SECRET-PROMPT', cwd: '/Users/someone/project', env: { AWS_SECRET: 'x' } },
      { name: 'Brave Heron', color: '#06d6a0', harness: 'codex', state: 'in-review', activity: 'TERMINAL-OUTPUT' },
      { name: 'Jolly Panda', color: '#ef476f', harness: 'pi', state: 'needs-input', token: 'ghp_FAKE0TOKEN' },
      { name: 'Quiet Lynx', color: '#ffd166', harness: 'cursor', state: 'idle' },
    ],
    floorAt: FIXTURE_NOW,
    officeUrl: 'https://office.example',
    verify: { ...d.sources, programId: 'JAH6ZioohUJmhnTESy5TpedBPLuiGviZLhYFyQsyVQs6', schemaUid: d.sources.schemaUid, attesters: d.sources.attesters, registrars: d.sources.registrars, identity: d.sources.identity, reputation: d.sources.reputation, eas: d.sources.eas },
  };
}
