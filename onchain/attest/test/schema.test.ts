import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { OUTCOME, SCHEMA, ZERO32, decodeMerge, encodeMerge, mergedByHashOf, recordProblem, schemaUid, type MergeRecord } from '../src/schema.js';
import { assertBaseSepolia, WrongChainError } from '../src/chain.js';
import { sdkSchemaUid } from '../scripts/lib.js';

const sdk = createRequire(import.meta.url)('@ethereum-attestation-service/eas-sdk') as { SchemaEncoder: new (s: string) => { encodeData(items: { name: string; type: string; value: unknown }[]): string } };

const rec: MergeRecord = { repo: 'acme/app', pr: 42, mergeSha: 'ab'.repeat(20), mergedByHash: mergedByHashOf(583231), harness: 'claude', agentId: 7n, outcome: OUTCOME.merged, solanaTx: '5'.repeat(88), mergedAt: 1_790_000_000 };

test('the schema UID is the one the EAS SDK computes', () => {
  assert.equal(schemaUid().toLowerCase(), sdkSchemaUid().toLowerCase());
});

test('attestation data is byte for byte what the EAS SDK encodes', () => {
  const enc = new sdk.SchemaEncoder(SCHEMA);
  const theirs = enc.encodeData([
    { name: 'repo', type: 'string', value: rec.repo },
    { name: 'pr', type: 'uint64', value: BigInt(rec.pr) },
    { name: 'mergeSha', type: 'bytes20', value: `0x${rec.mergeSha}` },
    { name: 'mergedByHash', type: 'bytes32', value: rec.mergedByHash },
    { name: 'harness', type: 'string', value: rec.harness },
    { name: 'agentId', type: 'uint256', value: rec.agentId },
    { name: 'outcome', type: 'uint8', value: rec.outcome },
    { name: 'solanaTx', type: 'string', value: rec.solanaTx },
    { name: 'mergedAt', type: 'uint64', value: BigInt(rec.mergedAt) },
  ]);
  assert.equal(encodeMerge(rec), theirs);
});

test('a record decodes back to itself', () => {
  assert.deepEqual(decodeMerge(encodeMerge(rec)), rec);
  assert.equal(decodeMerge('0x1234'), undefined);
});

test('records that are not merges are refused', () => {
  assert.match(recordProblem({ ...rec, repo: 'Acme/App' }) ?? '', /lower case/);
  assert.match(recordProblem({ ...rec, outcome: 4 as 1 }) ?? '', /outcome/);
  assert.match(recordProblem({ ...rec, mergeSha: 'xyz' }) ?? '', /mergeSha/);
  assert.match(recordProblem({ ...rec, solanaTx: 'not base58!' }) ?? '', /solanaTx/);
  assert.throws(() => encodeMerge({ ...rec, pr: 0 }), /pr is/);
});

test('who merged is a hash of their GitHub id, zero when unknown', () => {
  assert.equal(mergedByHashOf(undefined), ZERO32);
  assert.notEqual(mergedByHashOf(1), mergedByHashOf(2));
  assert.throws(() => mergedByHashOf(-1));
});

test('the chain-id guard takes Base Sepolia only', () => {
  assertBaseSepolia(84532);
  assertBaseSepolia('0x14a34');
  assert.throws(() => assertBaseSepolia(8453), WrongChainError);
  assert.throws(() => assertBaseSepolia('0x1'), WrongChainError);
  assert.throws(() => assertBaseSepolia(31337), /not Base Sepolia/);
});
