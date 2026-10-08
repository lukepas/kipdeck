// A small spring: a value that chases its target with stiffness and damping, stepped each frame.
// Used where something should land with weight (the wait clock snapping back, a row moving).

export class Spring {
  value: number;
  target: number;
  velocity = 0;
  constructor(value: number, readonly stiffness = 170, readonly damping = 18) {
    this.value = value;
    this.target = value;
  }
  /** Advances by dt seconds; true while it is still moving. */
  step(dt: number): boolean {
    // Semi-implicit Euler in small substeps keeps a stiff spring stable at 30 fps too.
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const force = -this.stiffness * (this.value - this.target) - this.damping * this.velocity;
      this.velocity += force * h;
      this.value += this.velocity * h;
    }
    const moving = Math.abs(this.velocity) > 1e-4 || Math.abs(this.value - this.target) > 1e-4;
    if (!moving) this.value = this.target;
    return moving;
  }
}
