// The home page (/): the inbox for your AI coding agents. Every agent sorted by what it needs from you
// (Needs you, To review, Working, Idle), the selected one's live terminal, changes and log beside the
// list, and Shipped today under it. The inbox itself is home/; this file connects to the office,
// signs you in and keeps the tab title and notifications current. No three.js: the 3D bridge is a
// view of its own at /bridge, behind Labs. You're in the office as someone on the 2D view
// (PeerInfo.lite), not standing anywhere in it.

import { Net } from './net';
import { AVATAR_COLORS, loadProfile, loadSettings, saveProfile, store } from './state';
import { randomLook, randomName } from '../shared/avatar';
import { $, doingNow, onDoingChange, onModalChange, readingNow, toast } from './ui/dom';
import { routeWorktreeMessage } from './ui/prompt';
import { runAction } from './ui/mission/act';
import { watchStuck } from './ui/mission/watch';
import { DesktopNotifier, waitingOnSomeone } from './notify';
// The tab title counts the agents waiting on someone, on every project, as the 3D bridge's does.
import { renderTitle } from './shared/title';
import { homeMessage, installHome } from './home';
import { home } from './home/state';
import * as lazy from './home/lazy';

// Sent back here because this browser can't draw the 3D bridge (see noWebGL in core/scene.ts).
if (new URLSearchParams(location.search).get('why') === 'webgl') {
  history.replaceState(null, '', location.pathname);
  toast("This browser can't draw the 3D bridge (WebGL is off or missing)", 'warn');
}

// Your name and color from the 3D bridge, if this browser has been in it. Nobody sees a character
// of yours from here, so a look is only made up to connect with.
const saved = loadProfile();
store.profile = { name: saved?.name ?? 'Guest', color: saved?.color ?? AVATAR_COLORS[1], look: saved?.look ?? randomLook() };
const net = new Net(() => store.profile, () => null, true);
const settings = loadSettings();
// A click on a notification selects that agent's row, its terminal open.
const notifier = new DesktopNotifier(() => settings.notify, (id) => home.select(id, 'terminal'));
const actions = installHome(net, settings, notifier);

/** The server version this page was loaded with. */
let bootVersion = '';

net.onStatus((up) => $('conn').classList.toggle('hidden', up));
net.onMessage((msg) => {
  store.apply(msg);
  routeWorktreeMessage(msg);
  homeMessage(net, actions, msg);
  switch (msg.t) {
    case 'welcome':
      // Back from a restart on another version: this page's code is stale, so load the new one.
      if (!bootVersion) bootVersion = msg.version;
      else if (msg.version !== bootVersion) return location.reload();
      // After a reconnect the server has forgotten what we're doing.
      sendDoing(true);
      break;
    case 'toast':
      toast(msg.text, msg.level);
      break;
    case 'signins.needed':
      void lazy.signins().then((m) => m.openSignIns(net, msg.why));
      break;
    case 'upgrade':
      if (msg.state.phase === 'restarting') {
        net.expectRestart();
        toast('The office is restarting on its new version. Back in a minute.');
      }
      break;
  }
});

// ---- Notifications: only when an agent starts needing you or has something to review ------------
/** What each agent was last, to tell when one starts waiting on someone. */
const lastStatus = new Map<string, string>();
store.on('workers', () => {
  for (const w of store.workers.values()) {
    const before = lastStatus.get(w.id);
    lastStatus.set(w.id, w.status);
    if (before === undefined || before === w.status || !waitingOnSomeone(w)) continue;
    notifier.alert(w);
    if (w.status === 'needs_input') navigator.vibrate?.(200);
  }
  notifier.sync(store.workers);
  renderTitle();
});
store.on('floors', renderTitle);
store.on('project', renderTitle);
// Stuck anywhere: a notification while you're away, and a buzz.
watchStuck((e, reason) => {
  notifier.stuck(e, reason, () => runAction(actions.deps, e, 'look'));
  if (e.floor === store.floor) navigator.vibrate?.(200);
});

// ---- What you have open, for the others (see PeerInfo.doing) -----------------------------------
let doingSent: string | undefined;
let readingSent = false;
function sendDoing(reconnected = false) {
  if (reconnected) {
    doingSent = undefined;
    readingSent = false;
  }
  const what = doingNow();
  const reading = readingNow();
  if (what === doingSent && reading === readingSent) return;
  doingSent = what;
  readingSent = reading;
  net.send({ t: 'doing', what, reading });
}
onModalChange(() => sendDoing());
onDoingChange(() => sendDoing());

// ---- In ----------------------------------------------------------------------------------------
/** What the office calls you until you say (git's user.name, on your own computer). */
let suggested: string | undefined;
void (async () => {
  try {
    const res = await fetch('/api/whoami', { cache: 'no-store' });
    if (res.status === 401) return void (location.href = '/login');
    const { me, name } = (await res.json()) as { me?: typeof store.me; name?: string };
    if (me) store.me = me;
    suggested = name;
  } catch {
    // the welcome message says it too
  }
  // With an account of your own, your name is that account's. New here, there's nothing to fill
  // in: you go by git's user.name on your own computer, else a made-up name.
  if (store.me.account) store.profile.name = store.me.account.name;
  else if (!saved) {
    store.profile.name = suggested ?? randomName();
    // No look: the 3D bridge deals one the first time you go in.
    saveProfile({ name: store.profile.name, color: store.profile.color });
  }
  net.connect();
})();

renderTitle();

// Debug handle for quick checks from the console / headless screenshots.
(window as any).__lite = { store, net, home };
