import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';
import type { Stage } from '../../core/scene';

/** How strong the glow is, how wide, and how bright a pixel must be to glow (linear, before exposure). */
export interface BloomLook {
  strength: number;
  radius: number;
  threshold: number;
}

/** The glow, once it's loaded: retuned with the lights' mode, or put away (the plain render again). */
export interface Bloom {
  set(look: BloomLook): void;
  on(yes: boolean): void;
  /** The glow's own size against the frame's (Settings > Bridge > Quality: 1 at High, 0.5 at Medium), and the frame's pixel ratio taken again. */
  scale(k: number): void;
}

/**
 * The glow round what's brightest (the lit edges, the state lights, star points, the jump's flash):
 * the frame drawn through a composer in place of the plain render (see core/loop.ts). Tone mapping and
 * exposure are applied once, near the end (OutputPass), so the threshold reads the scene's own light.
 * Its targets are not multisampled: on Apple's GPUs that alone made one frame in twenty miss its
 * vsync. FXAA, last, smooths the edges instead, for one cheap pass. At Medium the glow's own targets are
 * half the frame's size (its blur hides it), a quarter of the fill.
 * Loaded only when it's first wanted: the composer and its passes stay out of everyone else's download.
 */
export function makeBloom(stage: Stage, camera: THREE.Camera, look: BloomLook): Bloom {
  const { renderer, scene } = stage;
  const size = renderer.getSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
  const composer = new EffectComposer(renderer, target);
  const render = new RenderPass(scene, camera);
  const pass = new UnrealBloomPass(size, look.strength, look.radius, look.threshold);
  let scale = 1;
  const sizeAt = pass.setSize.bind(pass);
  pass.setSize = (w: number, h: number) => sizeAt(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)));
  composer.addPass(render);
  composer.addPass(pass);
  composer.addPass(new OutputPass());
  composer.addPass(new FXAAPass());
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
    scale(k) {
      scale = k;
      fit();
    },
  };
}
