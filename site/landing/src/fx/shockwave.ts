// The merge's shockwave: one ring of light in the Settled green (Signal is kept for waits) that
// leaves the Merge button, with a thin fringe like glass bending the page behind it. It reaches
// across the viewport, or only as far as the caller asks (the loop keeps it round the button). One small WebGL1 pass on one canvas, or the same ring in Canvas2D
// where WebGL is missing. Pointer events pass straight through it.
//
// The canvas, its context and the compiled program are made ahead of time (warmShockwave, called
// while the browser is idle once the loop is a viewport away) and kept, hidden, for every ring
// after: compiling shaders on the merge itself cost a dropped frame at the page's climax.
import { rgbOf } from '../engine/env';

// The ring is drawn as an annulus mesh that covers only the band where it has light (its core,
// both fringes), not the whole screen: a fraction of the pixels, which is what a phone's GPU (or a
// software one) runs out of first. The vertex shader places the band for the frame's radius. Both
// stages declare mediump floats: uniforms they share must match in precision, or the link fails.
const SEGMENTS = 160;
const VERT = `precision mediump float;
attribute vec3 a;uniform vec2 res;uniform vec2 at;uniform float t;uniform float scale;uniform float reach;uniform float wide;
void main(){
  float r=t*reach;float w=(22.+90.*t)*wide;
  float rr=max(0.,mix(r-1.1*w,r+1.1*w,a.z));
  vec2 p=at+a.xy*rr*scale;
  gl_Position=vec4(p.x/res.x*2.-1.,1.-p.y/res.y*2.,0.,1.);
}`;
const FRAG = `precision mediump float;
uniform vec2 res;uniform vec2 at;uniform float t;uniform vec3 core;uniform vec3 rim;uniform float scale;uniform float reach;uniform float wide;
float ring(float d,float r,float w){return smoothstep(w,0.,abs(d-r));}
void main(){
  vec2 q=gl_FragCoord.xy;q.y=res.y-q.y;
  float d=distance(q,at)/scale;
  float r=t*reach;
  float fade=1.-t;fade*=fade;
  float w=(22.+90.*t)*wide;
  float a=ring(d,r,w);
  float fr=ring(d,r-w*.35,w*.45)*.55;
  float fb=ring(d,r+w*.35,w*.45)*.55;
  vec3 c=mix(core,rim,smoothstep(.0,.6,t))*a+rim*fr+rim*fb;
  float alpha=clamp((a*.85+fr+fb)*fade,0.,1.);
  gl_FragColor=vec4(c*fade,alpha);
}`;

/** The annulus as a triangle strip: (cos, sin, 0 inner | 1 outer) per vertex. */
function annulus(): Float32Array {
  const v = new Float32Array((SEGMENTS + 1) * 2 * 3);
  for (let i = 0; i <= SEGMENTS; i++) {
    const th = (i / SEGMENTS) * Math.PI * 2;
    const c = Math.cos(th), s = Math.sin(th);
    v.set([c, s, 0, c, s, 1], i * 6);
  }
  return v;
}

type Ring = {
  /** Draws the ring at progress t (0 to 1). */
  draw(t: number): void;
  /** Sets where the ring starts (viewport px), how far it goes (px) and the drawing size. */
  place(x: number, y: number, reach: number): void;
};

/** The ring in WebGL on `canvas`, or null where WebGL is missing or the program will not link. */
function glRing(canvas: HTMLCanvasElement, dpr: number, core: number[], rim: number[]): { ring: Ring; ready: Promise<void> } | null {
  const gl = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: true, antialias: false });
  if (!gl) return null;
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  // Where the driver can compile off the main thread, wait for it before asking whether it linked
  // (asking blocks until it is done).
  const parallel = gl.getExtension('KHR_parallel_shader_compile') as { COMPLETION_STATUS_KHR: number } | null;
  const compiled = new Promise<void>((resolve) => {
    if (!parallel) return resolve();
    const poll = () => (gl.getProgramParameter(prog, parallel.COMPLETION_STATUS_KHR) ? resolve() : requestAnimationFrame(poll));
    poll();
  });
  let ok = true;
  let set = false;
  const u = (n: string) => gl.getUniformLocation(prog, n);
  let ut: WebGLUniformLocation | null = null, ures: WebGLUniformLocation | null = null, uat: WebGLUniformLocation | null = null;
  let ureach: WebGLUniformLocation | null = null, uwide: WebGLUniformLocation | null = null;
  const setup = (): boolean => {
    if (set) return ok;
    set = true;
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return (ok = false);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, annulus(), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform3f(u('core'), core[0], core[1], core[2]);
    gl.uniform3f(u('rim'), rim[0], rim[1], rim[2]);
    gl.uniform1f(u('scale'), dpr);
    ut = u('t');
    ures = u('res');
    uat = u('at');
    ureach = u('reach');
    uwide = u('wide');
    return ok;
  };
  const ring: Ring = {
    draw(t) {
      if (!setup()) return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(ut, t);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, (SEGMENTS + 1) * 2);
    },
    place(x, y, reach) {
      if (!setup()) return;
      gl.uniform2f(ures, canvas.width, canvas.height);
      gl.uniform2f(uat, x * dpr, y * dpr);
      gl.uniform1f(ureach, reach);
      gl.uniform1f(uwide, widthFor(reach));
    },
  };
  // One fully faded frame, so the driver has done its first draw too before the merge.
  const ready = compiled.then(() => {
    if (!setup()) return;
    ring.place(0, 0, fullReach());
    ring.draw(1);
  });
  // A program that failed to link (checked only once it has compiled) means no WebGL ring.
  if (!parallel && !setup()) {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return null;
  }
  return { ring, ready };
}

