// Display-type layer. Canvas 2D can only reach the Archivo width axis in seven
// keyword steps, and the film needs it continuous (the sidechain drives it),
// so display type is set as absolutely positioned DOM text with
// font-variation-settings. It is retained-mode per frame: begin(), scenes call
// text(), end() hides everything not drawn this frame. Same input, same DOM.

// Archivo's space advance (em, untracked) at points on the width axis,
// measured in Chromium at wght 900. The space narrows with the axis (0.11em at
// wdth 62, 0.29em at 125), so a headline pushed by the sidechain would lose
// its word gaps. Display type instead keeps one fixed word space.
const SPACE_AT = [[62, 0.11], [75, 0.134], [88, 0.158], [100, 0.18], [112, 0.233], [125, 0.29]];
export const WORD_SPACE_EM = 0.25;

function spaceAdvance(wdth) {
  const w = Math.max(62, Math.min(125, wdth));
  for (let i = 1; i < SPACE_AT.length; i++) {
    const [w1, s1] = SPACE_AT[i];
    if (w <= w1) {
      const [w0, s0] = SPACE_AT[i - 1];
      return s0 + ((s1 - s0) * (w - w0)) / (w1 - w0);
    }
  }
  return SPACE_AT[SPACE_AT.length - 1][1];
}

// CSS word-spacing (em) that makes a display space exactly WORD_SPACE_EM wide
// at this width-axis value and tracking.
export function wordSpacingFor(wdth, tracking) {
  return WORD_SPACE_EM - (spaceAdvance(wdth) + tracking);
}

