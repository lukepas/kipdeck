# Push to your devices

How Kipdeck reaches you when you are not looking at its tab: an installable app, Web Push to your phone and laptop, and the team's Slack or Discord channel after that.

Back to the [README](../README.md).

## Turning it on

Kipdeck asks once, at your first **Deploy agent**: you just handed an agent work it will come back to you about. Allow notifications and that browser becomes one of your devices. It never asks again, whatever you answered. Where the browser can't take pushes at all (plain http over the LAN, an iPhone before Add to Home Screen) it doesn't count as asked, so the first Deploy where it can still asks. **Settings > Notifications > Push to your devices** turns it on or off for the browser you are in, sends a test push, and lists your other devices with **Remove** for each (a lost phone, an old browser).

Push needs a secure page: `https://`, or `http://localhost` on your own computer (an SSH tunnel to a server counts). On plain http over the LAN the browser has no push at all, and Settings says so.

On a phone:

- **Android (Chrome, Edge, Firefox)**: open the office, allow notifications at the first Deploy or in Settings. Chrome also offers **Install app**, which puts Kipdeck on the home screen as an app of its own.
- **iPhone and iPad (iOS 16.4 or later)**: Safari only gives push to an installed web app. Tap **Share**, then **Add to Home Screen**, open Kipdeck from the Home Screen and turn push on in Settings there.

## When a push comes

A push goes out when an agent:

- needs an answer to a question,
- wants your approval for a tool call (a permission prompt),
- finished its turn with work to review, or
- got stuck (silent while working, crashed, failing again and again; see [Mission control](mission-control.md)).

It has to stay that way for 5 seconds first, so a flicker never buzzes a phone. A snoozed agent sends nothing, and neither does a finished turn somebody already looked at.

The push's title is the agent's task, the name the inbox lists it by. Under it: what it wants and in which project, then its question or what it wants to run. Pushes about the same agent replace each other. On a device with a Kipdeck page open, a push comes down by itself once somebody gets to that agent or snoozes it (a stuck one only once it is snoozed, since a stuck agent can look busy all along).

Where the platform shows buttons (Chrome and Edge on Android and desktop; not Safari), each push has two:

| Push | Buttons |
| --- | --- |
| Needs an answer | **Answer** (opens the agent), **Snooze 1h** |
| Wants your approval | **Review request** (opens the agent), **Snooze 1h** |
| Ready for review | **Review** (opens the agent), **Mark seen** |
| Looks stuck | **Look** (opens the agent), **Snooze 1h** |

Answering and approving always happen in the inbox, where you can see what you are agreeing to. Tapping the push itself brings up an inbox tab already open on that agent, or opens one on `/?agent=<id>` (a Deck tab left open is not used: it can't show the agent's terminal).

## Who gets it

The push goes to the devices of whoever deployed the agent: their account's devices, or on the shared password the devices kept under the name they deployed it with. When that person has no devices, it goes to everyone's devices with push on.

Each person keeps up to 10 devices; turning push on in an eleventh browser replaces their oldest. The office keeps up to 200 in all.

Nobody is pushed while they are at their desk: a Kipdeck page of theirs (the inbox or the Deck) is focused and they used it (a key, a click, a scroll, a tap) within the last 2 minutes. A tab left open with nobody touching it stops counting after those 2 minutes, and so does a terminal the inbox opened by itself on a wide screen.

## Then the team channel

With a Slack or Discord webhook set (Settings > Notifications > Team channel, or `--webhook`), the channel is the next step:

1. The agent starts waiting. 5 seconds later, a push to the devices above.
2. Still unanswered 3 minutes after that, and nobody at a desk: the channel gets a line about it, and anyone who was at their desk at step 1 but has since walked away gets their push.

With no device to push to and nobody at a desk, the channel hears at step 1, as it did before push existed. An agent still waiting on an answer after an hour gets one more line in the channel as a reminder.

The timings live in `src/shared/push.ts` (`PUSH_SETTLE_MS`, `ESCALATE_MS`, `PRESENCE_MS`).

## What is kept, and what leaves

- The office's VAPID key pair is made the first time push is used and kept in `.agent-office/vapid.json` in the office home, readable by the office's user only. Deleting it makes a new pair and forgets every device; each browser with push on subscribes again under the new key the next time it opens Kipdeck.
- Each device is kept in `.agent-office/push.json` (its push service's link, its keys, whose it is and what browser), also readable by the office's user only.
- A push is encrypted for the one browser it is for (RFC 8291, `aes128gcm`) and signed with the office's key (VAPID, RFC 8292), all with Node's own `node:crypto`. The push service (Google's, Mozilla's, Apple's or Microsoft's) only ever sees an encrypted body.
- The office only sends to those push services, over https, through the same guarded fetch as the webhook. See [Security](security.md#push-notifications).

## How it's built

- `src/client/public/sw.js` is the service worker: it shows a push and handles a tap and the buttons. No caching and no offline mode.
- `src/client/public/manifest.webmanifest` and its icons (`npm run logo -- --png` renders them) make the home page installable.
- `src/client/pwa/` registers the worker, tells the office you are at your desk (`presence.ts`), subscribes and unsubscribes (`push.ts`) and asks at the first Deploy.
- `src/server/push/` is the server side: `crypto.ts` (encryption and VAPID), `devices.ts` (the devices and sending), `presence.ts` (who is at a desk), and `alerts.ts` (when an agent that waits reaches whom).
- `src/server/http/routes/push.ts` serves the worker, the manifest and the icons without a session, and the signed-in `/api/push` routes.
