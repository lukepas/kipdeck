import './character.css';
import * as THREE from 'three';
import { HAIR_COLOR_NAMES, HAIR_COLORS, HAIR_STYLES, SKIN_TONES, randomLook, randomName, type Look } from '../../shared/avatar';
import { AVATAR_COLORS, saveProfile, store, type Profile } from '../state';
import { Person } from '../world/character';
import { toonUnique } from '../world/toon';
import { h, openModal } from './dom';
import { icon } from './icons';

/** A turntable with your character on it, drawn with its own small renderer. */
class Preview {
  readonly person: Person;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
  private raf = 0;
  private resize: ResizeObserver;
  private yaw = 0.5;
  private dragging = false;
  private lastDrag = -Infinity;

  constructor(
    private canvas: HTMLCanvasElement,
    p: Profile,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.toneMapping = THREE.NeutralToneMapping;

    // The deck's light: a cool fill from above and the slate below, and one cool key.
    this.scene.add(new THREE.HemisphereLight('#AEB8C4', '#0D131A', 1.6));
    const sun = new THREE.DirectionalLight('#DCE3EA', 2.4);
    sun.position.set(-3, 6, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.02;
    Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 0.5, far: 20 });
    this.scene.add(sun);
    const rug = new THREE.Mesh(new THREE.CircleGeometry(0.9, 40), toonUnique('#1A222C'));
    rug.rotation.x = -Math.PI / 2;
    rug.receiveShadow = true;
    this.scene.add(rug);

    this.person = new Person(p.name, p.color, p.look);
    this.person.showLabel(false);
    this.scene.add(this.person.root);
    this.camera.position.set(0, 1.45, 5.2);
    this.camera.lookAt(0, 0.95, 0);

    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(canvas);
    this.fit();

