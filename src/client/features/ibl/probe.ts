import * as THREE from 'three';

/**
 * A light probe: a small cube of what one layer of the scene looks like from one point, captured a
 * face a frame so no frame pays for all six, then prefiltered (PMREM) into the blurred mips a rough
 * surface reads its reflections from. Its texture is made at once (black until the first capture) and
 * is the same object for good after: a material is compiled with it from the first frame, and a new
 * capture only draws into it, so nothing ever compiles again for it.
 */
export class Probe {
  readonly texture: THREE.Texture;
  readonly cube: THREE.WebGLCubeRenderTarget;
  readonly target: THREE.WebGLRenderTarget;
  private readonly cameras: THREE.PerspectiveCamera[] = [];
  /** The face to draw next, while a capture is under way; -1 between captures. */
  private face = -1;
  /** A capture asked for while one was under way: it starts again when this one ends. */
  private again = false;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly pmrem: THREE.PMREMGenerator,
    readonly position: THREE.Vector3,
    /** The layer it sees (and only that). */
    readonly layer: number,
    size = 128,
    /** What's behind everything it sees. */
    private readonly background = new THREE.Color(0, 0, 0),
  ) {
    this.cube = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    // The six cameras of a CubeCamera, looking down each axis as a cube map's faces are laid out.
    const cubeCamera = new THREE.CubeCamera(0.1, 120, this.cube);
    cubeCamera.coordinateSystem = renderer.coordinateSystem;
    cubeCamera.updateCoordinateSystem();
    cubeCamera.position.copy(position);
    cubeCamera.updateMatrixWorld(true);
    for (const c of cubeCamera.children as THREE.PerspectiveCamera[]) {
      c.layers.set(layer);
      c.updateMatrixWorld(true);
      this.cameras.push(c);
    }
    this.cameraRig = cubeCamera;
    // Black to start with, prefiltered once, so the texture is there (and its size fixed) from the start.
    const was = renderer.getRenderTarget();
    const clear = renderer.getClearColor(new THREE.Color());
    const alpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 1);
    for (let f = 0; f < 6; f++) {
      renderer.setRenderTarget(this.cube, f);
      renderer.clear(true, false, false);
    }
    renderer.setRenderTarget(was);
    renderer.setClearColor(clear, alpha);
    this.target = pmrem.fromCubemap(this.cube.texture);
    this.texture = this.target.texture;
  }

  private readonly cameraRig: THREE.CubeCamera;

  /** Starts a capture (or a second one after the one under way). */
  capture() {
    if (this.face >= 0) this.again = true;
    else this.face = 0;
  }

  /** Whether a capture is under way. */
  busy(): boolean {
    return this.face >= 0;
  }

  /** Draws the next face of a capture under way into `scene`'s cube, and prefilters it after the sixth. Call once a frame. */
  step(scene: THREE.Scene) {
    if (this.face < 0) return;
    const r = this.renderer;
    if (this.face < 6) {
      const was = { target: r.getRenderTarget(), face: r.getActiveCubeFace(), mip: r.getActiveMipmapLevel(), bg: scene.background, fog: scene.fog, shadows: r.shadowMap.needsUpdate, auto: r.shadowMap.autoUpdate };
      scene.background = this.background;
      scene.fog = null;
      // The room's shadows don't change for its own reflection: no shadow pass for a probe's face.
      r.shadowMap.autoUpdate = false;
      r.shadowMap.needsUpdate = false;
      r.setRenderTarget(this.cube, this.face);
      r.render(scene, this.cameras[this.face]);
      r.setRenderTarget(was.target, was.face, was.mip);
      scene.background = was.bg;
      scene.fog = was.fog;
      r.shadowMap.autoUpdate = was.auto;
      r.shadowMap.needsUpdate = was.shadows;
      this.face++;
      return;
    }
    this.pmrem.fromCubemap(this.cube.texture, this.target);
    this.face = this.again ? 0 : -1;
    this.again = false;
  }

  /** What it holds in memory (bytes): the cube and its prefiltered target, half floats. */
  bytes(): number {
    const size = this.cube.width;
    return size * size * 6 * 8 + this.target.width * this.target.height * 8;
  }

  dispose() {
    this.cube.dispose();
    this.target.dispose();
    void this.cameraRig;
  }
}
