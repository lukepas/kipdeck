// The sign-in page opened from a "Pair a phone" code (/login#pair=<code>): the code is taken out of the
// address bar at once, traded for a device sign-in of this phone's own (POST /api/pair/redeem), and
// the phone goes on to the inbox. The code is after the #, so it never reaches a server log. A code
// that ran out or was used already says so, with the password form still there as a way in.

import { deviceName } from '../shared/devices';

/** Starts pairing when the page was opened from a code: true if it was (the caller skips its own first screen). */
export function redeemPairing(next: string, show: { sub: HTMLElement; error: HTMLElement; form: HTMLElement }): boolean {
  const token = new URLSearchParams(location.hash.slice(1)).get('pair');
  if (!token) return false;
  history.replaceState(null, '', location.pathname + location.search);
  show.form.hidden = true;
  show.sub.textContent = 'Pairing this device...';
  void fetch('/api/pair/redeem', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, name: deviceName(navigator.userAgent) }) })
    .then(async (res) => {
      if (res.ok) return location.replace(next);
      show.sub.textContent = "This device isn't paired.";
      show.error.textContent = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Could not pair this device';
      show.form.hidden = false;
    })
    .catch(() => {
      show.error.textContent = 'Server unreachable';
      show.form.hidden = false;
    });
  return true;
}
