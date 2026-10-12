// Paired devices: a phone (or any browser) signed in by scanning the "Pair a phone" code instead of
// typing a password. What the server says about them and about a pairing (http/routes/devices.ts),
// and the pure parts both sides use: a device's name from its browser, and "seen 5 min ago".

/** A paired device as Settings lists it. */
export interface DeviceView {
  id: string;
  name: string;
  /** Whose it is: the account's name, or undefined for the shared office password. */
  owner?: string;
  /** Who showed the code it was paired with; '' when it was a session on the shared office password. */
  by: string;
  createdAt: number;
  lastSeen: number;
  /** This is the browser asking. */
  current?: boolean;
}

/** A way a phone can reach the office, for the pairing code. */
export interface PairAddress {
  /** The office's address, without a path: https://office.example.com, http://192.168.1.23:4600. */
  base: string;
  /** https: the phone gets a secure page (notifications, the microphone and the clipboard work). */
  secure: boolean;
  /** Where it comes from: the office's public URL, its tailnet name, the address this page uses, or its local network. */
  via: 'public' | 'tailnet' | 'page' | 'lan';
}

/** A pairing code the server made: its one-time token, until when it works, and the ways to reach the office. */
export interface PairOffer {
  id: string;
  token: string;
  expiresAt: number;
  addresses: PairAddress[];
  /** The office listens on this computer only (127.0.0.1): a phone can't reach it without a tunnel or --host. */
  loopbackOnly: boolean;
}

/** How long a pairing code works. */
export const PAIR_TTL_MS = 10 * 60_000;

/** The page a phone opens from the code: the sign-in page, with the token after the # so it never reaches a log. */
export const pairLink = (base: string, token: string): string => `${base.replace(/\/+$/, '')}/login#pair=${encodeURIComponent(token)}`;

/** A name for a device from its browser's user agent: "iPhone", "Android phone", "Mac (Safari)". */
export function deviceName(ua: string): string {
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\/|FxiOS/.test(ua) ? 'Firefox' : /Chrome\/|CriOS/.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  let what: string;
  if (/iPhone/.test(ua)) what = 'iPhone';
  else if (/iPad/.test(ua)) what = 'iPad';
  else if (/Android/.test(ua)) what = /Mobile/.test(ua) ? 'Android phone' : 'Android tablet';
  else if (/Macintosh|Mac OS X/.test(ua)) what = 'Mac';
  else if (/Windows/.test(ua)) what = 'Windows PC';
  else if (/Linux|X11/.test(ua)) what = 'Linux PC';
  else what = 'Device';
  // On a phone the browser hardly matters; on a computer it tells two apart.
  return browser && !/iPhone|Android phone/.test(what) ? `${what} (${browser})` : what;
}

/** A device name as typed: one line, trimmed, at most 40 characters, or undefined when there's nothing left. */
export function cleanDeviceName(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const name = raw.replace(/[\0-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
  return name || undefined;
}

/** "just now", "5 min ago", "3 h ago", "2 days ago". */
export function seenWords(at: number, now: number): string {
  const s = Math.max(0, now - at) / 1000;
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 36 * 3600) return `${Math.round(s / 3600)} h ago`;
  const days = Math.round(s / 86_400);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
