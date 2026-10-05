import * as THREE from 'three';
import { heightAt } from '../../../shared/amphitheater';
import { BOARD_MASK_GLSL } from '../bridge/holo-mask';
import { POOL_SOURCES, type Pool } from './plan';

// The pools of light on the floor under what glows (plan.ts): one instanced quad each, a soft ellipse
// or a strip along a wall, 4 mm over the floor and pulled toward the eye like the contact shadows
// (polygonOffset -2), added over the floor. Each takes its level and tint from its source (the boards,
// the holo, the stations, the cove, the side ports), which features/atmos follows from the light rig
// each frame, so a pool dims when the alert dims its lamp, and a side port's pool takes a passing
// planet's colour. They're drawn before the units' marks, never over them: the marks' own instrument
// black sits on top. One draw.

const VERT = /* glsl */ `
attribute vec3 aTint;
attribute vec2 aShape;
varying vec2 vUv;
varying vec3 vTint;
varying vec2 vShape;
void main() {
  vUv = uv;
  vTint = aTint;
  vShape = aShape;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
uniform float uLevel[${POOL_SOURCES.length}];
uniform vec3 uSourceTint[${POOL_SOURCES.length}];
uniform vec2 uRes;
varying vec2 vUv;
varying vec3 vTint;
varying vec2 vShape;
${BOARD_MASK_GLSL}
void main() {
  vec2 q = vUv * 2.0 - 1.0;
  // A soft ellipse (shape 0), or a strip: soft across it and only at its very ends (shape 1).
  float ellipse = 1.0 - smoothstep(0.0, 1.0, dot(q, q));
  float strip = (1.0 - smoothstep(0.0, 1.0, q.y * q.y)) * (1.0 - smoothstep(0.9, 1.0, abs(q.x)));
  float f = mix(ellipse, strip, vShape.y);
  f *= f;
  int s = int(vShape.x + 0.5);
  float level = 0.0;
  vec3 tint = vec3(1.0);
  for (int i = 0; i < ${POOL_SOURCES.length}; i++) {
    if (i == s) {
      level = uLevel[i];
      tint = uSourceTint[i];
    }
  }
  float a = f * level * boardMask(gl_FragCoord.xy / uRes * 2.0 - 1.0);
  gl_FragColor = vec4(vTint * tint * a, 1.0);
  #include <colorspace_fragment>
}`;

export function makePools(list: readonly Pool[], boards: THREE.Vector4[]) {
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const tint = new Float32Array(list.length * 3);
  const shape = new Float32Array(list.length * 2);
  const c = new THREE.Color();
  list.forEach((p, i) => {
    c.set(p.color);
    tint.set([c.r, c.g, c.b], i * 3);
    shape.set([POOL_SOURCES.indexOf(p.source), p.strip ? 1 : 0], i * 2);
  });
  geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 3));
  geo.setAttribute('aShape', new THREE.InstancedBufferAttribute(shape, 2));
  const uniforms = {
    uLevel: { value: POOL_SOURCES.map(() => 0) },
    uSourceTint: { value: POOL_SOURCES.map(() => new THREE.Color(1, 1, 1)) },
    uRes: { value: new THREE.Vector2(1, 1) },
    uBoards: { value: boards },
  };
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms,
    transparent: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    fog: false,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, list.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  list.forEach((p, i) => {
    m.compose(new THREE.Vector3(p.x, heightAt(p.x, p.z) + 0.004, p.z), q.setFromAxisAngle(up, p.rotY), new THREE.Vector3(p.w, 1, p.d));
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.name = 'atmos-pools';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  // In the opaque pass after the floor (render order 1 against the floor's 0) and before the units'
  // marks (2): their inlays are opaque too and write over it.
  mesh.renderOrder = 1;
  return { mesh, uniforms };
}
