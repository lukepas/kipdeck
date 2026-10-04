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
      rotate = 0, scale = 1, upper = false, tabular = false, blend = 'normal', fit = null, clip = null,
    } = spec;
    if (wipe <= 0 || opacity <= 0) return;
    const node = el();
    const list = typeof spans === 'string' ? [{ text: spans }] : spans;
    let html = '';
    for (const s of list) {
      if (s.br) { html += '<br>'; continue; }
      const st = [];
      if (s.color) st.push(`color:${s.color}`);
      if (s.wdth != null || s.wght != null) {
        st.push(`font-variation-settings:"wdth" ${(s.wdth ?? wdth).toFixed(2)},"wght" ${(s.wght ?? wght).toFixed(1)}`);
        if (s.wdth != null && family === design.fonts.display) st.push(`word-spacing:${wordSpacingFor(s.wdth, tracking).toFixed(4)}em`);
      }
      if (s.family) st.push(`font-family:"${s.family}"`);
      html += `<span style='${st.join(';')}'>${escapeHtml(s.text)}</span>`;
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
    if (fit) fitTo(node, fit, family === design.fonts.display ? wdth : null, wght, size, tracking);
  }

  // Keep a block inside `fit` px: first compress the Archivo width axis (down
  // to 62), and only then reduce the size. Layout is deterministic, so the
  // measurement gives the same answer for the same frame every time.
  function fitTo(node, fitPx, wdth, wght, size, tracking) {
    let w = node.scrollWidth;
    if (w <= fitPx) return;
    if (wdth != null) {
      const next = Math.max(62, (wdth * fitPx) / w * 0.98);
      node.style.fontVariationSettings = `"wdth" ${next.toFixed(2)}, "wght" ${wght.toFixed(1)}`;
      node.style.wordSpacing = `${wordSpacingFor(next, tracking).toFixed(4)}em`;
      w = node.scrollWidth;
      if (w <= fitPx) return;
    }
    node.style.fontSize = `${(size * fitPx) / w * 0.98}px`;
  }

  return { begin, end, text };
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
