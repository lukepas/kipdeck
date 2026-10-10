/**
 * Rundown on the bridge (Labs > Rundown): the deck's project as a city of light over the mission table.
 * A district per part, sized by its code and lit by its status, towers for its biggest folders, a pulse
 * up them for each commit this week, the milestones as rings round the rim, and an orange beam where
 * the next step is; a callout over each district names it, its status, and what a stuck one waits on
 * (labels.ts). Brought up from the menu, Ctrl+K or the Rundown window; while it's up the holo's star
 * map, course column and waypoint plates and the heading's caption all stand down (Holo.yieldTo,
 * HoloHeading.yieldTo), so the city has the table and nothing is written over it. E at a district
 * opens the Rundown window at that part, and its close or Esc puts you straight back into mouse-look.
 * Follows the deck you're on; draws nothing while it's down or the tab is hidden; reduced motion or Ship
 * motion Off holds it still, Low quality drops the pulses. `root.userData.built` says a city is drawn
 * (the perf probe and the shots wait for it).
 */
import * as THREE from 'three';
import type { Ctx } from '../../core/context';
import { aside, hintTitle, key, onE } from '../../core/hint';
import type { Parts } from '../../core/parts';
import { store } from '../../state';
import { saveSettings } from '../../state/persist';
import { toast } from '../../ui/dom';
import type { HudAction } from '../../ui/menu';
import type { PaletteEntry } from '../../ui/palette';
import { cityLabels } from './labels';
import { cityLayout, STATUS_WORDS, statusMoves, type District } from './logic';
import { statusChime } from './sound';
import type { RundownHolo } from './world';

declare module '../../world/types' {
  interface InteractKinds {
    rundown: true;
  }
}

export type RundownParts = Pick<Parts, 'quality' | 'settings' | 'stage'>;

