// The merge's shockwave: one ring of light that leaves the Merge button and crosses the viewport,
// Signal at its core and the Proof violet at its rim, with a thin chromatic fringe like glass
// bending the page behind it. One small WebGL1 fragment pass on a canvas that exists only while
// the ring is out (created on the merge, its context freed after), or the same ring in Canvas2D
// where WebGL is missing. Pointer events pass straight through it.
import { rgbOf } from '../engine/env';

// The ring is drawn as an annulus mesh that covers only the band where it has light (its core,
// both fringes), not the whole screen: a fraction of the pixels, which is what a phone's GPU (or a
// software one) runs out of first. The vertex shader places the band for the frame's radius. Both
// stages declare mediump floats: uniforms they share must match in precision, or the link fails.
const SEGMENTS = 160;
const VERT = `precision mediump float;
attribute vec3 a;uniform vec2 res;uniform vec2 at;uniform float t;uniform float scale;
void main(){
  float r=t*1.25*length(res)/scale;float w=22.+90.*t;
  float rr=max(0.,mix(r-1.1*w,r+1.1*w,a.z));
  vec2 p=at+a.xy*rr*scale;
  gl_Position=vec4(p.x/res.x*2.-1.,1.-p.y/res.y*2.,0.,1.);
}`;
const FRAG = `precision mediump float;
uniform vec2 res;uniform vec2 at;uniform float t;uniform vec3 core;uniform vec3 rim;uniform float scale;
float ring(float d,float r,float w){return smoothstep(w,0.,abs(d-r));}
void main(){
  vec2 q=gl_FragCoord.xy;q.y=res.y-q.y;
  float d=distance(q,at)/scale;
  float r=t*1.25*length(res)/scale;
  float fade=1.-t;fade*=fade;
  float w=22.+90.*t;
  float a=ring(d,r,w);
  float fr=ring(d,r-w*.35,w*.45)*.55;
  float fb=ring(d,r+w*.35,w*.45)*.55;
  vec3 c=mix(core,rim,smoothstep(.0,.6,t))*a+vec3(1.,.42,.1)*fr+rim*fb;
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

type Ring = { draw(t: number): void; free(): void };

/** The ring in WebGL on `canvas`, or null where WebGL is missing or the program will not link. */
function glRing(canvas: HTMLCanvasElement, x: number, y: number, dpr: number, core: number[], rim: number[]): Ring | null {
  const gl = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: true, antialias: false });
  if (!gl) return null;
  const lose = () => gl.getExtension('WEBGL_lose_context')?.loseContext();
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
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    lose();
    return null;
  }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, annulus(), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  const u = (n: string) => gl.getUniformLocation(prog, n);
  gl.uniform2f(u('res'), canvas.width, canvas.height);
  gl.uniform2f(u('at'), x * dpr, y * dpr);
  gl.uniform3f(u('core'), core[0], core[1], core[2]);
  gl.uniform3f(u('rim'), rim[0], rim[1], rim[2]);
  gl.uniform1f(u('scale'), dpr);
  const ut = u('t');
  return {
    draw(t) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(ut, t);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, (SEGMENTS + 1) * 2);
    },
    free: lose,
  };
}

/** The same ring in Canvas2D. */
function flatRing(canvas: HTMLCanvasElement, x: number, y: number, dpr: number, core: number[], rim: number[]): Ring {
  const ctx = canvas.getContext('2d')!;
  const css = (c: number[], a: number) => `rgba(${c.map((v) => Math.round(v * 255)).join(',')},${a})`;
  return {
    draw(t) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      const r = t * 1.25 * Math.hypot(innerWidth, innerHeight);
      const fade = (1 - t) * (1 - t);
      ctx.lineWidth = 6 + 40 * t;
      ctx.strokeStyle = css(rim, 0.5 * fade);
      ctx.beginPath();
      ctx.arc(x, y, r + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 3 + 18 * t;
      ctx.strokeStyle = css(core, 0.9 * fade);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    },
    free() {},
  };
}

/** Sends one ring out from (x, y) in viewport pixels. Resolves when it has gone. */
export function shockwave(x: number, y: number, ms = 1100): Promise<void> {
  // The ring is soft light, so it is drawn at a little over half the screen's pixels and scaled up:
  // a third of the fill, and a small texture for the compositor to take on.
  const dpr = Math.min(devicePixelRatio || 1, 1.5) * 0.6;
  const make = () => {
    const c = document.createElement('canvas');
    c.className = 'shockwave';
    c.setAttribute('aria-hidden', 'true');
    c.width = Math.round(innerWidth * dpr);
    c.height = Math.round(innerHeight * dpr);
    return c;
  };
  const core = rgbOf('--signal', [1, 0.42, 0.1]);
  const rim = rgbOf('--proof', [0.65, 0.55, 1]);
  let canvas = make();
  let ring = glRing(canvas, x, y, dpr, core, rim);
  if (!ring) {
    // A canvas that tried WebGL cannot draw 2D, so the fallback gets a fresh one.
    canvas = make();
    ring = flatRing(canvas, x, y, dpr, core, rim);
  }
  document.body.append(canvas);
  const { draw, free } = ring;
  const start = performance.now();
  return new Promise((resolve) => {
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      draw(1 - Math.pow(1 - t, 2.2));
      if (t < 1) requestAnimationFrame(tick);
      else {
        free();
        canvas.remove();
        resolve();
      }
    };
    requestAnimationFrame(tick);
  });
}
