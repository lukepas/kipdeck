/**
 * The service monitor on the east wall: the live page of a web server a unit is running, so you can
 * watch it without leaving the deck. Which one: the first the office lists until you pick one, by E on
 * its row of the Services board (features/boards) or C at the monitor for the next. Walk up to it and
 * the page itself is laid over the screen (live.ts), a real sandboxed frame on the service's own relay
 * link (pick.ts); E there gives it the mouse (the captured mouse is let go, cleanly) and Esc, E or a
 * click on the deck takes you back into mouse-look. O opens it full screen in a window, R reloads it.
 * Past the reading distance, at a slant, behind something, under a window or in the Overview the page
 * isn't there and the screen's card shows (face.ts); at Low quality, or where this page can't frame
 * the service, the card has an Open button instead. Nothing on it moves, so less motion changes
 * nothing; a hidden tab does no work for it, and a page left unseen is unloaded.
 */
import * as THREE from 'three';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { aside, hintTitle, key } from '../../core/hint';
import { store } from '../../state';
import { modalOpen, toast } from '../../ui/dom';
import { openServices, serviceUrl } from '../../ui/services';
import { screen } from '../boards/screen';
import { FarWatch } from '../boards/far';
import { debugHandle } from '../giveway';
import { SERVICE_MONITOR } from '../../../shared/wall-screens';
import type { ServiceInfo } from '../../../shared/protocol';
import { MONITOR_UNITS, paintMonitorFace, type MonitorCard } from './face';
import { LivePage, css3dWorks } from './live';
import { monitorUrl, nextService, pickService } from './pick';
import { keysBackOffFrame, openMonitorModal } from './ui';
import { LIVE, liveShown } from './visible';

// The kinds of thing you can use that this defines (see InteractKinds in world/types.ts).
declare module '../../world/types' {
  interface InteractKinds {
    monitor: true;
  }
}

export type MonitorParts = Pick<Parts, 'player' | 'stage' | 'quality'>;

/** Where on the face the visibility checks look: its corners (a little in) and its middle. */
const PROBES: readonly (readonly [number, number])[] = [
  [-0.46, -0.46],
  [0.46, -0.46],
  [-0.46, 0.46],
  [0.46, 0.46],
  [0, 0],
];

