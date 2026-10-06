// The live page on the service monitor: a real, sandboxed iframe placed on the screen in 3D by three's
// CSS3DRenderer, in a layer just over the WebGL canvas and under the HUD and every window. A web page
// can't be hidden behind the deck's meshes, so it is only there while the screen is plainly in view
// (visible.ts decides, index.ts asks): otherwise the layer is gone and the screen's own card shows.
// While you look around (the mouse captured) it takes no clicks; using it (E) frees the mouse and lets
// the page have it, and its toolbar has the monitor's buttons.
import * as THREE from 'three';
import { CSS3DObject, CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { h } from '../../ui/dom';
import { icon } from '../../ui/icons';
import { MONITOR_SANDBOX } from './pick';
import './ui.css';

/** The page's size on the screen in CSS pixels (the face's 16:10), and its toolbar's height. */
export const PAGE = { w: 1280, h: 800, bar: 48 } as const;
/** A page left hidden this long (ms) is unloaded, so a dev server's page doesn't run unseen all day. */
const UNLOAD_AFTER = 45_000;

/** What the toolbar's buttons do. */
export interface LiveControls {
  reload(): void;
  next(): void;
  full(): void;
  tab(): void;
  back(): void;
}

/** Whether this browser can place a page in 3D at all (CSS 3D transforms). */
export function css3dWorks(): boolean {
  return typeof CSS !== 'undefined' && CSS.supports('transform-style', 'preserve-3d') && CSS.supports('transform', 'matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)');
}

export class LivePage {
  readonly layer: HTMLElement;
  private readonly renderer = new CSS3DRenderer();
  private readonly scene = new THREE.Scene();
  private readonly obj: CSS3DObject;
  private readonly el: HTMLElement;
  private readonly holder: HTMLElement;
  private readonly label: HTMLElement;
  private readonly nextBtn: HTMLButtonElement;
  private frame: HTMLIFrameElement | null = null;
  private url: string | null = null;
  private hiddenAt = 0;
  shown = false;
  using = false;

  constructor(
    over: HTMLCanvasElement,
    private readonly face: THREE.Mesh<THREE.PlaneGeometry>,
    controls: LiveControls,
  ) {
    this.layer = this.renderer.domElement;
    this.layer.classList.add('monitor-layer');
    this.layer.style.display = 'none';
    over.after(this.layer);
    const btn = (name: Parameters<typeof icon>[0], title: string, run: () => void, text?: string) =>
      h('button.btn.monitor-btn', { type: 'button', title, 'aria-label': title, onclick: (e: Event) => (e.stopPropagation(), run()) }, icon(name, 18), text ?? '') as HTMLButtonElement;
    this.label = h('span.monitor-title', {}, '');
    this.nextBtn = btn('next', 'Next service (C)', controls.next);
    const bar = h(
      'div.monitor-bar',
      {},
      h('span.monitor-live', {}, 'LIVE'),
      this.label,
      btn('refresh', 'Reload (R)', controls.reload),
      this.nextBtn,
      btn('screen', 'Full screen (O)', controls.full),
      btn('external', 'Open in a tab', controls.tab),
      btn('close', 'Back to the deck (Esc)', controls.back, 'Back'),
    );
    this.holder = h('div.monitor-holder');
    this.el = h('div.monitor-page', { style: `width:${PAGE.w}px;height:${PAGE.h}px` }, bar, this.holder);
    this.obj = new CSS3DObject(this.el);
    this.scene.add(this.obj);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private resize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /** The page to show (null: none), and what the toolbar calls it. */
  setPage(url: string | null, title: string, many: boolean) {
    this.label.textContent = title;
    this.nextBtn.hidden = !many;
    if (url === this.url) return;
    this.url = url;
    if (!url) this.unload();
    else if (this.frame) this.frame.src = url;
  }

  /** Loads the page again from the service. */
  reload() {
    if (this.frame && this.url) this.frame.src = this.url;
  }

  /** The frame, made when the page first shows (index.ts pulls the keyboard back off it). */
  get iframe(): HTMLIFrameElement | null {
    return this.frame;
  }

  private load() {
    if (this.frame || !this.url) return;
    // The service's own origin (never the office's: pick.ts), in a sandbox, sending no referrer and
    // allowed no camera, mic, clipboard or the like.
    this.frame = h('iframe.monitor-frame', { src: this.url, title: 'Live page of the service on the monitor', sandbox: MONITOR_SANDBOX, referrerpolicy: 'no-referrer', allow: '', loading: 'eager' }) as HTMLIFrameElement;
    this.holder.replaceChildren(this.frame);
  }

  private unload() {
    this.frame?.remove();
    this.frame = null;
  }

  /** Shows the layer or takes it away; `using` gives the page the mouse. */
  set(shown: boolean, using: boolean) {
    if (shown && !this.shown) this.load();
    if (!shown && this.shown) this.hiddenAt = performance.now();
    this.shown = shown;
    this.using = shown && using;
    this.layer.style.display = shown ? '' : 'none';
    this.layer.classList.toggle('using', this.using);
  }

  /** Places the page on the screen and draws the layer: only while it shows. */
  render(camera: THREE.Camera) {
    if (!this.shown) {
      if (this.frame && this.hiddenAt && performance.now() - this.hiddenAt > UNLOAD_AFTER) this.unload();
      return;
    }
    this.face.updateWorldMatrix(true, false);
    this.face.matrixWorld.decompose(this.obj.position, this.obj.quaternion, this.obj.scale);
    const k = this.face.geometry.parameters.width / PAGE.w;
    this.obj.scale.multiplyScalar(k);
    this.renderer.render(this.scene, camera);
  }
}
