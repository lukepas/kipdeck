// The merge's shockwave: one ring of light that leaves the Merge button and crosses the viewport,
// Signal at its core and the Proof violet at its rim, with a thin chromatic fringe like glass
// bending the page behind it. One small WebGL1 fragment pass on a canvas that exists only while
// the ring is out (created on the merge, its context freed after), or the same ring in Canvas2D
// where WebGL is missing. Pointer events pass straight through it.
import { rgbOf } from '../engine/env';

const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
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
  float trail=smoothstep(r,0.,d)*smoothstep(0.,r*.9,d)*.12;
  vec3 c=mix(core,rim,smoothstep(.0,.6,t))*a+vec3(1.,.42,.1)*fr+rim*fb;
  float alpha=clamp((a*.85+fr+fb+trail)*fade,0.,1.);
  gl_FragColor=vec4(c*fade+core*trail*fade,alpha);
}`;

/** Sends one ring out from (x, y) in viewport pixels. Resolves when it has gone. */
export function shockwave(x: number, y: number, ms = 1100): Promise<void> {
  const canvas = document.createElement('canvas');
  canvas.className = 'shockwave';
  canvas.setAttribute('aria-hidden', 'true');
  // The ring is soft light, so it is drawn at a little over half the screen's pixels and scaled up:
  // a third of the fill, and a small texture for the compositor to take on.
  const dpr = Math.min(devicePixelRatio || 1, 1.5) * 0.6;
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  document.body.append(canvas);
  const core = rgbOf('--signal', [1, 0.42, 0.1]);
  const rim = rgbOf('--proof', [0.65, 0.55, 1]);
  const gl = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: true, antialias: false });
  const start = performance.now();
  let draw: (t: number) => void;
  let free = () => {};
  if (gl) {
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
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const u = (n: string) => gl.getUniformLocation(prog, n);
    gl.uniform2f(u('res'), canvas.width, canvas.height);
    gl.uniform2f(u('at'), x * dpr, y * dpr);
    gl.uniform3f(u('core'), ...core);
    gl.uniform3f(u('rim'), ...rim);
    gl.uniform1f(u('scale'), dpr);
    const ut = u('t');
    draw = (t) => {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(ut, t);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    free = () => gl.getExtension('WEBGL_lose_context')?.loseContext();
  } else {
    const ctx = canvas.getContext('2d')!;
    const css = (c: [number, number, number], a: number) => `rgba(${c.map((v) => Math.round(v * 255)).join(',')},${a})`;
    draw = (t) => {
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
    };
  }
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
