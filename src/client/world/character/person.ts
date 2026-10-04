import * as THREE from 'three';
import { HAIR_COLORS, SKIN_TONES, type Look } from '../../../shared/avatar';
import type { CarriedIssue } from '../../../shared/protocol';
import { HIPS } from './rig';
import { HeldCard } from '../../features/carrying/card';
import { DECK, flat, matte, matteUnique } from '../office/materials';
import { disposeSprite, mesh, textSprite } from '../toon';
import { REACH_TIME, reachCurve } from './curves';
import { styleHead } from './person-head';

export type Pose = 'stand' | 'walk' | 'sit' | 'type';

/** Voice loudness (RMS) above which someone counts as speaking. */
const SPEAKING = 0.04;

/** Where the line under a person's name plate sits, and how far it lifts the plate. */
const DOING_Y = 1.98;
const DOING_LIFT = 0.2;
/** The thigh and the shin, hip to knee and knee to ankle (m). */
const THIGH = 0.42;
const SHIN = 0.36;

/**
 * An operator: every person on the deck, you and everyone else. The same body family as the units at
 * 1.75 m: a narrow head plate with a visor slit, a tapered torso, two tapered leg columns, and a
 * shoulder yoke in the player's own color (the one place it shows). A mono name plate floats over
 * them, and while they talk the yoke's edge brightens and a mic tick lights. Forward is +z.
 */
export class Person {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private legL: THREE.Object3D;
  private legR: THREE.Object3D;
  private kneeL: THREE.Object3D;
  private kneeR: THREE.Object3D;
  private armL: THREE.Object3D;
  private armR: THREE.Object3D;
  /** The yoke, in the player's color; it lights up as they talk. */
  private yoke: THREE.MeshStandardMaterial;
  private shellMat: THREE.MeshStandardMaterial;
  private plateMat: THREE.MeshStandardMaterial;
  private plate = new THREE.Group();
  private look: Look;
  private label: THREE.Sprite | null = null;
  /** The smaller line under the name plate: what they have open, or where they are (see whereabouts). */
  private doing: THREE.Sprite | null = null;
  private doingText = '';
  private speaking = false;
  private mic: THREE.Mesh;
  private head: THREE.Group;
  private voiceLevel = 0;
  private walkPhase = 0;
  private reachT = -1;
  /** An issue card off the board, held out in front in both hands. */
  private card: HeldCard;
  private cardHolder = new THREE.Group();
  pose: Pose = 'stand';
  /** Hips this high above the feet while sitting (on the seat), or null on their feet. */
  private hips: number | null = null;
  /** The last seat's, so getting up eases back down from it. */
  private seatHips = HIPS;
  /** 0 standing ... 1 sitting, eased between so sitting down and getting up take a moment. */
  private sitK = 0;

