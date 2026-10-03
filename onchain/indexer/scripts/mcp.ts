#!/usr/bin/env -S node --import tsx
// The read-only 'agent_reputation' MCP server on stdio. Holds no keys.
//
//   REPUTATION_OFFICE_URL=https://office.example tsx scripts/mcp.ts     # the office's public dataset
//   REPUTATION_DATASET=out/dataset.json tsx scripts/mcp.ts              # a file (or an https URL)
//   tsx scripts/mcp.ts --network base-sepolia                           # rebuilt from the chain
import { readFile } from 'node:fs/promises';
import { buildDataset } from '../src/indexer.js';
import { datasetLoader, serveMcp } from '../src/mcp.js';
import { optionsFrom } from './index.js';

const a: Record<string, string | true> = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) a[process.argv[i].slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : true;
const src = process.env.REPUTATION_DATASET;
const dataset = datasetLoader(
  {
    ...(src && !/^https?:\/\//.test(src) ? { file: src } : {}),
    ...(src && /^https?:\/\//.test(src) ? { url: src } : {}),
    ...(process.env.REPUTATION_OFFICE_URL ? { officeUrl: process.env.REPUTATION_OFFICE_URL } : {}),
    build: () => buildDataset(optionsFrom(a)),
  },
  (f) => readFile(f, 'utf8'),
);
await serveMcp({ dataset });
