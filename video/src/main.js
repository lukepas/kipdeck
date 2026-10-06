// Entry point. Builds the layer stack and exposes the rendering contract:
//   await window.__ready            fonts, beatmap and GPU are ready
//   await window.__render(tSeconds) draws exactly that frame
// There is no clock here. Nothing animates unless __render is called.
//
// URL params: w, h, fps, format (16x9|9x16|1x1), guides (1), grain (0 to disable),
// blur (max motion-blur samples, 0/1 disables), t (render this time on load,
// handy when opening the page by hand).

import { createDesign } from './engine/design.js';
import { loadFonts } from './engine/fonts.js';
import { createTimeline, actAt } from './engine/timeline.js';
import { createTypeLayer, createSvgLayer } from './engine/typeLayer.js';
import { createPost } from './engine/post.js';
import { createGrain, createGuides } from './engine/overlays.js';
import { createDirector } from './scenes/director.js';

const q = new URLSearchParams(location.search);
const format = ['9x16', '1x1'].includes(q.get('format')) ? q.get('format') : '16x9';
const w = Number(q.get('w')) || (format === '16x9' ? 1920 : 1080);
const h = Number(q.get('h')) || (format === '9x16' ? 1920 : 1080);
const fps = Number(q.get('fps')) || 60;
const guidesOn = q.get('guides') === '1';
const grainOn = q.get('grain') !== '0';
const maxBlur = q.has('blur') ? Math.max(1, Number(q.get('blur')) || 1) : 8;

const design = createDesign(w, h, format);
const stage = document.getElementById('stage');
stage.style.width = `${w}px`;
stage.style.height = `${h}px`;
if (!grainOn) document.body.classList.add('no-grain');

const scene2d = document.getElementById('scene2d');
scene2d.width = w;
scene2d.height = h;
const ctx = scene2d.getContext('2d', { alpha: false, willReadFrequently: false });

const glCanvas = document.getElementById('gl');
glCanvas.width = w;
glCanvas.height = h;

const type = createTypeLayer(document.getElementById('type'), design);
const svg = createSvgLayer(document.getElementById('svg'), design);
const grain = createGrain(document.getElementById('grain'), design);
const guides = createGuides(document.getElementById('guides'), design);

async function boot() {
  const [beatmap] = await Promise.all([
    fetch('./beatmap.json').then((r) => { if (!r.ok) throw new Error(`beatmap: ${r.status}`); return r.json(); }),
    loadFonts('../assets/fonts/'),
  ]);
  const tl = createTimeline(beatmap);
  const post = createPost(glCanvas, scene2d, design);
  const director = createDirector({ design, tl, fps });

  const noop = { text() {}, add() {} };

  async function render(t) {
    const frame = Math.round(t * fps);
    // Trailing shutter, 180 degrees unless the scene asks for a shorter one:
    // sub-times spread over that share of a frame.
    const shutter = (0.5 * director.shutter(t)) / fps;
    const samples = Math.min(maxBlur, director.blurSamples(t, shutter));
    const times = [];
    for (let i = samples - 1; i >= 0; i--) times.push(samples === 1 ? t : t - shutter * (i / (samples - 1)));

    type.begin();
    svg.begin();
    const fx = {};
    post.render(times, (ts) => {
      const primary = ts === t;
      director.draw({
        t: ts, frame, ctx, design, tl, primary,
        type: primary ? type : noop,
        svg: primary ? svg : noop,
        fx: primary ? fx : {},
      });
    }, fx); // the primary draw runs last and fills fx before the post uniforms are set
    type.end();
    svg.end();
    grain.draw(frame, director.grainAmount(t));
    guides.draw(guidesOn);
    await document.fonts.ready;
    return { t, frame, section: tl.section(t).id, act: actAt(t).id, samples };
  }

  window.__render = render;
  window.__info = { w, h, fps, format, duration: beatmap.duration, audio: beatmap.audio };
  if (q.has('t')) await render(Number(q.get('t')));
  return window.__info;
}

window.__ready = boot();
window.__ready.catch((e) => { console.error(e); window.__bootError = String(e && e.stack || e); });