export function installMonitor(ctx: Ctx, parts: MonitorParts) {
  const { face, group } = ctx.office.serviceMonitor;
  const css3d = css3dWorks();
  /** The port you picked, kept while that service runs. */
  let chosen: number | null = null;
  let using = false;

  const current = (): ServiceInfo | null => pickService(store.services.items, chosen);
  const title = (s: ServiceInfo) => s.title || s.command;
  const url = (s: ServiceInfo | null) => (s ? monitorUrl(s.port, store.services, location) : null);
  /** Why the page is behind Open rather than live, or null when it can be live. */
  function blocked(s: ServiceInfo | null): string | null {
    if (!s) return null;
    if (!css3d) return "This browser can't place a page on the screen";
    if (parts.quality.tier() === 'low') return 'Low quality draws no live page';
    if (!url(s)) return 'This office is on another computer: Open uses its link';
    return null;
  }

  // ---- The card on the face ---------------------------------------------------------------------
  const card = screen(SERVICE_MONITOR.width, SERVICE_MONITOR.height, MONITOR_UNITS);
  face.material.map = card.texture;
  face.material.needsUpdate = true;
  let far = true;
  let painted = '';
  function view(): MonitorCard {
    const s = current();
    const why = blocked(s);
    const w = s ? store.workers.get(s.workerId) : undefined;
    return {
      service: s && { port: s.port, title: title(s), who: [w?.name ?? 'A unit', w?.worktree?.branch].filter(Boolean).join(' - '), command: s.command },
      count: store.services.items.length,
      mode: why ? 'open' : 'live',
      why: why ?? undefined,
    };
  }
  function repaint() {
    const c = view();
    const k = JSON.stringify([c, far]);
    if (k !== painted) {
      painted = k;
      paintMonitorFace(card, c, far);
    }
    const s = current();
    live.setPage(c.mode === 'live' ? url(s) : null, s ? `${title(s)}  :${s.port}` : '', c.count > 1);
    ctx.hint.invalidate();
  }

  // ---- The live page --------------------------------------------------------------------------------
  const live = new LivePage(ctx.canvas, face, {
    reload: () => reload(),
    next: () => next(),
    full: () => full(),
    tab: () => tab(),
    back: () => back(true),
  });
  // A page with the keyboard keeps Esc to itself: the moment the pointer is off it, the deck takes it back.
  keysBackOffFrame(() => (using ? live.iframe : null), () => ctx.canvas);

  for (const topic of ['services', 'workers'] as const) store.on(topic, repaint);
  parts.quality.on(() => repaint());
  repaint();

  /** Shows the service on `port` on the monitor (E on its row of the Services board). */
  function show(port: number) {
    const s = store.services.items.find((i) => i.port === port);
    if (!s) return toast(`Nothing serves :${port} any more`, 'warn');
    chosen = port;
    repaint();
    toast(`On the service monitor (east wall): ${title(s)} :${port}`);
  }
  function next() {
    const s = nextService(store.services.items, current()?.port ?? null);
    if (!s) return;
    chosen = s.port;
    repaint();
  }
  function reload() {
    live.reload();
  }
  /** In a tab of its own, the way the Services board's Open does. */
  function tab() {
    const s = current();
    if (s) window.open(serviceUrl(s.port), '_blank', 'noopener,noreferrer');
  }
  /** Full screen in a window, where it can be framed; else in a tab. */
  function full() {
    const s = current();
    if (!s) return openServices();
    const u = url(s);
    if (using) back(false);
    if (u && css3d) openMonitorModal(u, `${title(s)}  :${s.port}`, tab);
    else tab();
  }

  // ---- Using the page: it has the mouse until Esc, E or a click on the deck -------------------------
  function startUse() {
    if (!live.shown || using) return;
    ctx.activities.stopAll('start', ['monitor-use']);
    using = true;
    parts.player.yieldMouse();
    live.set(true, true);
    ctx.hint.invalidate();
  }
  /** Back to the deck; `click` when a click asked (the view settles before it looks around). */
  function back(click: boolean) {
    if (!using) return;
    using = false;
    live.set(live.shown, false);
    ctx.canvas.focus({ preventScroll: true });
    if (parts.player.canLock && !modalOpen()) parts.player.lock(click);
    ctx.hint.invalidate();
  }
  document.addEventListener('pointerlockchange', () => {
    // The mouse captured again (a click on the deck): the page lets go of it.
    if (using && parts.player.locked) {
      using = false;
      live.set(live.shown, false);
      ctx.hint.invalidate();
    }
  });
  ctx.activities.add({
    id: 'monitor-use',
    active: () => using,
    stop: () => back(false),
    key: (e) => {
      if (e.key !== 'Escape' && e.code !== 'KeyE') return false;
      e.preventDefault();
      back(false);
      return true;
    },
    hint: (el) => ctx.hint.draw(el, 'monitor-use', () => [hintTitle('Service monitor'), aside('the page has the mouse'), key('Esc', 'Back to the deck')]),
  });

  // ---- What E, O, C and R do at it --------------------------------------------------------------------
  ctx.interactions.define('monitor', {
    reach: LIVE.show,
    hint: () => {
      const s = current();
      if (!s) return { k: 'none', parts: [hintTitle('Service monitor'), aside('no service running'), key('E', 'Services')] };
      const many = store.services.items.length > 1;
      const shown = live.shown;
      return {
        k: `${s.port}|${shown}|${many}`,
        parts: [hintTitle(`Monitor: ${title(s)}`), aside(`:${s.port}`), key('E', shown ? 'Use the page' : 'Open'), key('O', 'Full screen'), ...(many ? [key('C', 'Next')] : []), ...(shown ? [key('R', 'Reload')] : [])],
      };
    },
    use: (_it, k) => {
      const s = current();
      if (k === 'E') {
        if (!s) openServices();
        else if (live.shown) startUse();
        else full();
      } else if (k === 'O') full();
      else if (k === 'C') next();
      else if (k === 'R') reload();
    },
  });

  // ---- Each frame: whether the page shows, and where ----------------------------------------------
  const farWatch = new FarWatch(face);
  const eye = new THREE.Vector3();
  const mid = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const p = new THREE.Vector3();
  const ndc = new THREE.Vector3();
  const ray = new THREE.Raycaster();
  let shown = false;
  let lookT: number = LIVE.every;

  /** Whether nothing of the deck stands between the eye and each probe on the face. */
  function clear(): boolean {
    const { width, height } = SERVICE_MONITOR;
    // Sprites (a callout, a glyph) are tested facing the camera.
    ray.camera = ctx.camera;
    for (const [u, v] of PROBES) {
      p.set(u * width, v * height, 0.01).applyMatrix4(face.matrixWorld);
      const d = eye.distanceTo(p);
      ray.set(eye, p.sub(eye).normalize());
      ray.far = d - 0.03;
      for (const hit of ray.intersectObject(ctx.office.group, true)) {
        let mine = false;
        let seen = true;
        for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) {
          if (o === group) mine = true;
          if (!o.visible) seen = false;
        }
        if (!seen || mine) continue;
        return false;
      }
    }
    return true;
  }

  function look(): boolean {
    const s = current();
    if (document.hidden || !s || blocked(s) || modalOpen() || parts.stage.view) return false;
    const camera = ctx.camera;
    camera.getWorldPosition(eye);
    face.updateWorldMatrix(true, false);
    face.getWorldPosition(mid);
    normal.set(0, 0, 1).transformDirection(face.matrixWorld);
    const dist = eye.distanceTo(mid);
    const facing = normal.dot(p.copy(eye).sub(mid).normalize());
    if (dist > LIVE.hide || facing < LIVE.facing) return false;
    let inView = true;
    for (const [u, v] of PROBES) {
      ndc.set(u * SERVICE_MONITOR.width, v * SERVICE_MONITOR.height, 0).applyMatrix4(face.matrixWorld).project(camera);
      if (ndc.z > 1 || Math.abs(ndc.x) > 1.05 || Math.abs(ndc.y) > 1.05) inView = false;
    }
    return liveShown({ dist, facing, inView, clear: inView && clear(), was: shown });
  }

  ctx.ticks.add('render', ({ dt }) => {
    const f = farWatch.check(ctx.camera, dt);
    if (f !== null) {
      far = f;
      repaint();
    }
    lookT += dt;
    // Cheap checks every frame (a window, the Overview); the rays only a few times a second.
    const quick = !document.hidden && !modalOpen() && !parts.stage.view;
    if (lookT >= LIVE.every || (shown && !quick)) {
      lookT = 0;
      const now = look();
      if (now !== shown) {
        shown = now;
        if (!shown && using) back(false);
        live.set(shown, using);
        ctx.hint.invalidate();
      }
    }
    live.render(ctx.camera);
  });

  const api = {
    show,
    next,
    reload,
    full,
    use: startUse,
    back: () => back(false),
    /** What it shows and how (the shots, the tests). */
    state: () => ({ port: current()?.port ?? null, url: url(current()), shown: live.shown, using, far, blocked: blocked(current()) }),
  };
  debugHandle('monitor', api);
  return api;
}