/** The same ring in Canvas2D. */
function flatRing(canvas: HTMLCanvasElement, dpr: number, core: number[], rim: number[]): Ring {
  const ctx = canvas.getContext('2d')!;
  const css = (c: number[], a: number) => `rgba(${c.map((v) => Math.round(v * 255)).join(',')},${a})`;
  let x = 0, y = 0, reach = 0, wide = 1;
  return {
    draw(t) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      const r = t * reach;
      const fade = (1 - t) * (1 - t);
      ctx.lineWidth = (6 + 40 * t) * wide;
      ctx.strokeStyle = css(rim, 0.5 * fade);
      ctx.beginPath();
      ctx.arc(x, y, r + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = (3 + 18 * t) * wide;
      ctx.strokeStyle = css(core, 0.9 * fade);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    },
    place(px, py, far) {
      x = px;
      y = py;
      reach = far;
      wide = widthFor(far);
    },
  };
}

/** Far enough to cross the whole viewport from anywhere on it. */
const fullReach = () => 1.25 * Math.hypot(innerWidth, innerHeight);
/** A short ring is a thin one: its band scales with how far it goes. */
const widthFor = (reach: number) => Math.min(1, Math.max(0.15, reach / 1200));

type Kept = { canvas: HTMLCanvasElement; ring: Ring; dpr: number; ready: Promise<void> };
let kept: Kept | null = null;

/** Makes the ring's canvas, context and program now, hidden, so the first merge only draws. */
export function warmShockwave(): Promise<void> {
  if (kept) return kept.ready;
  // The ring is soft light, so it is drawn at a little over half the screen's pixels and scaled up:
  // a third of the fill, and a small texture for the compositor to take on.
  const dpr = Math.min(devicePixelRatio || 1, 1.5) * 0.6;
  const make = () => {
    const c = document.createElement('canvas');
    c.className = 'shockwave';
    c.setAttribute('aria-hidden', 'true');
    c.width = Math.round(innerWidth * dpr);
    c.height = Math.round(innerHeight * dpr);
    c.style.visibility = 'hidden';
    return c;
  };
  const core = rgbOf('--settled', [0.24, 0.86, 0.59]);
  const rim = core;
  let canvas = make();
  const gl = glRing(canvas, dpr, core, rim);
  let ring: Ring;
  let ready = Promise.resolve();
  if (gl) {
    ring = gl.ring;
    ready = gl.ready;
  } else {
    // A canvas that tried WebGL cannot draw 2D, so the fallback gets a fresh one.
    canvas = make();
    ring = flatRing(canvas, dpr, core, rim);
  }
  document.body.append(canvas);
  kept = { canvas, ring, dpr, ready };
  return ready;
}

let running = 0;

/** Sends one ring out from (x, y) in viewport pixels, `reach` px at most (the whole viewport by
 *  default). Resolves when it has gone. */
export function shockwave(x: number, y: number, ms = 1100, reach = fullReach()): Promise<void> {
  void warmShockwave();
  const { canvas, ring, dpr } = kept!;
  const w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ring.place(x, y, reach);
  canvas.style.visibility = 'visible';
  const id = ++running;
  const start = performance.now();
  return new Promise((resolve) => {
    const tick = (now: number) => {
      if (id !== running) return resolve();
      const t = Math.min(1, (now - start) / ms);
      ring.draw(1 - Math.pow(1 - t, 2.2));
      if (t < 1) requestAnimationFrame(tick);
      else {
        canvas.style.visibility = 'hidden';
        resolve();
      }
    };
    requestAnimationFrame(tick);
  });
}