export function createTypeLayer(root, design) {
  const pool = [];
  let used = 0;

  function el() {
    if (used < pool.length) return pool[used++];
    const node = document.createElement('div');
    node.className = 'type';
    root.appendChild(node);
    pool.push(node);
    used++;
    return node;
  }

  function begin() { used = 0; }

  function end() {
    for (let i = used; i < pool.length; i++) pool[i].style.display = 'none';
  }

  // spans: [{ text, color?, wdth?, wght?, family? }] or a plain string.
  // x,y: anchor in px (y = baseline-ish top of the line box).
  // align: 'left' | 'right' | 'center'. wipe: 0..1 left-to-right mask reveal.
  // wipeDir: 'right' (default) | 'up' for a vertical mask.
  // clip: a CSS clip-path in the block's own px space (e.g. a circle that
  // follows a shockwave). It replaces the wipe mask when given.
  function text(spec) {
    const {
      spans, x, y, size, color = design.palette.ink, family = design.fonts.display,
      wght = 900, wdth = 100, tracking = design.tracking.display, align = 'left',
      wipe = 1, wipeDir = 'right', opacity = 1, lineHeight = 0.92, maxWidth = null,
      rotate = 0, scale = 1, upper = false, tabular = false, blend = 'normal', fit = null, clip = null, fitWdthMin = 62,
    } = spec;
    if (wipe <= 0 || opacity <= 0) return;
    const list = typeof spans === 'string' ? [{ text: spans }] : spans;
    const reveal = spec.reveal ? { lineHeight, ...spec.reveal } : null;
    if (reveal && revealHidden(reveal, countUnits(list, reveal.unit))) return;
    const node = el();
    const spanStyle = (s) => {
      const st = [];
      if (s.color) st.push(`color:${s.color}`);
      if (s.wdth != null || s.wght != null) {
        st.push(`font-variation-settings:"wdth" ${(s.wdth ?? wdth).toFixed(2)},"wght" ${(s.wght ?? wght).toFixed(1)}`);
        if (s.wdth != null && family === design.fonts.display) st.push(`word-spacing:${wordSpacingFor(s.wdth, tracking).toFixed(4)}em`);
      }
      if (s.family) st.push(`font-family:"${s.family}"`);
      return st.join(';');
    };
    let html = '';
    if (!reveal) {
      for (const s of list) {
        if (s.br) { html += '<br>'; continue; }
        html += `<span style='${spanStyle(s)}'>${escapeHtml(s.text)}</span>`;
      }
    } else {
      html = revealHtml(list, reveal, spanStyle);
    }
    const style = node.style;
    style.display = 'block';
    style.left = `${x}px`;
    style.top = `${y}px`;
    style.fontFamily = `"${family}"`;
    style.fontSize = `${size}px`;
    style.lineHeight = String(lineHeight);
    style.letterSpacing = `${tracking}em`;
    style.color = color;
    style.opacity = String(opacity);
    style.mixBlendMode = blend; // 'difference' keeps paper type legible over paper tiles
    style.fontVariationSettings = family === design.fonts.display
      ? `"wdth" ${wdth.toFixed(2)}, "wght" ${wght.toFixed(1)}`
      : `"wght" ${wght.toFixed(1)}`;
    style.wordSpacing = family === design.fonts.display ? `${wordSpacingFor(wdth, tracking).toFixed(4)}em` : 'normal';
    style.fontVariantNumeric = tabular ? 'tabular-nums' : 'normal';
    style.textTransform = upper ? 'uppercase' : 'none';
    style.whiteSpace = maxWidth ? 'normal' : 'pre';
    style.width = maxWidth ? `${maxWidth}px` : 'auto';
    const tx = align === 'right' ? '-100%' : align === 'center' ? '-50%' : '0';
    style.transform = `translate(${tx},0) rotate(${rotate}deg) scale(${scale})`;
    style.transformOrigin = align === 'right' ? '100% 50%' : align === 'center' ? '50% 50%' : '0 50%';
    style.textAlign = align;
    const w = Math.max(0, Math.min(1, wipe));
    style.clipPath = clip || (w >= 1 ? 'none'
      : wipeDir === 'up' ? `inset(${(1 - w) * 100}% -10% -10% -10%)`
        : `inset(-10% ${(1 - w) * 100}% -10% -10%)`);
    if (node.innerHTML !== html) node.innerHTML = html;
    // How formed the block is (1 = every glyph set), read by --typesync.
    node.dataset.formed = String(reveal ? revealProgress(reveal, list) : w);
    if (fit) fitTo(node, fit, family === design.fonts.display ? wdth : null, wght, size, tracking, fitWdthMin);
  }

  // Keep a block inside `fit` px: first compress the Archivo width axis (down
  // to 62), and only then reduce the size. Layout is deterministic, so the
  // measurement gives the same answer for the same frame every time.
  function fitTo(node, fitPx, wdth, wght, size, tracking, wdthMin = 62) {
    let w = node.scrollWidth;
    if (w <= fitPx) return;
    if (wdth != null) {
      const next = Math.max(Math.min(wdth, wdthMin), (wdth * fitPx) / w * 0.98);
      node.style.fontVariationSettings = `"wdth" ${next.toFixed(2)}, "wght" ${wght.toFixed(1)}`;
      node.style.wordSpacing = `${wordSpacingFor(next, tracking).toFixed(4)}em`;
      w = node.scrollWidth;
      if (w <= fitPx) return;
    }
    node.style.fontSize = `${(size * fitPx) / w * 0.98}px`;
  }

  return { begin, end, text };
}

// ---- per-word (or per-line) reveal ------------------------------------
// A word rises out of a mask that sits just under its own line (mode
// 'rise'), or falls into it from above (mode 'drop', used for the questions
// so they read as the call to the answers' response). A frame shows a word
// either hidden, moving whole, or set: never cut mid-glyph.
//   reveal = { mode, unit: 'word'|'line', f, dur, stagger, at?, out?, outDur, outStagger }
//   f: frames since the reveal started; at: per-unit start frames (overrides
//   stagger); out: frames since the exit started (the words sink away).
const REVEAL_DEFAULTS = { mode: 'rise', unit: 'word', dur: 7, stagger: 2, outDur: 6, outStagger: 1 };
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const revOut = (x) => (x >= 1 ? 1 : 1 - 2 ** (-10 * x));
const revIn = (x) => (x <= 0 ? 0 : 2 ** (10 * (x - 1)));

