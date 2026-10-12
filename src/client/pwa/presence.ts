// Telling the office you're at your desk: this page is focused and you're using it (a key, a click,
// a scroll, a tap). Sent when that starts, again at most every half minute while you keep at it, and
// when the page loses focus or is hidden. An open tab nobody touches stops counting after a couple of
// minutes, so pushes and the team's channel reach you once you walk away (server/push/alerts.ts).

import { PRESENCE_BEAT_MS } from '../../shared/push';
import type { Net } from '../net';

const INPUT = ['keydown', 'pointerdown', 'wheel', 'touchstart'] as const;

/** For as long as the page is open. */
export function trackPresence(net: Net) {
  /** What the office last heard from this page, and when it heard "focused". */
  let said: boolean | undefined;
  let beatAt = 0;
  const here = () => document.visibilityState === 'visible' && document.hasFocus();
  const used = () => {
    if (!here()) return;
    const now = Date.now();
    if (said === true && now - beatAt < PRESENCE_BEAT_MS) return;
    said = true;
    beatAt = now;
    net.send({ t: 'here', focused: true });
  };
  const away = () => {
    if (said === false || here()) return;
    said = false;
    net.send({ t: 'here', focused: false });
  };
  for (const t of INPUT) window.addEventListener(t, used, { capture: true, passive: true });
  window.addEventListener('blur', away);
  document.addEventListener('visibilitychange', away);
  // After a reconnect the office has forgotten this page: the next touch tells it again.
  net.onStatus((up) => {
    if (up) said = undefined;
  });
}