  constructor(
    private name: string,
    color: string,
    look: Look,
  ) {
    this.look = { ...look };
    this.yoke = matteUnique(color, { flat: true, emissive: color, emissiveIntensity: 0.08 });
    this.shellMat = matteUnique(SKIN_TONES[look.skin], { flat: true });
    this.plateMat = matteUnique(HAIR_COLORS[look.hair], { flat: true });
    const shell = this.shellMat;
    const joint = matte(DECK.steel, { flat: true, metalness: 0.15, roughness: 0.7 });

    this.root.add(this.body);
    // Pelvis, a torso tapering down to it, and the yoke over the shoulders.
    this.body.add(mesh(new THREE.BoxGeometry(0.3, 0.13, 0.18), joint, 0, HIPS + 0.04, 0));
    const torso = mesh(new THREE.CylinderGeometry(0.2, 0.14, 0.5, 6), shell, 0, HIPS + 0.36, 0);
    torso.scale.z = 0.7;
    this.body.add(torso);
    const yoke = mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.09, 6), this.yoke, 0, HIPS + 0.62, 0);
    yoke.scale.z = 0.72;
    this.body.add(yoke);
    // The head plate on its neck, its visor slit, and what's on top of it (styleHead).
    this.body.add(mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.1, 6), joint, 0, HIPS + 0.69, 0));
    const head = (this.head = new THREE.Group());
    head.position.y = HIPS + 0.84;
    head.add(mesh(new THREE.BoxGeometry(0.2, 0.25, 0.22), this.plateMat, 0, 0, 0));
    head.add(mesh(new THREE.BoxGeometry(0.17, 0.026, 0.012), new THREE.MeshBasicMaterial({ color: '#5F7184', toneMapped: false }), 0, 0.025, 0.112, false));
    head.add(this.plate);
    styleHead(this.plate, this.plateMat, look.style);
    this.body.add(head);

    // Legs: a tapered thigh from the hip and a shin from the knee, so they sit with their knees bent.
    const leg = (x: number): [THREE.Object3D, THREE.Object3D] => {
      const hip = new THREE.Group();
      hip.position.set(x, HIPS, 0);
      hip.add(mesh(new THREE.CylinderGeometry(0.075, 0.06, THIGH, 6), shell, 0, -THIGH / 2, 0));
      const knee = new THREE.Group();
      knee.position.y = -THIGH;
      knee.add(mesh(new THREE.CylinderGeometry(0.058, 0.045, SHIN, 6), shell, 0, -SHIN / 2, 0));
      knee.add(mesh(new THREE.BoxGeometry(0.1, 0.045, 0.2), joint, 0, -SHIN - 0.0, 0.04));
      hip.add(knee);
      this.body.add(hip);
      return [hip, knee];
    };
    [this.legL, this.kneeL] = leg(-0.1);
    [this.legR, this.kneeR] = leg(0.1);
    // Arm blades from the shoulders, longer than a unit's.
    const arm = (x: number) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, HIPS + 0.58, 0);
      pivot.add(mesh(new THREE.CylinderGeometry(0.05, 0.035, 0.54, 6), shell, 0, -0.27, 0));
      pivot.add(mesh(new THREE.BoxGeometry(0.06, 0.09, 0.07), joint, 0, -0.57, 0));
      this.body.add(pivot);
      return pivot;
    };
    this.armL = arm(-0.27);
    this.armR = arm(0.27);
    // Between the hands when both arms are out in front (see update), its front to whoever they walk up to.
    const holder = this.cardHolder;
    holder.position.set(0, HIPS + 0.38, 0.4);
    holder.rotation.x = -0.1;
    this.body.add(holder);
    this.card = new HeldCard(holder, 0.46);
    // The mic tick that lights while they speak, beside the name plate.
    this.mic = mesh(new THREE.BoxGeometry(0.035, 0.11, 0.035), new THREE.MeshBasicMaterial({ color: DECK.working, toneMapped: false }), 0, 2.2, 0, false);
    this.mic.visible = false;
    this.root.add(this.mic);

    this.setLabel(name, false);
  }

  setColor(color: string) {
    this.yoke.color.set(color);
    this.yoke.emissive.set(color);
  }

  /** The shell's tone. */
  get skinColor(): string {
    return SKIN_TONES[this.look.skin];
  }

  setLook(look: Look) {
    const restyle = look.style !== this.look.style;
    this.look = { ...look };
    this.plateMat.color.set(HAIR_COLORS[look.hair]);
    if (restyle) styleHead(this.plate, this.plateMat, look.style);
    this.shellMat.color.set(SKIN_TONES[look.skin]);
  }

  setLabel(name: string, muted: boolean | null) {
    this.name = name;
    if (this.label) {
      this.root.remove(this.label);
      disposeSprite(this.label);
    }
    const suffix = muted === null ? '' : muted ? '  MIC OFF' : '';
    this.label = textSprite(`${name}${suffix}`, { face: 'mono', bg: 'rgba(13,19,26,0.86)', border: '#3A4756', size: 32 });
    this.root.add(this.label);
    this.placeLabels();
  }

  /** Puts a smaller line under the name plate, like "in Pixel's terminal"; none (or '') takes it away. */
  setDoing(text: string | undefined) {
    text ??= '';
    if (text === this.doingText) return;
    this.doingText = text;
    if (this.doing) {
      this.root.remove(this.doing);
      disposeSprite(this.doing);
      this.doing = null;
    }
    if (text) {
      this.doing = textSprite(text, { bg: 'rgba(20,27,35,0.86)', color: '#8A97A5', border: '#26313D', size: 24 });
      this.doing.position.y = DOING_Y;
      this.doing.visible = this.label?.visible ?? true;
      this.root.add(this.doing);
    }
    this.placeLabels();
  }

  /** Where a chat bubble goes: over the name plate, however high it sits. */
  get bubbleY(): number {
    return 2.4 + (this.doing ? DOING_LIFT : 0);
  }

  /** The name plate and the mic tick move up out of the way of the line under them. */
  private placeLabels() {
    const lift = this.doing ? DOING_LIFT : 0;
    if (this.label) this.label.position.y = 2.0 + lift;
    this.mic.position.set((this.label?.scale.x ?? 0.5) / 2 + 0.06, 2.0 + lift, 0);
  }

  /** How loud this person is talking right now (0 when silent): lights the mic tick and the yoke's edge. */
  setVoiceLevel(level: number) {
    this.voiceLevel = level;
    this.speaking = level > SPEAKING;
    this.mic.visible = this.speaking;
  }

  showLabel(v: boolean) {
    if (this.label) this.label.visible = v;
    if (this.doing) this.doing.visible = v;
  }

  /** Reach out with the right hand, as if pressing or grabbing something in front of you. */
  reach() {
    this.reachT = 0;
  }

  /** Carries an issue card in both hands, or puts it down (null). */
  carry(card: CarriedIssue | null | undefined) {
    this.card.set(card);
  }

  /** Sits down with the hips `hips` above the feet, on a couch or a chair, or gets up (null). */
  sit(hips: number | null) {
    this.hips = hips;
    if (hips !== null) this.seatHips = hips;
    this.pose = hips === null ? 'stand' : 'sit';
  }

  /** `pace` speeds up the stride for someone walking faster than usual. */
  update(dt: number, _t: number, moving: boolean, airborne: boolean, pace = 1) {
    const target = moving ? 1 : 0;
    this.walkPhase += dt * 9 * target * pace;
    const swing = Math.sin(this.walkPhase) * 0.5 * target;
    let kneeL = Math.max(0, -Math.sin(this.walkPhase)) * 0.5 * target;
    let kneeR = Math.max(0, Math.sin(this.walkPhase)) * 0.5 * target;
    if (airborne) {
      this.legL.rotation.x = -0.4;
      this.legR.rotation.x = 0.2;
      kneeL = 0.6;
      kneeR = 0.3;
      this.armL.rotation.x = this.armR.rotation.x = -0.3;
    } else {
      this.legL.rotation.x = swing;
      this.legR.rotation.x = -swing;
      this.armL.rotation.x = -swing * 0.8;
      this.armR.rotation.x = swing * 0.8;
    }
    this.armL.rotation.z = THREE.MathUtils.lerp(this.armL.rotation.z, -0.06, 0.3);
    this.armR.rotation.z = THREE.MathUtils.lerp(this.armR.rotation.z, 0.06, 0.3);
    this.sitK += ((this.hips === null ? 0 : 1) - this.sitK) * Math.min(1, dt * 10);
    const sit = this.sitK > 0.001 ? this.sitK : 0;
    if (sit) {
      // Thighs out level over the seat, shins straight down, hands on the knees.
      for (const leg of [this.legL, this.legR]) leg.rotation.x = THREE.MathUtils.lerp(leg.rotation.x, -1.5, sit);
      kneeL = THREE.MathUtils.lerp(kneeL, 1.5, sit);
      kneeR = THREE.MathUtils.lerp(kneeR, 1.5, sit);
      for (const arm of [this.armL, this.armR]) arm.rotation.x = THREE.MathUtils.lerp(arm.rotation.x, -0.7, sit);
    }
    this.kneeL.rotation.x = kneeL;
    this.kneeR.rotation.x = kneeR;
    if (this.card.held) {
      // Both arms out in front, hands on the card's edges: they don't swing while they walk.
      this.armL.rotation.set(-1.2, 0, 0.25);
      this.armR.rotation.set(-1.2, 0, -0.25);
    }
    let reach = 0;
    if (this.reachT >= 0) {
      this.reachT += dt;
      reach = reachCurve(this.reachT / REACH_TIME);
      // Forward is +z, so the figure's right arm is the one on -x.
      this.armL.rotation.x = THREE.MathUtils.lerp(this.armL.rotation.x, -1.55, reach);
      this.armL.rotation.z = THREE.MathUtils.lerp(this.armL.rotation.z, 0.18, reach);
      if (this.reachT >= REACH_TIME) this.reachT = -1;
    }
    this.body.rotation.x = reach * 0.08;
    this.body.position.y = 0;
    // Down onto (or up onto) the seat: the hips go where it puts them.
    if (sit) this.body.position.y = THREE.MathUtils.lerp(0, this.seatHips - HIPS, sit);
    // Talking: the yoke's edge brightens with the voice.
    const loud = THREE.MathUtils.clamp((this.voiceLevel - 0.02) / 0.12, 0, 1);
    this.yoke.emissiveIntensity += (0.08 + loud * 0.5 - this.yoke.emissiveIntensity) * Math.min(1, dt * 20);
    this.head.rotation.set(0, 0, 0);
    this.body.rotation.y = this.body.rotation.z = 0;
  }
}