    canvas.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.yaw += e.movementX * 0.012;
      this.lastDrag = performance.now();
    });
    const release = () => {
      this.dragging = false;
      this.lastDrag = performance.now();
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);

    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      this.tick(dt, now / 1000);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  /** A reach of the hand, to show a change landed. */
  cheer() {
    this.person.reach();
  }

  private fit() {
    const w = this.canvas.clientWidth;
    const hgt = this.canvas.clientHeight;
    if (!w || !hgt) return;
    this.renderer.setSize(w, hgt, false);
    this.camera.aspect = w / hgt;
    this.camera.updateProjectionMatrix();
  }

  private tick(dt: number, t: number) {
    // Left alone, the operator turns from side to side so you see the head plate from every angle.
    if (!this.dragging && performance.now() - this.lastDrag > 1500) {
      const want = Math.sin(t * 0.6) * 1.1;
      this.yaw += (want - this.yaw) * Math.min(1, dt * 1.5);
    }
    this.person.root.rotation.y = this.yaw;
    this.person.update(dt, t, false, false);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resize.disconnect();
    this.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose();
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

/**
 * Your operator, from Settings or the People panel: your name, the shell's tone, the head plate and
 * its tone, and the yoke's color (the one place your color shows), with a live preview. Nobody has to see it to come in: a new browser gets a look dealt at random (main.ts).
 */
export function openCharacter(onSave: (p: Profile) => void) {
  const pick: Profile = { ...store.profile, look: { ...store.profile.look } };
  const canvas = h('canvas', { 'aria-label': 'Your operator, drag to turn' }) as HTMLCanvasElement;
  const preview = new Preview(canvas, pick);

  // Leave the name blank (or skip this) and you go by the made-up one in the box; deals another.
  // Guest is what you were before you picked one, so it isn't a name to keep.
  const input = h('input', { type: 'text', maxlength: 24, value: pick.name === 'Guest' ? '' : pick.name, placeholder: randomName(), 'aria-label': 'Your name' }) as HTMLInputElement;
  const reroll = h('button.btn', { type: 'button', title: 'Random name', 'aria-label': 'Random name' }, icon('refresh', 16));
  reroll.addEventListener('click', () => {
    let name = randomName();
    while (name === input.value || name === input.placeholder) name = randomName();
    input.value = input.placeholder = name;
    input.focus();
  });
  const typedName = () => input.value.trim().slice(0, 24) || input.placeholder;
  // Your account's name is the one everyone sees; only the look is yours to change here.
  const account = store.me.account;
  if (account) {
    input.value = account.name;
    input.readOnly = true;
    input.title = 'Your account name';
  }

  const skinRow = h('div.swatches', { role: 'radiogroup', 'aria-label': 'Shell tone' });
  const styleRow = h('div.seg', { role: 'radiogroup', 'aria-label': 'Head plate' });
  const hairRow = h('div.swatches', { role: 'radiogroup', 'aria-label': 'Plate tone' });
  const shirtRow = h('div.swatches', { role: 'radiogroup', 'aria-label': 'Yoke color' });

  const swatch = (color: string, label: string, on: boolean, choose: () => void) =>
    h('button.swatch', { type: 'button', role: 'radio', 'aria-checked': String(on), style: `background:${color}`, class: on ? 'sel' : '', 'aria-label': label, title: label, onclick: choose });

  const change = (look: Partial<Look>, color?: string) => {
    Object.assign(pick.look, look);
    if (color) pick.color = color;
    preview.person.setLook(pick.look);
    preview.person.setColor(pick.color);
    preview.cheer();
    paint();
  };

  const paint = () => {
    const { skin, hair, style } = pick.look;
    skinRow.replaceChildren(...SKIN_TONES.map((c, i) => swatch(c, `Shell tone ${i + 1} of ${SKIN_TONES.length}`, i === skin, () => change({ skin: i }))));
    styleRow.replaceChildren(
      ...HAIR_STYLES.map((name, i) =>
        h('button.btn', { type: 'button', role: 'radio', 'aria-checked': String(i === style), class: i === style ? 'on' : '', onclick: () => change({ style: i }) }, name),
      ),
    );
    hairRow.replaceChildren(...HAIR_COLORS.map((c, i) => swatch(c, HAIR_COLOR_NAMES[i], i === hair, () => change({ hair: i }))));
    shirtRow.replaceChildren(...AVATAR_COLORS.map((c) => swatch(c, `Yoke ${c}`, c === pick.color, () => change({}, c))));
  };
  paint();

  const surprise = h('button.btn', { type: 'button', title: 'Random look' }, 'Random look');
  surprise.addEventListener('click', () => change(randomLook(), AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]));
  const save = h('button.btn.primary', { type: 'submit' }, 'Save');
  const close = h('button.btn.close', { type: 'button', 'aria-label': 'Close', title: 'Close (Esc)' }, icon('close', 16));

  const form = h(
    'form.modal.charsel',
    { role: 'dialog', 'aria-label': 'Your operator' },
    h('header', {}, h('h2', {}, 'Your operator'), close),
    h(
      'div.body',
      {},
      h('div.charsel-stage', {}, canvas, h('span.tip', {}, 'Drag to turn')),
      h(
        'div.charsel-opts',
        {},
        h('label', {}, 'Your name'),
        account ? input : h('div.webhook', {}, input, reroll),
        account ? h('p.setting-note', {}, `Signed in as ${account.name}, so that's your name here.`) : null,
        h('label', {}, 'Shell'),
        skinRow,
        h('label', {}, 'Head plate'),
        styleRow,
        h('label', {}, 'Plate tone'),
        hairRow,
        h('label', {}, 'Yoke'),
        shirtRow,
      ),
    ),
    h('footer', {}, surprise, h('span.grow'), save),
  ) as HTMLFormElement;

  const finish = (name: string) => {
    store.profile = { name, color: pick.color, look: { ...pick.look } };
    saveProfile(store.profile);
    modal.close();
    onSave(store.profile);
  };
  const modal = openModal(form, {
    doing: 'picking a new look',
    onClose: () => preview.dispose(),
  });
  close.addEventListener('click', () => modal.close());
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    finish(typedName());
  });
  if (!account) setTimeout(() => input.focus(), 30);
}