export function countUnits(list, unit = 'word') {
  let n = 0;
  if (unit === 'line') {
    let open = false;
    for (const s of list) {
      if (s.br) { if (open) n++; open = false; } else if (s.text && s.text.trim()) open = true;
    }
    return n + (open ? 1 : 0);
  }
  for (const s of list) if (!s.br && s.text) n += s.text.split(/\s+/).filter(Boolean).length;
  return n;
}

function unitState(r, i) {
  const o = { ...REVEAL_DEFAULTS, ...r };
  const s = o.at ? (o.at[i] ?? o.at[o.at.length - 1]) : i * o.stagger;
  const pin = revOut(clamp01((o.f - s) / o.dur + 1e-4)); // frame times are float sums
  const pout = o.out == null ? 0 : revIn(clamp01((o.out - i * o.outStagger) / o.outDur));
  return { pin, pout, hidden: pin <= 0 || pout >= 1 };
}

function revealHidden(r, n) {
  for (let i = 0; i < n; i++) if (!unitState(r, i).hidden) return false;
  return true;
}

// Offset of unit i in em: + is down. Rise comes up from below and sinks
// back; drop falls in from above and falls on through on the way out.
function unitOffset(r, i) {
  const { pin, pout } = unitState(r, i);
  const d = (r.lineHeight ?? 0.92) + 0.45;
  const dir = (r.mode || 'rise') === 'drop' ? -1 : 1;
  return (dir * (1 - pin) + pout) * d;
}

// Settled progress of the whole block (1 = every unit set), for checks.
// A unit that has not started yet (a later word on a later hit) does not
// count against it; a unit mid-move does.
export function revealProgress(r, list) {
  const n = countUnits(list, r.unit);
  let m = 1;
  for (let i = 0; i < n; i++) {
    const s = unitState(r, i);
    if (s.pin <= 0 && s.pout <= 0) continue;
    m = Math.min(m, s.pin * (1 - s.pout));
  }
  return m;
}

const WRAP = 'display:inline-block;clip-path:inset(-0.18em -0.4em -0.2em -0.4em)';
const wrap = (inner, dy) => (Math.abs(dy) < 1e-4
  ? `<span style='${WRAP}'><span style='display:inline-block'>${inner}</span></span>`
  : `<span style='${WRAP}'><span style='display:inline-block;transform:translateY(${dy.toFixed(4)}em)'>${inner}</span></span>`);

function revealHtml(list, r, spanStyle) {
  let html = '';
  let i = 0;
  if ((r.unit || 'word') === 'line') {
    let line = '';
    const flush = () => {
      if (line) { html += wrap(line, unitOffset(r, i)); i++; }
      line = '';
    };
    for (const s of list) {
      if (s.br) { flush(); html += '<br>'; continue; }
      line += `<span style='${spanStyle(s)}'>${escapeHtml(s.text)}</span>`;
    }
    flush();
    return html;
  }
  for (const s of list) {
    if (s.br) { html += '<br>'; continue; }
    let inner = '';
    for (const tok of s.text.split(/(\s+)/)) {
      if (!tok) continue;
      if (/^\s+$/.test(tok)) { inner += escapeHtml(tok); continue; }
      inner += wrap(escapeHtml(tok), unitOffset(r, i));
      i++;
    }
    html += `<span style='${spanStyle(s)}'>${inner}</span>`;
  }
  return html;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// SVG layer for vector diagrams (the escrow state machine). Scenes return an
// SVG fragment string; identical strings skip the DOM write.
export function createSvgLayer(svg, design) {
  let last = '';
  svg.setAttribute('viewBox', `0 0 ${design.w} ${design.h}`);
  svg.setAttribute('width', design.w);
  svg.setAttribute('height', design.h);
  let parts = [];
  return {
    begin() { parts = []; },
    add(fragment) { parts.push(fragment); },
    end() {
      const next = parts.join('');
      if (next !== last) { svg.innerHTML = next; last = next; }
    },
  };
}
