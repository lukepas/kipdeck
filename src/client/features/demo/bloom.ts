import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { Stage } from '../../core/scene';

/** The bloom: how strong, how wide, and how bright a pixel must be to glow (only the lit edges, screens and state lights). */
const BLOOM = { strength: 0.4, radius: 0.5, threshold: 0.82 } as const;

/** Demo mode's bloom: the frame drawn through a composer in place of the plain render (see core/loop.ts). */
export function startBloom(stage: Stage, camera: THREE.Camera) {
  const { renderer, scene } = stage;
  const size = renderer.getSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);
  const render = new RenderPass(scene, camera);
  composer.addPass(render);
  composer.addPass(new UnrealBloomPass(size, BLOOM.strength, BLOOM.radius, BLOOM.threshold));
  composer.addPass(new OutputPass());
  const fit = () => {
    renderer.getSize(size);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(size.x, size.y);
  };
  window.addEventListener('resize', fit);
  fit();
  stage.draw = (cam) => {
    render.camera = cam;
    composer.render();
  };
}
