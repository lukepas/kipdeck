import type { WebSocket } from 'ws';
import type { PeerInfo } from '../../shared/protocol.js';
import type { Session } from '../auth.js';

/** A viewer with more than this waiting to go out skips terminal output, and gets a fresh snapshot once it catches up. */
export const SLOW_CLIENT_BYTES = 8 * 1024 * 1024;

/** One browser in the office: its socket, who it is, and what it's up to. */
export interface Client {
  id: string;
  ws: WebSocket;
  peer: PeerInfo;
  /** Signed in with this account; none means the shared office password. */
  accountId?: string;
  /** The sign-in it came with, checked again as it goes (see Auth.current). */
  session: Session;
  /** Whether this person was last told they're an admin (see `me`). */
  admin: boolean;
  /** Signed out while connected; whatever it still sends is dropped until the socket closes. */
  out?: boolean;
  attached: Set<string>;
  /** Terminals whose output was skipped because this client fell behind; re-snapshotted later. */
  stale: Set<string>;
  lastMoveAt: number;
  /** When each rate-limited thing they do was last let through, by name (see throttle). */
  throttles: Map<string, number>;
  /** When this client last said it was typing, per terminal (see 'term.typing'). */
  typingAt: Map<string, number>;
  /** Cleared at each heartbeat ping and set again by the pong; still clear at the next one means gone. */
  isAlive: boolean;
}

/** A client that just connected, with nothing going on yet. */
export function newClient(id: string, ws: WebSocket, who: { accountId: string | undefined; admin: boolean; session: Session }, peer: PeerInfo): Client {
  return {
    id,
    ws,
    accountId: who.accountId,
    session: who.session,
    admin: who.admin,
    attached: new Set(),
    stale: new Set(),
    lastMoveAt: 0,
    throttles: new Map(),
    typingAt: new Map(),
    isAlive: true,
    peer,
  };
}

/**
 * Whether `key` may go through for `c` now, at most once every `ms`: when it may, that's now the
 * last time it did. Put it last in a check, so nothing else can still turn the request away after.
 */
export function throttle(c: Client, key: string, ms: number, now = Date.now()): boolean {
  if (now - (c.throttles.get(key) ?? 0) < ms) return false;
  c.throttles.set(key, now);
  return true;
}
