import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import type { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import type { Stage } from '../../core/scene';

/** How strong the glow is, how wide, and how bright a pixel must be to glow (linear, before exposure). */
export interface BloomLook {
  strength: number;
  radius: number;
  threshold: number;
}

/** How the frame's edges are smoothed at the end: FXAA (one pass) or SMAA (three, sharper on the boards' type). */
export type EdgeAa = 'fxaa' | 'smaa';

/**
 * The frame drawn through a composer, once it's loaded: the scene, its glow (on or off with the
 * lights' mode), tone mapping, a grade laid in by another part (features/cinema), and the edges
 * smoothed. Put away, the frame is the plain render again.
 */
export interface Bloom {
  set(look: BloomLook): void;
  /** Whether the composer draws the frame at all (none at Low). */
  on(yes: boolean): void;
  /** Whether the glow is drawn (Night has one, Day none); the rest of the chain stays. */
  glow(yes: boolean): void;
  /** Whether the glow is drawn now. */
  glowing(): boolean;
  /** The glow's own size against the frame's (Settings > Bridge > Quality: 1 at High, 0.5 at Medium), and the frame's pixel ratio taken again. */
  scale(k: number): void;
  /** How the edges are smoothed (Settings > Bridge > Quality: SMAA at High, FXAA at Medium). */
  aa(kind: EdgeAa): void;
  /** Lays `pass` in after tone mapping and before the edges are smoothed: it reads display colours. */
  grade(pass: Pass): void;
  /** Lays `pass` in straight after the scene, before the glow: it draws over the scene (the first-person hands). */
  overlay(pass: Pass): void;
  /** The glow alone, as last drawn (linear light, at the glow's own size): what a grade weights its lens dirt by. */
  glowTexture(): THREE.Texture;
  /** The frame's size in drawn pixels. */
  size(): THREE.Vector2;
}

/**
 * The glow round what's brightest (the lit edges, the state lights, star points, the jump's flash):
 * the frame drawn through a composer in place of the plain render (see core/loop.ts). Tone mapping and
 * exposure are applied once, near the end (OutputPass), so the threshold reads the scene's own light.
 * Its targets are not multisampled: on Apple's GPUs that alone made one frame in twenty miss its
 * vsync. FXAA or SMAA, last, smooths the edges instead. At Medium the glow's own targets are half the
 * frame's size (its blur hides it), a quarter of the fill. Day draws through it too, with the glow
 * off, so a Night and Day switch never changes which programs draw the deck.
 * Loaded only when it's first wanted: the composer and its passes stay out of everyone else's download.
 */
export function makeBloom(stage: Stage, camera: THREE.Camera, look: BloomLook): Bloom {
  const { renderer, scene } = stage;
  const size = renderer.getSize(new THREE.Vector2());
  const drawn = new THREE.Vector2();
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
  const composer = new EffectComposer(renderer, target);
  const render = new RenderPass(scene, camera);
  const pass = new UnrealBloomPass(size, look.strength, look.radius, look.threshold);
  let scale = 1;
  const sizeAt = pass.setSize.bind(pass);
  pass.setSize = (w: number, h: number) => sizeAt(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)));
  const fxaa = new FXAAPass();
  const smaa = new SMAAPass();
  smaa.enabled = false;
  // Its edges and blend weights as SMAA has them (8 bits a channel), not half floats: half the memory.
  const smaaTargets = smaa as unknown as Record<'_edgesRT' | '_weightsRT', THREE.WebGLRenderTarget>;
  for (const rt of [smaaTargets._edgesRT, smaaTargets._weightsRT]) rt.texture.type = THREE.UnsignedByteType;
  composer.addPass(render);
  composer.addPass(pass);
  composer.addPass(new OutputPass());
  composer.addPass(fxaa);
  composer.addPass(smaa);
  const fit = () => {
    renderer.getSize(size);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(size.x, size.y);
  };
  window.addEventListener('resize', fit);
  fit();
  const draw = (cam: THREE.Camera) => {
    render.camera = cam;
    composer.render();
  };
  return {
    set(l) {
      pass.strength = l.strength;
      pass.radius = l.radius;
      pass.threshold = l.threshold;
    },
    on(yes) {
      stage.draw = yes ? draw : null;
    },
    glow(yes) {
      pass.enabled = yes;
    },
    glowing: () => pass.enabled,
    scale(k) {
      if (k === scale) return;
      scale = k;
      fit();
    },
    aa(kind) {
      fxaa.enabled = kind === 'fxaa';
      smaa.enabled = kind === 'smaa';
    },
    grade(p) {
      // After the OutputPass, before the two edge passes.
      composer.insertPass(p, composer.passes.indexOf(fxaa));
      fit();
    },
    overlay(p) {
      composer.insertPass(p, composer.passes.indexOf(render) + 1);
      fit();
    },
    glowTexture: () => pass.renderTargetsHorizontal[0].texture,
    size: () => drawn.set(size.x, size.y).multiplyScalar(renderer.getPixelRatio()),
  };
}
