// The shipped log: a local, signed record of every review of an agent's work that ended in a merge or
// a send-back (see ShipRecord): which agent and model, from what prompt, who reviewed it and what
// they decided. The inbox reads it for Shipped today and the merge rate per agent and model.
//
// Each record is signed with an Ed25519 key the office makes for itself the first time (kept next to
// the log, readable by its owner only), so a record can be checked later against the public key.
// Nothing leaves the machine: there is no chain and no server behind it.
import { createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, verify, type KeyObject } from 'node:crypto';
import path from 'node:path';
import { shipPayload } from '../shared/inbox.js';
import type { ShipRecord } from '../shared/protocol.js';
import { appendState, readState, writeState } from './safefs.js';

/** How far back the log is read and sent to a browser. */
export const SHIPLOG_DAYS = 30;
/** The most records kept in memory. */
const KEPT = 5000;

const clip = (s: string | undefined, max: number) => (s ? (s.length > max ? `${s.slice(0, max - 3)}...` : s) : undefined);

export class ShipLog {
  private records: ShipRecord[] = [];
  private readonly key: KeyObject;
  private readonly file?: string;
  readonly publicKey: string;

  /** `dataDir` undefined keeps nothing on disk and signs with a key made for this run (tests). */
  constructor(dataDir: string | undefined, private now: () => number = Date.now) {
    this.file = dataDir ? path.join(dataDir, 'shipped.jsonl') : undefined;
    this.key = loadKey(dataDir ? path.join(dataDir, 'shipped-key.pem') : undefined);
    this.publicKey = createPublicKey(this.key).export({ type: 'spki', format: 'pem' }).toString();
    if (this.file) this.records = readLog(this.file, this.now() - SHIPLOG_DAYS * 86_400_000);
  }

  /** Newest first. */
  recent(): ShipRecord[] {
    const from = this.now() - SHIPLOG_DAYS * 86_400_000;
    return this.records.filter((r) => r.at >= from).sort((a, b) => b.at - a.at);
  }

  /** Signs a record, writes it to the log, and hands it back. */
  add(fields: Omit<ShipRecord, 'id' | 'at' | 'sig'>): ShipRecord {
    const r: ShipRecord = {
      ...fields,
      id: randomBytes(8).toString('hex'),
      at: this.now(),
      ...(fields.task ? { task: clip(fields.task, 200) } : {}),
      ...(fields.prompt ? { prompt: clip(fields.prompt, 2000) } : {}),
      ...(fields.note ? { note: clip(fields.note, 4000) } : {}),
    };
    r.sig = sign(null, Buffer.from(shipPayload(r)), this.key).toString('base64');
    this.records.push(r);
    if (this.records.length > KEPT) this.records.splice(0, this.records.length - KEPT);
    if (this.file) {
      try {
        appendState(this.file, `${JSON.stringify(r)}\n`);
      } catch {
        // a full or read-only disk shouldn't stop a merge that already happened
      }
    }
    return r;
  }

  /** Forgets every record, on disk too: only the hosted demo does, as each round starts over (server/demo). */
  clear() {
    this.records = [];
    if (!this.file) return;
    try {
      writeState(this.file, '');
    } catch {
      // the next round's records still go after the old ones
    }
  }
}

/** Whether `r` was signed by the key whose public half is `publicKeyPem`, and not changed since. */
export function verifyShipRecord(r: ShipRecord, publicKeyPem: string): boolean {
  if (!r.sig) return false;
  try {
    return verify(null, Buffer.from(shipPayload(r)), createPublicKey(publicKeyPem), Buffer.from(r.sig, 'base64'));
  } catch {
    return false;
  }
}

/** The office's signing key: read from `file`, or made and written there the first time. */
function loadKey(file: string | undefined): KeyObject {
  const pem = file ? readState(file) : undefined;
  if (pem) {
    try {
      return createPrivateKey(pem);
    } catch {
      // a broken key file: make a new one (old records keep the old key's signatures)
    }
  }
  const { privateKey } = generateKeyPairSync('ed25519');
  if (file) {
    try {
      writeState(file, privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), 0o600);
    } catch {
      // can't keep it: this run signs with a key of its own
    }
  }
  return privateKey;
}

/** The records in the log since `from`, skipping lines that aren't records. */
function readLog(file: string, from: number): ShipRecord[] {
  const text = readState(file);
  if (!text) return [];
  const out: ShipRecord[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line) as ShipRecord;
      if (r && typeof r.at === 'number' && r.at >= from && (r.kind === 'merged' || r.kind === 'sent-back') && typeof r.workerId === 'string') out.push(r);
    } catch {
      // a torn last line after a crash
    }
  }
  return out.slice(-KEPT);
}