/** How fast the city comes up and goes down (per second). */
const FADE = 2.2;
export function installRundown(ctx: Ctx, parts: RundownParts) {
  const holo: RundownHolo = ctx.office.rundownHolo;
  const { city, root } = holo;
  const labels = cityLabels();
  let k = 0;
  let t = 0;
  let drawnKey = '';
  let districts: District[] = [];
  let usable: ReturnType<RundownHolo['standIns']> = [];
  let watching: string | null = null;

  const wanted = () => parts.settings.rundownHolo && store.lab('rundown');

  /** Watch the deck you're on while the city is up (the Rundown window watches whichever it shows). */
  async function syncWatch() {
    const floor = wanted() ? store.floor : null;
    if (floor === watching) return;
    const win = (await import('../../ui/rundown')).rundownWindow();
    if (win) return;
    watching = floor;
    ctx.net.send(floor ? { t: 'rundown.watch', floor } : { t: 'rundown.unwatch' });
  }

  function rebuild() {
    const view = store.rundowns.get(store.floor ?? '');
    const r = view?.rundown;
    if (!r) return;
    const k2 = `${r.generatedAt}|${r.project.head?.sha}|${r.parts.map((p) => p.status).join()}`;
    if (k2 === drawnKey) return;
    const layout = cityLayout(r, new Date());
    const moved = drawnKey ? statusMoves(districts, layout.districts) : [];
    drawnKey = k2;
    districts = layout.districts;
    city.build(layout);
    const tops = city.tops();
    labels.set(layout.districts, tops, r.nextStep?.partId ? { partId: r.nextStep.partId, text: r.nextStep.text } : null);
    usable = holo.standIns(layout.districts, tops);
    root.userData.built = true;
    if (moved.length && k > 0.5) ctx.sound.play('rundown-status', 'ship', statusChime(moved.some((m) => m.to === 'stuck')));
  }

  function setUp(on: boolean) {
    if (on && !store.lab('rundown')) return toast('Rundown is a lab: an admin turns it on in Labs', 'warn');
    parts.settings.rundownHolo = on;
    saveSettings(parts.settings);
    void syncWatch();
    if (on) rebuild();
  }

  /** The Rundown window, on this deck (and at a part). */
  function openWindow(part?: string) {
    void import('../../ui/rundown').then((m) =>
      m.openRundown(ctx.net, {
        floor: store.floor ?? undefined,
        part,
        // The window watched what it showed; the city goes back to watching its own deck.
        onClose: () => {
          watching = null;
          void syncWatch();
        },
      }),
    );
  }

  store.on('rundown', rebuild);
  store.on('floor', () => {
    drawnKey = '';
    void syncWatch();
    rebuild();
  });
  store.on('labs', () => void syncWatch());

  ctx.usables.add({ usable: () => (k > 0.5 ? usable : []) });
  ctx.interactions.define('rundown', {
    reach: 7,
    hint: (it) => {
      const d = districts.find((x) => x.id === (it as (typeof usable)[number]).partId);
      return { k: `rundown|${d?.id}|${d?.status}`, parts: [hintTitle(d?.name ?? 'Part'), aside(d ? STATUS_WORDS[d.status] : ''), key('E', 'Rundown')] };
    },
    use: onE((it) => openWindow((it as (typeof usable)[number]).partId)),
  });

  // The callouts follow the city on screen every frame, after the camera moved. They don't stand down for
  // the wall boards as the holo's own plates do: the city is what you brought up, and they sit beside it.
  const toWorld = (p: THREE.Vector3) => root.localToWorld(p);
  ctx.ticks.add('hud', () => {
    if (k <= 0.5 || document.visibilityState === 'hidden') return labels.hide();
    const camera = parts.stage.view ?? ctx.camera;
    camera.updateMatrixWorld();
    root.updateMatrixWorld();
    labels.place(toWorld, camera, k);
  });

  // The setting changed some other way (Settings, a shot or the probe setting it): watch and draw to match.
  let wasWanted = wanted();
  ctx.ticks.add('world', ({ dt }) => {
    const want = wanted();
    if (want !== wasWanted) {
      wasWanted = want;
      void syncWatch();
      if (want) rebuild();
    }
    const target = want ? 1 : 0;
    if (k === target && k === 0) return;
    if (document.visibilityState === 'hidden') return;
    k = target > k ? Math.min(target, k + dt * FADE) : Math.max(target, k - dt * FADE);
    ctx.office.holo.yieldTo(k);
    ctx.office.heading.yieldTo(k);
    root.visible = k > 0.001;
    const still = ctx.reduceMotion.matches;
    if (!still) t += dt;
    city.frame(t, k, !still, !still && parts.quality.tier() !== 'low');
  });

  void syncWatch();
  return {
    /** Whether the city is up (or on its way up). */
    up: () => wanted(),
    toggle: () => setUp(!parts.settings.rundownHolo),
    openWindow,
  };
}

export type RundownApi = ReturnType<typeof installRundown>;

/** The bridge menu's rows (Tab): the Rundown window, and the city on the holo. */
export function rundownMenuActions(api: () => RundownApi | undefined): HudAction[] {
  return [
    { id: 'rundown', icon: 'overview', label: 'Rundown', section: 'Command', lab: 'rundown', title: () => "This deck's project: its parts, milestones, activity and decisions", run: () => api()?.openWindow() },
    { id: 'rundown-holo', icon: 'plot', label: 'Rundown on the holo', section: 'Command', lab: 'rundown', on: () => !!api()?.up(), title: () => "The project's map as a city of light over the mission table", run: () => api()?.toggle() },
  ];
}

/** Ctrl+K's entries for it, while the lab is on. */
export function rundownPaletteEntries(api: RundownApi | undefined): PaletteEntry[] {
  if (!api || !store.lab('rundown')) return [];
  return [
    { icon: 'overview', kind: 'Action', title: 'Rundown', detail: "This deck's parts, milestones and decisions", keywords: ['project map', 'status', 'milestones'], open: () => api.openWindow() },
    { icon: 'plot', kind: 'Action', title: api.up() ? 'Rundown off the holo' : 'Rundown on the holo', detail: 'The project as a city over the mission table', keywords: ['project map', 'holo', 'city'], open: () => api.toggle() },
  ];
}
