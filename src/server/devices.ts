// Paired devices and the one-time codes that pair them. A signed-in browser asks for a code ("Pair a
// phone"), shows it as a QR code, and the phone that opens it trades the code for a device session
// of its own: long-lived (see DEVICE_TTL_MS in auth.ts), listed in Settings with when it was last
// seen, and revocable one device at a time. Devices are kept in .agent-office/devices.json; codes
// only as hashes, in memory, so a restart forgets them.
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { PAIR_TTL_MS } from '../shared/devices.js';
import { readStateJson, writeState } from './safefs.js';

export interface Device {
  id: string;
  name: string;
  /** The account it signs in as; none for the shared office password. */
  account?: string;
  /** Who showed the code. */
  by: string;
  createdAt: number;
  lastSeen: number;
  /**
   * What its sign-in is bound to besides this list (Auth.deviceStamp): its account's password, or the
   * shared password. A new password ends it.
   */
  stamp: string;
}

/** A code not used yet: whose session made it, and until when it works. */
interface Pending {
  id: string;
  account?: string;
  by: string;
  exp: number;
  stamp: string;
  /** Set once a phone used it, so the page showing it can say so. */
  paired?: { device: string; name: string };
}

/** Codes waiting at once; making one more forgets the oldest. */
const MAX_PENDING = 16;
/** A device seen again this soon after it was written down isn't written again. */
const SEEN_WRITE_MS = 5 * 60_000;
/** More devices than this and the oldest unseen one goes, so the file can't grow without end. */
const MAX_DEVICES = 200;

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export class Devices {
  private list = new Map<string, Device>();
  private pending = new Map<string, Pending>();
  private file?: string;
  private lastWrite = 0;

  constructor(dataDir?: string) {
    if (!dataDir) return;
    this.file = path.join(dataDir, 'devices.json');
    try {
      const saved = readStateJson<{ devices?: unknown[] }>(this.file);
      for (const d of saved?.devices ?? []) {
        const v = d as Partial<Device>;
        if (typeof v?.id === 'string' && typeof v.name === 'string' && typeof v.by === 'string' && typeof v.createdAt === 'number' && typeof v.lastSeen === 'number' && typeof v.stamp === 'string') {
          this.list.set(v.id, { id: v.id, name: v.name, by: v.by, createdAt: v.createdAt, lastSeen: v.lastSeen, stamp: v.stamp, ...(typeof v.account === 'string' ? { account: v.account } : {}) });
        }
      }
    } catch {
      // a broken file forgets the devices: they sign in again
    }
  }

  get(id: string): Device | undefined {
    return this.list.get(id);
  }

  all(): Device[] {
    return [...this.list.values()].sort((a, b) => b.lastSeen - a.lastSeen);
  }

  /**
   * A new one-time code for whoever is signed in as `account` (none: the shared password). `stamp` is
   * what the device's sign-in will be bound to (Auth.deviceStamp), taken now, so a new password before
   * the code is used makes the device it pairs useless too.
   */
  offer(by: string, account: string | undefined, stamp: string, now = Date.now()): { id: string; token: string; expiresAt: number } {
    this.sweep(now);
    if (this.pending.size >= MAX_PENDING) this.pending.delete(this.pending.keys().next().value!);
    const token = randomBytes(24).toString('base64url');
    const id = randomBytes(8).toString('hex');
    const exp = now + PAIR_TTL_MS;
    this.pending.set(hash(token), { id, by, exp, stamp, ...(account ? { account } : {}) });
    return { id, token, expiresAt: exp };
  }

  /** Uses up a code: the new device, the first time it's given before it runs out; undefined after. */
  redeem(token: string, name: string, now = Date.now()): Device | undefined {
    if (!token) return undefined;
    const key = hash(token);
    const p = this.pending.get(key);
    if (!p || p.paired || p.exp <= now) return undefined;
    const device: Device = { id: randomBytes(12).toString('hex'), name, by: p.by, createdAt: now, lastSeen: now, stamp: p.stamp, ...(p.account ? { account: p.account } : {}) };
    p.paired = { device: device.id, name };
    this.list.set(device.id, device);
    if (this.list.size > MAX_DEVICES) {
      const oldest = this.all().at(-1);
      if (oldest) this.list.delete(oldest.id);
    }
    this.save(now);
    return device;
  }

  /** What became of a code the page is showing: paired (with the device's name), waiting, or gone. */
  status(id: string, account: string | undefined, now = Date.now()): { paired?: string; expired: boolean } {
    for (const p of this.pending.values()) {
      if (p.id !== id || p.account !== account) continue;
      return { paired: p.paired?.name, expired: !p.paired && p.exp <= now };
    }
    return { expired: true };
  }

  /** A device's session was used: when it was last seen, written down now and then. */
  seen(id: string, now = Date.now()) {
    const d = this.list.get(id);
    if (!d) return;
    d.lastSeen = now;
    if (now - this.lastWrite >= SEEN_WRITE_MS) this.save(now);
  }

  rename(id: string, name: string): boolean {
    const d = this.list.get(id);
    if (!d) return false;
    d.name = name;
    this.save();
    return true;
  }

  /** Revokes a device: its session stops working at once. */
  remove(id: string): boolean {
    const had = this.list.delete(id);
    if (had) this.save();
    return had;
  }

  private sweep(now: number) {
    for (const [k, p] of this.pending) if (p.exp + PAIR_TTL_MS <= now) this.pending.delete(k);
  }

  private save(now = Date.now()) {
    this.lastWrite = now;
    if (!this.file) return;
    try {
      writeState(this.file, JSON.stringify({ devices: [...this.list.values()] }, null, 2));
    } catch {
      // kept in memory at least
    }
  }
}
