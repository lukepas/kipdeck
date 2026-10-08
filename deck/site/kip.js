/* === KIP: the deck's mascot ===
   Kip is Kipdeck's own mascot, the stowaway deck kit from the agent office: cream fur, tall leaf
   ears, a quilted slate vest, a knitted scarf and the Spark Sprig (a glowing crystal leaf on a wooden
   grip). One inline SVG (viewBox 0 0 100 130, feet on y=128), moved only with transforms and opacity.
   Every gesture returns a GSAP timeline so wow.js can lay them on a slide's beats.
   Positions are stage pixels (1920x1080) with the feet as the anchor. */
(function () {
  'use strict';
  var gsap = window.gsap;
  if (!gsap) return;
  var NS = 'http://www.w3.org/2000/svg';
  var W = 74, H = 96;                       // drawn size at scale 1 (feet at the bottom edge)
  var COLORS = { rose: '#F3A6BC', pink: '#FF2E63', cyan: '#2DD4D4', teal: '#2DD4D4', amber: '#FFB020', green: '#3DDC97' };
  var MOTES = ['#3DDC97', '#2DD4D4', '#FFB020', '#F3A6BC', '#3DDC97'];
  /* The Sprig is a Kipdeck "merge wand": brand green or teal only, whatever the slide's accent. */
  var GLOWS = ['green', 'teal'];
  function glowOf(c) { return c === 'cyan' || c === 'teal' ? 'teal' : 'green'; }
  function glowOn(c, g) { return c === 'off' ? 0 : c === 'dim' ? (g === 'green' ? 0.28 : 0) : glowOf(c) === g ? 1 : 0; }

  /* Sprig safety: the rod's points (mid, tip, chevron apex) in body units for an arm and Sprig rotation.
     The rod must never cross his face, so every arm move picks the nearest Sprig angle that keeps
     those points off the head (an ellipse around the face, plus the ears). */
  var ROD_PTS = [[74.5, 83.7], [78.6, 77.4], [79.8, 75.55]];
  function rotP(p, o, d) { var a = d * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a), x = p[0] - o[0], y = p[1] - o[1]; return [o[0] + x * c - y * sn, o[1] + x * sn + y * c]; }
  function onHead(p) { var x = p[0], y = p[1]; return Math.pow((x - 51) / 25.5, 2) + Math.pow((y - 54.5) / 23, 2) < 1 || (x > 30 && x < 70 && y < 37); }
  function sprigSafe(arm, spr) { return !ROD_PTS.some(function (p) { return onHead(rotP(rotP(p, [70, 95], spr), [65, 80], arm)); }); }
  function sprigFor(arm, base) {
    base = base || 0;
    for (var d = 0; d <= 180; d += 5) { if (sprigSafe(arm, base + d)) return base + d; if (d && sprigSafe(arm, base - d)) return base - d; }
    return base;
  }
  var uid = 0;
  var layer = null, stage = null;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* ---------- drawing ---------- */
  function bodySVG(id, scarf) {
    var sc = scarf === 'amber' ? '#D9A24A' : 'var(--kip-knit)';
    var scD = scarf === 'amber' ? '#B9832F' : '#6F7C91';
    var defs = GLOWS.map(function (g) {
      var c = COLORS[g];
      return '<radialGradient id="kg-' + g + '-' + id + '"><stop offset="0" stop-color="' + c + '" stop-opacity=".95"/><stop offset=".45" stop-color="' + c + '" stop-opacity=".38"/><stop offset="1" stop-color="' + c + '" stop-opacity="0"/></radialGradient>';
    }).join('');
    /* The Sprig: a short merge wand held up and forward from the paw, tipped with the Kipdeck chevron.
       Per colour: a faint halo (stacked translucent strokes at 35%, no filter), a coloured stroke, the
       chevron and a small tip glow. The white core sits on top. */
    var ROD = 'x1="70.5" y1="90" x2="78.6" y2="77.4"';
    var CHEV = 'M75.1 77.3 L79.8 75.55 L80.2 80.5';
    var rod = GLOWS.map(function (g) {
      var c = COLORS[g];
      return '<g class="k-g-' + g + '" opacity="0"><g opacity=".35"><g class="k-halo">' +
        '<line ' + ROD + ' stroke="' + c + '" stroke-width="11" stroke-linecap="round" opacity=".14"/>' +
        '<line ' + ROD + ' stroke="' + c + '" stroke-width="7" stroke-linecap="round" opacity=".3"/></g></g>' +
        '<line ' + ROD + ' stroke="' + c + '" stroke-width="3.4" stroke-linecap="round"/>' +
        '<path d="' + CHEV + '" stroke="' + c + '" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>';
    }).join('');
    var glow = GLOWS.map(function (g) { return '<circle class="k-g-' + g + '" cx="79" cy="76.5" r="7" fill="url(#kg-' + g + '-' + id + ')" opacity="0"/>'; }).join('');
    /* The pennant for kit.flag: drawn in a frame turned to the rod (32.7 deg), so it flies level when the
       rod stands upright. Hidden unless the flag beat shows it. */
    var pennant = '<g class="k-pennant" opacity="0" transform="rotate(32.7 79.8 75.55)"><g class="k-pen">' +
      '<path class="o" d="M79.8 75.55 l14 5 l-14 5 Z" fill="#3DDC97"/>' +
      '<path d="M81 78 l7.5 2.6" stroke="#F6EEDF" stroke-width="1" stroke-linecap="round" opacity=".7"/></g></g>';
    /* Light trail for carry runs: ghost copies of the rod trailing straight back (the carry pose turns the
       arm -35 and the Sprig +35, so this frame is level with the stage). */
    var trail = '<g class="k-trail" opacity="0">' +
      '<use href="#kr-' + id + '" transform="translate(-19 1)" opacity=".14"/>' +
      '<use href="#kr-' + id + '" transform="translate(-12.5 .6)" opacity=".28"/>' +
      '<use href="#kr-' + id + '" transform="translate(-6 .3)" opacity=".5"/></g>';
    var sprig = '<g class="k-sprig">' + trail + '<g id="kr-' + id + '">' + rod +
      '<line class="k-leaf" ' + ROD + ' stroke="#FFFFFF" stroke-width="1.3" stroke-linecap="round"/>' +
      '<path d="' + CHEV + '" stroke="#FFFFFF" stroke-width="1" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>' +
      '<g class="k-glow" opacity=".7">' + glow + '</g>' + pennant +
      '<path class="o" d="M67.6 100.5 L71.4 89.5" stroke="var(--kip-wood)" stroke-width="3.4" stroke-linecap="round"/>' +
      '<path d="M68.4 95.2 L70.6 96" stroke="var(--kip-slate)" stroke-width="2.2"/></g>';
    function eye(x, side) {
      return '<circle cx="' + x + '" cy="52" r="6.6" fill="var(--kip-iris)" stroke="var(--kip-pupil)" stroke-width=".8"/>';
    }
    function pupil(x, side) {
      return '<g class="k-pupil' + side + '"><circle cx="' + x + '" cy="52" r="3.6" fill="var(--kip-pupil)"/><circle cx="' + (x + 2) + '" cy="49.8" r="1.9" fill="var(--kip-glint)"/><circle cx="' + (x - 2) + '" cy="54.2" r=".8" fill="var(--kip-glint)"/></g>';
    }
    function lids(x, side) {
      return '<path class="k-lid' + side + '" d="M' + (x - 7) + ' 45 H' + (x + 7) + ' V51 A7 7 0 0 1 ' + (x - 7) + ' 51 Z" fill="var(--kip-fur)"/>' +
        '<path class="k-low' + side + '" d="M' + (x - 7) + ' 59 V53 A7 7 0 0 1 ' + (x + 7) + ' 53 V59 Z" fill="var(--kip-fur)"/>';
    }
    function ear(bx, rot, side) {
      var t = 'transform="rotate(' + rot + ' ' + bx + ' 37)"';
      return '<g class="k-ear' + side + '">' +
        '<path class="o" ' + t + ' d="M' + (bx - 5.4) + ' 15 C' + (bx - 7.5) + ' 20 ' + (bx - 7.5) + ' 30 ' + bx + ' 37 C' + (bx + 7.5) + ' 30 ' + (bx + 7.5) + ' 20 ' + (bx + 5.4) + ' 15" fill="var(--kip-fur)"/>' +
        '<ellipse class="k-in' + side + '" ' + t + ' cx="' + bx + '" cy="24" rx="3.5" ry="9" fill="var(--kip-knit)"/>' +
        '<g class="k-tip' + side + '"><path class="o" ' + t + ' d="M' + (bx - 5.8) + ' 17 C' + (bx - 5.4) + ' 10 ' + (bx - 3) + ' 6 ' + bx + ' 4 C' + (bx + 3) + ' 6 ' + (bx + 5.4) + ' 10 ' + (bx + 5.8) + ' 17" fill="var(--kip-fur)"/></g>' +
        '</g>';
    }
    function limb(x1, y1, x2, y2) {
      var d = 'M' + x1 + ' ' + y1 + ' L' + x2 + ' ' + y2;
      return '<path d="' + d + '" stroke="var(--kip-ink)" stroke-width="10.6" stroke-linecap="round"/><path d="' + d + '" stroke="var(--kip-fur)" stroke-width="9" stroke-linecap="round"/>';
    }
    function paw(x) {
      return '<circle class="o" cx="' + x + '" cy="97" r="7" fill="var(--kip-vest)"/><path d="M' + (x - 5.2) + ' 92.6 Q' + x + ' 89.6 ' + (x + 5.2) + ' 92.6" stroke="var(--kip-belly)" stroke-width="2.4" fill="none" stroke-linecap="round"/>';
    }
    return '<svg viewBox="0 0 100 130" aria-hidden="true" focusable="false"><defs>' + defs + '</defs>' +
      '<g class="k-root">' +
        '<g class="k-fx-g"><g class="k-speed" opacity="0"><path d="M2 84 H18 M-2 94 H14 M4 104 H16" stroke="var(--kip-knit)" stroke-width="2" stroke-linecap="round"/></g>' +
        '<g class="k-dust" opacity="0"><circle cx="22" cy="126" r="4" fill="var(--kip-tan)" opacity=".55"/><circle cx="14" cy="122" r="3" fill="var(--kip-tan)" opacity=".4"/><circle cx="8" cy="127" r="2.4" fill="var(--kip-tan)" opacity=".3"/></g></g>' +
        '<g class="k-scarf-tails"><path d="M60 75 C68 73 74 75 80 70" stroke="var(--kip-ink)" stroke-width="5.6" stroke-linecap="round" fill="none"/><path d="M60 75 C68 73 74 75 80 70" stroke="' + sc + '" stroke-width="4.2" stroke-linecap="round" fill="none"/>' +
          '<path d="M60 77 C67 78 73 81 79 78" stroke="var(--kip-ink)" stroke-width="5" stroke-linecap="round" fill="none"/><path d="M60 77 C67 78 73 81 79 78" stroke="' + scD + '" stroke-width="3.6" stroke-linecap="round" fill="none"/></g>' +
        '<g class="k-tail"><circle class="o" cx="68" cy="111" r="6" fill="var(--kip-fur)"/><circle class="o" cx="72.5" cy="106.5" r="5" fill="var(--kip-fur)"/><circle class="o" cx="75.5" cy="102.5" r="4" fill="var(--kip-belly)"/></g>' +
        '<g class="k-legL"><rect class="o" x="34" y="106" width="8" height="18" rx="3" fill="var(--kip-slate)"/><ellipse class="o" cx="38" cy="124" rx="9" ry="5.5" fill="var(--kip-slate)"/></g>' +
        '<g class="k-legR"><rect class="o" x="58" y="106" width="8" height="18" rx="3" fill="var(--kip-slate)"/><ellipse class="o" cx="62" cy="124" rx="9" ry="5.5" fill="var(--kip-slate)"/></g>' +
        '<g class="k-armL">' + limb(35, 80, 31, 95) + paw(31) + '</g>' +
        '<g class="k-torso">' +
          '<path class="o" d="M50 73 C64 73 70 92 68 102 C66 110 58 112 50 112 C42 112 34 110 32 102 C30 92 36 73 50 73Z" fill="var(--kip-vest)"/>' +
          '<path d="M38 84 L42 97 M35.5 94 L39.5 106 M62 84 L58 97 M64.5 94 L60.5 106" stroke="var(--kip-vest-dark)" stroke-width=".9"/>' +
          '<path d="M44 74 C44 88 41 100 38.5 110.5 C42 111.8 46 112 50 112 C54 112 58 111.8 61.5 110.5 C59 100 56 88 56 74 Z" fill="var(--kip-fur)"/>' +
          '<ellipse cx="50" cy="100" rx="10" ry="10" fill="var(--kip-belly)"/>' +
          '<path d="M44 74 C44 88 41 100 38.5 110.5 M56 74 C56 88 59 100 61.5 110.5" stroke="var(--kip-vest-dark)" stroke-width="1.3" fill="none"/>' +
          '<rect x="33.6" y="98" width="6" height="4.6" rx="1" fill="var(--kip-vest-dark)"/><rect x="60.4" y="98" width="6" height="4.6" rx="1" fill="var(--kip-vest-dark)"/>' +
          '<circle cx="43.6" cy="90" r="1.6" fill="var(--kip-brass)"/><circle cx="58.6" cy="88" r="2.6" fill="var(--kip-slate)" stroke="var(--kip-brass)" stroke-width=".8"/>' +
        '</g>' +
        '<g class="k-scarf"><ellipse class="o" cx="50" cy="75" rx="13" ry="4.5" fill="' + sc + '"/>' +
          '<path d="M40.5 72 V78 M45.5 70.8 V79.3 M50.5 70.6 V79.4 M55.5 70.9 V79.2" stroke="var(--kip-belly)" stroke-width="1.5" opacity=".85"/>' +
          '<path d="M38 77.5 Q50 81.5 62 77.5" stroke="var(--kip-tan)" stroke-width=".9" fill="none"/>' +
          '<rect class="o" x="57" y="77" width="6" height="13" rx="2" transform="rotate(12 60 77)" fill="' + sc + '"/>' +
          '<path d="M56.3 84 L62 85.2" stroke="var(--kip-belly)" stroke-width="1.4" transform="rotate(12 60 77)"/>' +
          '<circle class="o" cx="60" cy="76" r="4.5" fill="' + sc + '"/></g>' +
        '<g class="k-head"><g class="k-look">' +
          ear(39, -15, 'L') + ear(61, 15, 'R') +
          '<ellipse class="o" cx="50" cy="54.5" rx="24" ry="21" fill="var(--kip-fur)"/>' +
          '<g class="k-tuft"><path d="M50 35 C47 30 48.5 26 51.5 24" stroke="var(--kip-ink)" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M50 35 C47 30 48.5 26 51.5 24" stroke="var(--kip-fur)" stroke-width="2.6" fill="none" stroke-linecap="round"/><circle class="o" cx="53" cy="22" r="2.7" fill="var(--kip-tan)"/></g>' +
          '<g class="k-face">' +
            '<ellipse cx="50" cy="64.5" rx="11" ry="6.8" fill="var(--kip-belly)"/>' +
            '<circle cx="36" cy="60" r=".8" fill="var(--kip-tan)"/><circle cx="38.6" cy="61.6" r=".8" fill="var(--kip-tan)"/><circle cx="41.2" cy="60.2" r=".8" fill="var(--kip-tan)"/>' +
            '<circle cx="64" cy="60" r=".8" fill="var(--kip-tan)"/><circle cx="61.4" cy="61.6" r=".8" fill="var(--kip-tan)"/><circle cx="58.8" cy="60.2" r=".8" fill="var(--kip-tan)"/>' +
            eye(40) + eye(60) +
            '<g class="k-pupils">' + pupil(40, 'L') + pupil(60, 'R') + '</g>' +
            lids(40, 'L') + lids(60, 'R') +
            '<ellipse cx="50" cy="61" rx="3.3" ry="2" fill="var(--kip-slate)"/>' +
            '<path class="k-mouth" d="M46.6 66.2 Q50 69.4 53.4 66.2" stroke="var(--kip-slate)" stroke-width="1.2" fill="none" stroke-linecap="round"/>' +
            '<ellipse class="k-mouthO" cx="50" cy="67.6" rx="2.6" ry="2.4" fill="#5A2F35" opacity="0"/>' +
          '</g>' +
        '</g></g>' +
        '<g class="k-armR">' + sprig +
          limb(65, 80, 69, 95) + paw(69) +
        '</g>' +
      '</g></svg>';
  }
  /* Pictograms live outside the flip, so they never read mirrored. Shapes only, never words. */
  function pictSVG() {
    var z = function (c, x, y, s) { return '<g class="k-' + c + '" opacity="0"><path transform="translate(' + x + ' ' + y + ') scale(' + s + ')" d="M0 0 H6 L0 7 H6" stroke="var(--kip-knit)" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>'; };
    return '<svg class="k-pict" viewBox="0 0 100 130" aria-hidden="true" focusable="false" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none">' +
      '<g class="k-heart" opacity="0"><path d="M50 16 C42 10 42 2 47 2 C49 2 50 4 50 5 C50 4 51 2 53 2 C58 2 58 10 50 16Z" fill="#FF2E63"/></g>' +
      '<g class="k-bang" opacity="0"><rect x="76" y="2" width="4.4" height="13" rx="2.2" fill="#FF2E63"/><circle cx="78.2" cy="20" r="2.4" fill="#FF2E63"/></g>' +
      z('z1', 72, 30, 1) + z('z2', 80, 18, 1.3) + z('z3', 90, 4, 1.6) +
      '<g class="k-talk" opacity="0"><path d="M80 34 l8 -5 M82 42 h10 M80 50 l8 5" stroke="var(--kip-knit)" stroke-width="2" stroke-linecap="round"/></g>' +
      '</svg>';
  }

  /* ---------- poses: instant values per part ---------- */
  var NEUTRAL = {
    root: { rotation: 0, scaleX: 1, scaleY: 1, y: 0 }, head: { rotation: 0, y: 0 },
    armL: { rotation: 0 }, armR: { rotation: 0 }, legL: { rotation: 0, scaleY: 1 }, legR: { rotation: 0, scaleY: 1 },
    earL: { rotation: 0 }, earR: { rotation: 0 }, tipL: { rotation: 0 }, tipR: { rotation: 0 }, tuft: { rotation: 0 },
    tail: { rotation: 0, scale: 1 }, torso: { scaleY: 1 }, scarfTails: { rotation: 0 },
    lidL: { scaleY: 0.12 }, lidR: { scaleY: 0.12 }, lowL: { scaleY: 0 }, lowR: { scaleY: 0 },
    mouth: { opacity: 1 }, mouthO: { opacity: 0, scale: 1 }, sprig: { rotation: 0, autoAlpha: 1 },
    pupilL: { scale: 1 }, pupilR: { scale: 1 }, pennant: { autoAlpha: 0 }, pen: { skewY: 0 }, inL: { opacity: 1 }
  };
  var HAPPY = { lidL: { scaleY: 0 }, lidR: { scaleY: 0 }, lowL: { scaleY: 0.7 }, lowR: { scaleY: 0.7 } };
  var SIT = { root: { y: 9 }, legL: { rotation: 55 }, legR: { rotation: -55 } };
  function mix() { var o = {}; for (var i = 0; i < arguments.length; i++) { var a = arguments[i]; for (var k in a) { o[k] = o[k] || {}; for (var p in a[k]) o[k][p] = a[k][p]; } } return o; }
  var POSES = {
    stand: {},
    happy: HAPPY,
    sit: SIT,
    sitdown: mix(SIT, { earL: { rotation: -38 }, earR: { rotation: 38 }, tipL: { rotation: -30 }, tipR: { rotation: 30 }, lidL: { scaleY: 0.42 }, lidR: { scaleY: 0.42 } }),
    wave: mix(HAPPY, { armL: { rotation: 140 }, head: { rotation: 8 } }),
    point: { armR: { rotation: -70 }, root: { rotation: 4 } },
    /* The flag stands upright beside his head (arm out, rod turned to vertical), pennant flying. */
    flag: { armR: { rotation: -65 }, sprig: { rotation: 32 }, armL: { rotation: -28 }, pennant: { autoAlpha: 1 } },
    tada: mix(HAPPY, { armL: { rotation: 150 }, armR: { rotation: -22 }, sprig: { rotation: 18 } }),
    pawup: mix(HAPPY, { armL: { rotation: 150 }, head: { rotation: -6 } }),
    cheer: mix(HAPPY, { armL: { rotation: 150 }, armR: { rotation: -150 }, mouthO: { opacity: 1 }, mouth: { opacity: 0 } }),
    belly: mix(HAPPY, { armL: { rotation: -38 }, armR: { rotation: 38 }, sprig: { autoAlpha: 0 } }),
    lie: { root: { y: 10, scaleY: 0.86 }, legL: { rotation: 60 }, legR: { rotation: -60 }, armL: { rotation: -50 }, armR: { rotation: 50 }, head: { y: 3, rotation: 4 }, lidL: { scaleY: 0.4 }, lidR: { scaleY: 0.4 } },
    sleep: { root: { scaleY: 0.74 }, legL: { rotation: 60 }, legR: { rotation: -60 }, armL: { rotation: -40 }, armR: { rotation: 40 }, head: { rotation: 10, y: 6 },
      earL: { rotation: -50 }, earR: { rotation: 50 }, tipL: { rotation: -40 }, tipR: { rotation: 40 }, lidL: { scaleY: 1 }, lidR: { scaleY: 1 }, lowL: { scaleY: 0 }, lowR: { scaleY: 0 } }
  };
  var ORIGINS = {
    root: '50 128', head: '50 72', look: '50 72', earL: '39 37', earR: '61 37', tipL: '33.4 16.2', tipR: '66.6 16.2', tuft: '50 34',
    armL: '35 80', armR: '65 80', legL: '38 106', legR: '62 106', torso: '50 112', scarf: '60 76', scarfTails: '60 76', tail: '66 110',
    lidL: '40 45', lidR: '60 45', lowL: '40 59', lowR: '60 59', sprig: '70 95', pupilL: '40 52', pupilR: '60 52', glow: '79 76.5', mouthO: '50 67.6',
    pen: '79.8 75.55'
  };
  var SEL = { scarfTails: 'scarf-tails' };

  /* ---------- fx in the layer (stage pixels) ---------- */
  function fxDot(x, y, color, size, cls) {
    var d = document.createElement('i');
    d.className = 'kip-fx' + (cls ? ' ' + cls : '');
    d.style.width = d.style.height = size + 'px';
    if (cls === 'ring') d.style.color = color; else d.style.background = color;
    layer.appendChild(d);
    gsap.set(d, { x: x - size / 2, y: y - size / 2 });
    return d;
  }
  function motes(x, y, color, n, spread) {
    if (!layer) return;
    n = n || 10; spread = spread || 46;
    for (var i = 0; i < n; i++) {
      var c = color === 'multi' ? COLORS[GLOWS[i % 5]] : (COLORS[color] || color);
      var d = fxDot(x, y, c, 4 + (i % 3) * 2);
      var a = (i / n) * Math.PI * 2 + Math.random() * 0.5, r = spread * (0.6 + Math.random() * 0.6);
      gsap.to(d, { x: '+=' + Math.cos(a) * r, y: '+=' + (Math.sin(a) * r - 10), opacity: 0, scale: 0.4, duration: 0.6 + Math.random() * 0.3, ease: 'power2.out', onComplete: rm, onCompleteParams: [d] });
    }
  }
  function ringAt(x, y, color) {
    if (!layer) return;
    var d = fxDot(x, y, COLORS[color] || color, 40, 'ring');
    gsap.fromTo(d, { scale: 0.2, opacity: 0.95 }, { scale: 1.6, opacity: 0, duration: 0.55, ease: 'power2.out', onComplete: rm, onCompleteParams: [d] });
  }
  function rm(d) { if (d && d.parentNode) d.parentNode.removeChild(d); }

  /* ---------- the kit ---------- */
  function createKit(opts) {
    opts = opts || {};
    var id = ++uid, S = opts.scale || 1, w = W * S, h = H * S, k = h / 130;
    var btn = document.createElement('div');
    btn.className = 'kip'; btn.setAttribute('role', 'presentation'); btn.setAttribute('aria-hidden', 'true');
    btn.style.width = w + 'px'; btn.style.height = h + 'px';
    if (opts.vars) for (var vk in opts.vars) btn.style.setProperty(vk, opts.vars[vk]);   // a teammate's own colours
    btn.innerHTML = '<div class="k-flip"><div class="k-bob">' + bodySVG(id, opts.scarf) + '</div></div>' + pictSVG();
    var flip = btn.querySelector('.k-flip');
    var P = {};
    ['root', 'head', 'look', 'face', 'pupils', 'pupilL', 'pupilR', 'lidL', 'lidR', 'lowL', 'lowR', 'earL', 'earR', 'tipL', 'tipR', 'tuft', 'armL', 'armR', 'legL', 'legR',
      'torso', 'scarf', 'scarfTails', 'tail', 'sprig', 'glow', 'leaf', 'trail', 'mouth', 'mouthO', 'heart', 'bang', 'z1', 'z2', 'z3', 'talk', 'speed', 'dust',
      'pennant', 'pen', 'inL'].forEach(function (n) {
      P[n] = btn.querySelector('.k-' + (SEL[n] || n));
    });
    var G = {}; GLOWS.forEach(function (g) { G[g] = btn.querySelectorAll('.k-g-' + g); });
    var lids = [P.lidL, P.lidR], lows = [P.lowL, P.lowR];

    var kit = {
      el: btn, parts: P, scale: S, w: w, h: h, flip: flip,
      st: { x: -200, y: 104, face: 'front', sprig: 'rose', size: 1 },
      away: true, static: false, busy: false, lookHold: false, asleep: false
    };
    function origins() { for (var n in ORIGINS) if (P[n]) gsap.set(P[n], { svgOrigin: ORIGINS[n] }); }
    function fin(tl) { if (kit.static) { tl.progress(1); tl.kill(); } return tl; }
    function flipSign() { return kit.st.face === 'l' ? -1 : 1; }
    /* Size: a scale on .k-flip around the feet (transform only). zs is the size the timeline being
       built will have at that point; curS() is what is on screen right now. */
    var zs = 1;
    function curS() { return Math.abs(gsap.getProperty(flip, 'scaleY')) || 1; }
    /* Room above his head in stage px, so hops never lift the ears off the top edge. */
    function lift(hgt, y) { return Math.max(0, Math.min(hgt, (y === undefined ? kit.st.y : y) - h * zs - 8)); }

    /* --- instant setters --- */
    kit.at = function (x, y, face) {
      kit.st.x = x; kit.st.y = y;
      gsap.set(btn, { x: x - w / 2, y: y - h, scale: 1, autoAlpha: 1 });
      kit.away = x < -w || x > 1920 + w;
      if (face) kit.face(face);
      return kit;
    };
    kit.face = function (f) {
      kit.st.face = f;
      var sz = curS();
      gsap.set(flip, { scaleX: (f === 'l' ? -1 : 1) * sz, scaleY: sz });
      gsap.set(P.face, { x: f === 'front' ? 0 : 6 });
      return kit;
    };
    function faceTo(tl, f, at) {
      tl.call(function () { kit.face(f); }, null, at);
      kit.st.face = f;
    }
    /* A pose's Sprig angle is pushed off his face for the pose's arm angle. */
    function posed(name) { var p = mix(NEUTRAL, POSES[name] || {}); p.sprig.rotation = sprigFor(p.armR.rotation, p.sprig.rotation); return p; }
    /* Every move of the Sprig arm goes through here, so the rod turns with it and never crosses his face. */
    function armTo(tl, rot, v, at, base) {
      tl.to(P.armR, Object.assign({}, v, { rotation: rot }), at);
      tl.to(P.sprig, Object.assign({}, v, { rotation: sprigFor(rot, base || 0) }), at);
      return tl;
    }
    kit.armTo = function (rot, v) { return fin(armTo(gsap.timeline(), rot, v || { duration: 0.15 }, 0)); };
    kit.pose = function (name) {
      var p = posed(name);
      for (var n in p) if (P[n]) gsap.set(P[n], p[n]);
      btn.classList.toggle('asleep', name === 'sleep');
      return kit;
    };
    function poseTo(tl, name, at, dur) {
      var p = posed(name);
      for (var n in p) if (P[n]) tl.to(P[n], Object.assign({ duration: dur || 0.2, ease: 'power2.out' }, p[n]), at);
      return tl;
    }
    kit.sprig = function (c) {
      kit.st.sprig = c;
      GLOWS.forEach(function (g) { gsap.set(G[g], { opacity: glowOn(c, g) }); });
      gsap.set(P.sprig, { autoAlpha: c === 'off' ? 0 : 1 });
      return kit;
    };
    function sprigTo(tl, c, at, dur) {
      dur = dur === undefined ? 0.25 : dur;
      GLOWS.forEach(function (g) { tl.to(G[g], { opacity: glowOn(c, g), duration: dur }, at); });
      tl.to(P.sprig, { autoAlpha: c === 'off' ? 0 : 1, duration: dur }, at);
      kit.st.sprig = c;
    }
    kit.sprigTo = function (c, dur) { var tl = gsap.timeline(); sprigTo(tl, c, 0, dur); return fin(tl); };

    /* --- where things are, in stage pixels --- */
    kit.now = function () {
      return { x: gsap.getProperty(btn, 'x') + w / 2, y: gsap.getProperty(btn, 'y') + h, face: kit.st.face };
    };
    kit.sync = function () { var n = kit.now(); kit.st.x = n.x; kit.st.y = n.y; return kit; };
    kit.local = function (lx, ly, st) {
      st = st || kit.now();
      if (st.face === 'l') lx = 100 - lx;
      var sz = curS();
      return { x: st.x + (lx * k - w / 2) * sz, y: st.y + (ly * k - h) * sz + (gsap.getProperty(flip, 'y') || 0) };
    };
    kit.curSize = curS;
    kit.setSize = function (sz) {
      zs = sz; kit.st.size = sz;
      gsap.set(flip, { scaleX: flipSign() * sz, scaleY: sz });
      return kit;
    };
    kit.sizeTo = function (sz, dur, ease) {
      var tl = gsap.timeline();
      zs = sz; kit.st.size = sz;
      tl.to(flip, { scaleY: sz, scaleX: function () { return (gsap.getProperty(flip, 'scaleX') < 0 ? -1 : 1) * sz; }, duration: dur === undefined ? 0.3 : dur, ease: ease || 'power2.out' }, 0);
      return fin(tl);
    };
    kit.tip = function () { return kit.local(79, 76.5); };
    kit.box = function () {
      if (!stage) return null;
      var sr = stage.getBoundingClientRect(), sc = sr.width / 1920;
      var r = null;
      // His body and the Sprig's leaf; the soft glow and the motes are left out on purpose.
      [P.head, P.torso, P.legL, P.legR, P.armL, P.armR, P.tail, P.leaf, P.scarf].forEach(function (el) {
        var b = el.getBoundingClientRect(); if (!b.width) return;
        if (!r) r = { l: b.left, t: b.top, r: b.right, b: b.bottom };
        else { r.l = Math.min(r.l, b.left); r.t = Math.min(r.t, b.top); r.r = Math.max(r.r, b.right); r.b = Math.max(r.b, b.bottom); }
      });
      if (!r || gsap.getProperty(btn, 'opacity') < 0.05) return null;
      // While he peeks over an edge, everything below his feet line is clipped away.
      if (btn.style.clipPath && btn.style.clipPath !== 'none') r.b = Math.min(r.b, btn.getBoundingClientRect().bottom);
      if (r.b <= r.t) return null;
      return { x: (r.l - sr.left) / sc, y: (r.t - sr.top) / sc, w: (r.r - r.l) / sc, h: (r.b - r.t) / sc };
    };

    /* --- motion pieces --- */
    /* Steps every ~0.14 s. He leans into the run, the head turns 3/4 toward the travel direction (the far
       ear's inner hidden), legs swing +-50 with the arms in opposition, the body bobs 3 units up at
       mid-stride and the ear tips trail the bob by 0.06 s. Every second contact kicks up dust. */
    function runCycle(tl, at, dur, o) {
      o = o || {};
      var steps = Math.max(2, Math.round(dur / 0.14)), sd = dur / steps;
      var lean = o.lean === undefined ? 10 : o.lean;
      tl.to(P.root, { rotation: lean, duration: 0.12, ease: 'power2.out' }, at);
      tl.to(P.head, { x: 2, duration: 0.12, ease: 'power2.out' }, at);
      tl.to(P.scarfTails, { rotation: -20, duration: 0.15 }, at);
      tl.to(P.look, { x: 3, duration: 0.12, ease: 'power2.out' }, at);
      tl.to(P.face, { x: 9, duration: 0.12, ease: 'power2.out' }, at);
      tl.to(P.inL, { opacity: 0, duration: 0.08 }, at);
      if (o.carry) {
        armTo(tl, -35, { duration: 0.12 }, at, 35);
        tl.to(P.trail, { opacity: 1, duration: 0.12 }, at + 0.08);
      }
      for (var i = 0; i < steps; i++) {
        var s = i % 2 ? 1 : -1, t = at + i * sd;
        tl.to(P.legL, { rotation: 50 * s, duration: sd, ease: 'sine.inOut' }, t);
        tl.to(P.legR, { rotation: -50 * s, duration: sd, ease: 'sine.inOut' }, t);
        tl.to(P.armL, { rotation: -55 * s, duration: sd, ease: 'sine.inOut' }, t);
        if (!o.carry) armTo(tl, s > 0 ? 55 : -18, { duration: sd, ease: 'sine.inOut' }, t);
        tl.to(P.root, { y: -4, duration: sd / 2, ease: 'sine.out', yoyo: true, repeat: 1 }, t);
        tl.to(P.root, { scaleY: 0.92, scaleX: 1.06, duration: 0.05, ease: 'power1.out', yoyo: true, repeat: 1 }, t);
        tl.to([P.tipL, P.tipR], { rotation: -26, duration: sd / 2, ease: 'sine.out', yoyo: true, repeat: 1 }, t + 0.06);
        if (i % 2) tl.fromTo(P.dust, { opacity: 0.9, x: 0 }, { opacity: 0, x: -10, duration: Math.min(0.3, sd * 2), ease: 'power1.out' }, t);
      }
      var end = at + dur;
      tl.to([P.legL, P.legR, P.armL, P.root, P.tipL, P.tipR, P.scarfTails], { rotation: 0, duration: 0.14, ease: 'power2.out' }, end);
      tl.to([P.look, P.head], { x: 0, duration: 0.16 }, end);
      tl.to(P.face, { x: 6, duration: 0.04 }, end);   // back to the plain side view, before any face change
      tl.to(P.inL, { opacity: 1, duration: 0.1 }, end);
      if (o.carry) {
        armTo(tl, o.keepCarry ? -35 : 0, { duration: 0.14 }, end, o.keepCarry ? 35 : 0);
        tl.to(P.trail, { opacity: 0, duration: 0.25 }, end);
      } else armTo(tl, 0, { duration: 0.14 }, end);
      tl.to(P.root, { y: 0, scaleX: 1, scaleY: 1, duration: 0.1 }, end);
    }
    /* runTo(x, {y, speed, dash, dur, ease, carry, face}) */
    kit.runTo = function (x, o) {
      o = o || {};
      var tl = gsap.timeline();
      var x0 = kit.st.x, y0 = kit.st.y, y = o.y === undefined ? y0 : o.y;
      var dist = Math.hypot(x - x0, y - y0);
      var speed = o.speed || (o.dash ? 1600 : 700);
      var dur = o.dur || Math.max(0.2, dist / speed);
      if (dist < 2) return fin(tl);
      faceTo(tl, x >= x0 ? 'r' : 'l', 0);
      tl.to(btn, { x: x - w / 2, y: y - h, duration: dur, ease: o.ease || 'power1.inOut' }, 0);
      runCycle(tl, 0, dur, { carry: o.carry, keepCarry: o.keepCarry, lean: o.dash ? 14 : 10 });
      if (o.dash) tl.fromTo(P.speed, { opacity: 0 }, { opacity: 0.8, duration: 0.1, yoyo: true, repeat: 1, repeatDelay: Math.max(0, dur - 0.2) }, 0);
      kit.st.x = x; kit.st.y = y;
      if (o.face) faceTo(tl, o.face, dur + 0.05);
      return fin(tl);
    };
    kit.runAcross = function (dir, y) {
      kit.at(dir === 'l' ? 1990 : -70, y === undefined ? 104 : y, dir === 'l' ? 'l' : 'r');
      return kit.runTo(dir === 'l' ? -70 : 1990, { dash: true });
    };
    kit.jumpTo = function (x, y, o) {
      o = o || {};
      var tl = gsap.timeline(), dur = o.dur || 0.42, hgt = lift(o.h || Math.max(26, Math.abs(y - kit.st.y) * 0.4 + 20), Math.min(y, kit.st.y));
      if (Math.abs(x - kit.st.x) > 2) faceTo(tl, x > kit.st.x ? 'r' : 'l', 0);
      tl.to(P.root, { scaleY: 0.88, duration: 0.08 }, 0);
      tl.to(P.root, { scaleY: 1.06, duration: 0.12 }, 0.08);
      tl.to(btn, { x: x - w / 2, y: y - h, duration: dur, ease: 'none' }, 0.08);
      tl.to(flip, { y: -hgt, duration: dur / 2, ease: 'power2.out' }, 0.08);
      tl.to(flip, { y: 0, duration: dur / 2, ease: 'power2.in' }, 0.08 + dur / 2);
      tl.to([P.armL], { rotation: 60, duration: 0.15 }, 0.08);
      armTo(tl, -60, { duration: 0.15 }, 0.08);
      tl.to(P.root, { scaleY: 0.92, duration: 0.06 }, 0.08 + dur);
      tl.to(P.root, { scaleY: 1, duration: 0.12 }, 0.14 + dur);
      tl.to(P.armL, { rotation: 0, duration: 0.15 }, 0.08 + dur);
      armTo(tl, 0, { duration: 0.15 }, 0.08 + dur);
      kit.st.x = x; kit.st.y = y;
      if (o.face) faceTo(tl, o.face, dur + 0.1);
      return fin(tl);
    };
    kit.hop = function (hgt) {
      hgt = lift(hgt || 14);
      var tl = gsap.timeline();
      tl.to(P.root, { scaleY: 0.9, duration: 0.07 }, 0);
      tl.to(flip, { y: -hgt, duration: 0.14, ease: 'power2.out' }, 0.07);
      tl.to(P.root, { scaleY: 1.05, duration: 0.1 }, 0.07);
      tl.to(flip, { y: 0, duration: 0.14, ease: 'power2.in' }, 0.21);
      tl.to(P.root, { scaleY: 0.94, duration: 0.05 }, 0.35);
      tl.to(P.root, { scaleY: 1, duration: 0.1 }, 0.4);
      return fin(tl);
    };
    kit.skid = function () {
      var tl = gsap.timeline();
      var dir = kit.st.face === 'l' ? -1 : 1;
      tl.to(P.root, { rotation: -12, duration: 0.08, ease: 'power2.out' }, 0);
      tl.fromTo(P.dust, { opacity: 0, x: 0 }, { opacity: 1, x: -6, duration: 0.12 }, 0);
      tl.to(P.dust, { opacity: 0, x: -14, duration: 0.3 }, 0.14);
      tl.to(btn, { x: '+=' + (8 * dir), duration: 0.16, ease: 'power2.out' }, 0);
      tl.to(P.root, { rotation: 0, duration: 0.22, ease: 'back.out(2)' }, 0.16);
      kit.st.x += 8 * dir;
      return fin(tl);
    };
    kit.wave = function (n, o) {
      n = n || 2; o = o || {};
      var tl = gsap.timeline();
      tl.to(P.armL, { rotation: 140, duration: 0.18, ease: 'power2.out' }, 0);
      tl.to(P.head, { rotation: 8, duration: 0.2 }, 0);
      tl.to(lows, { scaleY: 0.7, duration: 0.15 }, 0);
      tl.to(lids, { scaleY: 0, duration: 0.15 }, 0);
      for (var i = 0; i < n; i++) {
        tl.to(P.armL, { rotation: 120, duration: 0.11, ease: 'sine.inOut' }, 0.18 + i * 0.44);
        tl.to(P.armL, { rotation: 160, duration: 0.22, ease: 'sine.inOut' }, 0.29 + i * 0.44);
        tl.to(P.armL, { rotation: 140, duration: 0.11, ease: 'sine.inOut' }, 0.51 + i * 0.44);
      }
      if (!o.hold) {
        var e = 0.2 + n * 0.44;
        tl.to(P.armL, { rotation: 0, duration: 0.22, ease: 'power2.inOut' }, e);
        tl.to(P.head, { rotation: 0, duration: 0.22 }, e);
        if (!o.keepHappy) { tl.to(lows, { scaleY: 0, duration: 0.2 }, e + 0.1); tl.to(lids, { scaleY: 0.12, duration: 0.2 }, e + 0.1); }
      }
      return fin(tl);
    };
    kit.cheer = function (o) {
      o = o || {};
      var tl = gsap.timeline(), hgt = lift(o.h === undefined ? 40 : o.h);
      tl.to(P.root, { scaleY: 0.9, duration: 0.1 }, 0);
      tl.to(lows, { scaleY: 0.7, duration: 0.1 }, 0); tl.to(lids, { scaleY: 0, duration: 0.1 }, 0);
      tl.to(P.armL, { rotation: 150, duration: 0.18 }, 0.08);
      armTo(tl, -150, { duration: 0.18 }, 0.08);
      tl.to([P.earL, P.earR, P.tipL, P.tipR], { rotation: 0, duration: 0.15 }, 0.08);
      tl.to(P.mouthO, { opacity: 1, duration: 0.1 }, 0.1); tl.to(P.mouth, { opacity: 0, duration: 0.1 }, 0.1);
      tl.to(P.root, { scaleY: 1.08, duration: 0.14 }, 0.1);
      tl.to(flip, { y: -hgt, duration: 0.24, ease: 'power2.out' }, 0.1);
      tl.to(flip, { y: 0, duration: 0.22, ease: 'power2.in' }, 0.34);
      tl.to(P.root, { scaleY: 0.92, duration: 0.06 }, 0.56);
      tl.to(P.root, { scaleY: 1, duration: 0.14, ease: 'back.out(3)' }, 0.62);
      // the Sprig as a sparkler
      tl.to(P.glow, { scale: 1.5, duration: 0.08, yoyo: true, repeat: 5, ease: 'sine.inOut' }, 0.1);
      tl.call(function () { var p = kit.tip(); motes(p.x, p.y, o.color || 'multi', 10, 54); }, null, 0.3);
      if (!o.hold) {
        tl.to(P.armL, { rotation: 0, duration: 0.25 }, 0.95);
        armTo(tl, 0, { duration: 0.25 }, 0.95);
        tl.to(P.mouthO, { opacity: 0, duration: 0.15 }, 0.95); tl.to(P.mouth, { opacity: 1, duration: 0.15 }, 0.95);
      }
      return fin(tl);
    };
    kit.twirl = function () {
      var tl = gsap.timeline(), s = flipSign();
      function sx(m) { return function () { return m * curS(); }; }
      tl.to(flip, { scaleX: sx(-s), duration: 0.14, ease: 'sine.in' }, 0);
      tl.to(flip, { scaleX: sx(s), duration: 0.14, ease: 'sine.out' }, 0.14);
      tl.to(flip, { scaleX: sx(-s), duration: 0.14, ease: 'sine.in' }, 0.28);
      tl.to(flip, { scaleX: sx(s), duration: 0.14, ease: 'sine.out' }, 0.42);
      tl.to(flip, { y: -lift(10), duration: 0.28, ease: 'power2.out', yoyo: true, repeat: 1 }, 0);
      return fin(tl);
    };
    kit.stamp = function (color) {
      var tl = gsap.timeline();
      armTo(tl, -70, { duration: 0.07, ease: 'power2.out' }, 0);
      armTo(tl, 25, { duration: 0.07, ease: 'power3.in' }, 0.07);
      tl.to(P.root, { scaleY: 0.92, duration: 0.05, yoyo: true, repeat: 1 }, 0.12);
      tl.call(function () { var p = kit.local(78, 108); ringAt(p.x, p.y, color || 'green'); }, null, 0.14);
      armTo(tl, 0, { duration: 0.1 }, 0.17);
      return fin(tl);
    };
    kit.flag = function (color) {
      var tl = gsap.timeline();
      /* Raise the wand, plant it upright beside him, and the pennant unfurls and waves twice. */
      armTo(tl, -95, { duration: 0.14 }, 0);
      tl.to(P.armR, { rotation: -65, duration: 0.14, ease: 'power3.in' }, 0.14);
      tl.to(P.sprig, { rotation: 32, duration: 0.14, ease: 'power3.in' }, 0.14);
      tl.to(P.armL, { rotation: -28, duration: 0.2 }, 0.14);
      tl.to(P.root, { scaleY: 0.94, duration: 0.05, yoyo: true, repeat: 1 }, 0.28);
      tl.call(function () { var p = kit.local(80, 118); ringAt(p.x, p.y, color || 'green'); }, null, 0.28);
      tl.fromTo(P.pennant, { autoAlpha: 0, scale: 0.3, svgOrigin: '79.8 75.55' }, { autoAlpha: 1, scale: 1, duration: 0.2, ease: 'back.out(2)' }, 0.3);
      tl.fromTo(P.pen, { skewY: 0 }, { skewY: 8, duration: 0.16, ease: 'sine.inOut', yoyo: true, repeat: 3 }, 0.42);
      tl.to(P.pen, { skewY: -8, duration: 0.16, ease: 'sine.inOut', yoyo: true, repeat: 1 }, 1.06);
      return fin(tl);
    };
    kit.pointAt = function (t, o) {
      o = o || {};
      if (t && t.getBoundingClientRect) t = centerOf(t);
      var tl = gsap.timeline();
      var face = t.x < kit.st.x - 10 ? 'l' : 'r';
      faceTo(tl, face, 0);
      var sx = kit.st.x + (face === 'l' ? -1 : 1) * (65 - 50) * k * zs, sy = kit.st.y - (h - 80 * k) * zs;
      var dx = Math.abs(t.x - sx), dy = t.y - sy;
      var ang = Math.atan2(dy, dx) * 180 / Math.PI;           // in the facing frame
      var rot = clamp(ang - 76, -170, 10);
      armTo(tl, rot, { duration: 0.22, ease: 'back.out(1.6)' }, 0);
      tl.to(P.root, { rotation: 4, duration: 0.2 }, 0);
      tl.to(P.pupils, { x: 2.5, y: clamp(dy / 200, -1, 1) * 2.5, duration: 0.15 }, 0);
      tl.to(P.look, { rotation: clamp(dy / 60, -1, 1) * 6, duration: 0.2 }, 0);
      tl.to(P.glow, { scale: 1.45, duration: 0.12, yoyo: true, repeat: 3, ease: 'sine.inOut' }, 0.22);
      return fin(tl);
    };
    kit.lookAt = function (t) {
      var tl = gsap.timeline();
      if (!t) { kit.lookHold = false; tl.to(P.pupils, { x: 0, y: 0, duration: 0.15 }, 0); tl.to(P.look, { rotation: 0, duration: 0.2 }, 0); return fin(tl); }
      if (t.getBoundingClientRect) t = centerOf(t);
      kit.lookHold = true;
      var me = { x: kit.st.x, y: kit.st.y - h * 0.6 * zs };
      var dx = (t.x - me.x) * flipSign(), dy = t.y - me.y;
      tl.to(P.pupils, { x: clamp(dx / 160, -1, 1) * 2.5, y: clamp(dy / 160, -1, 1) * 2.5, duration: 0.1 }, 0);
      tl.to(P.look, { rotation: clamp(dx / 300, -1, 1) * 6 + clamp(dy / 300, -1, 1) * 3 * (dx >= 0 ? 1 : -1), duration: 0.16 }, 0);
      return fin(tl);
    };
    /* peek(edge, y, {x}): pops in from a clipped stage edge, ears first, looks around, blinks. */
    kit.peek = function (edge, y, o) {
      o = o || {};
      var tl = gsap.timeline();
      var right = edge !== 'l';
      var x0 = right ? 1920 + w / 2 + 6 : -w / 2 - 6;
      var x1 = o.x !== undefined ? o.x : (right ? 1920 - w * 0.4 + w / 2 : w * 0.4 - w / 2);
      tl.call(function () { kit.at(x0, y, right ? 'l' : 'r'); }, null, 0);
      kit.st.x = x0; kit.st.y = y; kit.st.face = right ? 'l' : 'r';
      tl.to(btn, { x: x1 - w / 2, duration: 0.45, ease: 'back.out(1.4)' }, 0.02);
      tl.fromTo(P.root, { rotation: -14 }, { rotation: 0, duration: 0.5, ease: 'back.out(2)' }, 0.02);
      tl.to(P.pupils, { x: 2.5, duration: 0.1 }, 0.5);
      tl.to(P.pupils, { x: -2, duration: 0.1 }, 0.75);
      tl.to(P.pupils, { x: 0, duration: 0.1 }, 1.0);
      tl.to(lids, { scaleY: 1, duration: 0.06, yoyo: true, repeat: 1 }, 1.1);
      kit.st.x = x1;
      kit.away = false;
      return fin(tl);
    };
    kit.slideDown = function (y) {
      var tl = gsap.timeline();
      tl.to(P.armL, { rotation: 150, duration: 0.15 }, 0);
      armTo(tl, -150, { duration: 0.15 }, 0);
      tl.to(btn, { y: y - h, duration: Math.max(0.3, Math.abs(y - kit.st.y) / 1400), ease: 'power2.in' }, 0.1);
      var ds = 0.1 + Math.max(0.3, Math.abs(y - kit.st.y) / 1400);
      tl.to(P.armL, { rotation: 0, duration: 0.2 }, ds);
      armTo(tl, 0, { duration: 0.2 }, ds);
      tl.add(kit.hop(6), '>-0.1');
      kit.st.y = y;
      return fin(tl);
    };
    /* Slide-to-slide continuity: while kit.travel is +1 or -1 (set by wow.js while it builds a forward
       or backward slide change), vanish runs him out that way and poof runs him in from the other side,
       instead of the puff. Transform and opacity only. */
    kit.travel = 0;
    var ZIP = 240;
    function zipOut(tl, at) {
      var d = kit.travel;
      faceTo(tl, d > 0 ? 'r' : 'l', at);
      tl.to(btn, { x: '+=' + (ZIP * d), autoAlpha: 0, duration: 0.25, ease: 'power2.in' }, at);
      runCycle(tl, at, 0.25, { lean: 14 });
      tl.fromTo(P.speed, { opacity: 0 }, { opacity: 0.8, duration: 0.1, yoyo: true, repeat: 1 }, at);
      kit.away = true;
    }
    function zipIn(tl, x, y, face, at) {
      var d = kit.travel;
      tl.call(function () { kit.at(x - ZIP * d, y, d > 0 ? 'r' : 'l'); gsap.set(btn, { autoAlpha: 0 }); }, null, at);
      kit.st.face = d > 0 ? 'r' : 'l';
      tl.to(btn, { x: x - w / 2, autoAlpha: 1, duration: 0.3, ease: 'power2.out', immediateRender: false }, at + 0.01);
      runCycle(tl, at + 0.01, 0.3, { lean: 12 });
      tl.fromTo(P.speed, { opacity: 0 }, { opacity: 0.8, duration: 0.1, yoyo: true, repeat: 1, immediateRender: false }, at + 0.01);
      if (face) faceTo(tl, face, at + 0.34); else kit.st.face = d > 0 ? 'r' : 'l';
      kit.st.x = x; kit.st.y = y;
      kit.away = false;
    }
    kit.poof = function (x, y, face) {
      var tl = gsap.timeline(), wasAway = kit.away;
      if (kit.travel) {
        if (!wasAway) zipOut(tl, 0);
        zipIn(tl, x, y, face, wasAway ? 0 : 0.27);
        return fin(tl);
      }
      if (!wasAway) {
        tl.call(function () { var p = kit.local(50, 80); motes(p.x, p.y, '#E9DCC6', 6, 30); }, null, 0);
        tl.to(btn, { scale: 0.2, autoAlpha: 0, transformOrigin: '50% 100%', duration: 0.15, ease: 'power2.in' }, 0);
      }
      tl.call(function () { gsap.set(btn, { x: x - w / 2, y: y - h }); if (face) kit.face(face); var p = kit.local(50, 80, { x: x, y: y, face: face || kit.st.face }); motes(p.x, p.y, '#E9DCC6', 6, 30); }, null, wasAway ? 0 : 0.15);
      tl.fromTo(btn, { scale: 0.2, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, transformOrigin: '50% 100%', duration: 0.2, ease: 'back.out(2.4)', immediateRender: false }, wasAway ? 0.01 : 0.16);
      kit.st.x = x; kit.st.y = y; if (face) kit.st.face = face;
      kit.away = false;
      return fin(tl);
    };
    kit.vanish = function () {
      var tl = gsap.timeline();
      if (kit.away) return fin(tl);
      if (kit.travel) { zipOut(tl, 0); return fin(tl); }
      tl.call(function () { var p = kit.local(50, 80); motes(p.x, p.y, '#E9DCC6', 6, 30); }, null, 0);
      tl.to(btn, { scale: 0.2, autoAlpha: 0, transformOrigin: '50% 100%', duration: 0.15, ease: 'power2.in' }, 0);
      kit.away = true;
      return fin(tl);
    };
    var zloop = null;
    kit.sleep = function () {
      var tl = gsap.timeline();
      poseTo(tl, 'sleep', 0, 0.6);
      sprigTo(tl, 'dim', 0, 0.6);
      tl.call(function () {
        kit.asleep = true; btn.classList.add('asleep');
        if (zloop) zloop.kill();
        if (kit.static) { gsap.set([P.z1, P.z2], { opacity: 0.9 }); return; }
        zloop = gsap.timeline({ repeat: 4, repeatDelay: 0.6 });   // a few z's, then he sleeps still
        [P.z1, P.z2, P.z3].forEach(function (z, i) {
          zloop.fromTo(z, { opacity: 0, y: 6 }, { opacity: 0.9, y: 0, duration: 0.5, ease: 'sine.out' }, i * 0.6);
          zloop.to(z, { opacity: 0, y: -6, duration: 0.6 }, i * 0.6 + 1.2);
        });
      }, null, 0.6);
      return fin(tl);
    };
    kit.wake = function () {
      var tl = gsap.timeline();
      tl.call(function () { kit.asleep = false; btn.classList.remove('asleep'); if (zloop) { zloop.kill(); zloop = null; } gsap.to([P.z1, P.z2, P.z3], { opacity: 0, duration: 0.2 }); }, null, 0);
      poseTo(tl, 'stand', 0, 0.3);
      // stretch, then a yawn made of a squint
      tl.to([P.armL], { rotation: 165, duration: 0.3 }, 0.1); armTo(tl, -165, { duration: 0.3 }, 0.1);
      tl.to(P.root, { scaleY: 1.08, duration: 0.3 }, 0.1);
      tl.to(lids, { scaleY: 0.6, duration: 0.2 }, 0.2);
      tl.to(P.mouthO, { opacity: 1, scale: 1.4, duration: 0.25 }, 0.25); tl.to(P.mouth, { opacity: 0, duration: 0.1 }, 0.25);
      tl.to(P.mouthO, { opacity: 0, scale: 1, duration: 0.2 }, 0.8); tl.to(P.mouth, { opacity: 1, duration: 0.1 }, 0.85);
      tl.to(P.armL, { rotation: 0, duration: 0.25 }, 0.8); armTo(tl, 0, { duration: 0.25 }, 0.8);
      tl.to(P.root, { scaleY: 1, duration: 0.25 }, 0.8);
      tl.to(lids, { scaleY: 0.12, duration: 0.15 }, 0.95);
      sprigTo(tl, kit.st.sprig === 'dim' ? 'rose' : kit.st.sprig, 0.6, 0.3);
      return fin(tl);
    };
    kit.burst = function (color, n) { var p = kit.tip(); motes(p.x, p.y, color || 'multi', n || 10, 50); return kit; };
    kit.ring = function (color) { var p = kit.tip(); ringAt(p.x, p.y, color || 'green'); return kit; };
    kit.picto = function (name, dur) {
      var el = P[name], tl = gsap.timeline();
      if (!el) return fin(tl);
      tl.fromTo(el, { opacity: 0, y: 6, scale: 0.6, svgOrigin: '50 10' }, { opacity: 1, y: 0, scale: 1, duration: 0.2, ease: 'back.out(2)' }, 0);
      tl.to(el, { opacity: 0, y: -8, duration: 0.3 }, dur || 0.9);
      return fin(tl);
    };
    kit.ears = function (rot, tip, dur) {
      var tl = gsap.timeline();
      tl.to(P.earL, { rotation: -rot, duration: dur || 0.2 }, 0); tl.to(P.earR, { rotation: rot, duration: dur || 0.2 }, 0);
      tl.to(P.tipL, { rotation: -(tip || 0), duration: dur || 0.2 }, 0); tl.to(P.tipR, { rotation: tip || 0, duration: dur || 0.2 }, 0);
      return fin(tl);
    };
    kit.flick = function () {
      var tl = gsap.timeline();
      tl.to(P.tipL, { rotation: -26, duration: 0.07, yoyo: true, repeat: 1 }, 0);
      tl.to(P.tipR, { rotation: 26, duration: 0.07, yoyo: true, repeat: 1 }, 0.05);
      return fin(tl);
    };
    kit.poseTo = function (name, dur) { var tl = gsap.timeline(); poseTo(tl, name, 0, dur); return fin(tl); };
    kit.faceTo = function (f) { var tl = gsap.timeline(); faceTo(tl, f, 0); return fin(tl); };
    kit.happy = function (on) { var tl = gsap.timeline(); tl.to(lows, { scaleY: on ? 0.7 : 0, duration: 0.15 }, 0); tl.to(lids, { scaleY: on ? 0 : 0.12, duration: 0.15 }, 0); return fin(tl); };
    kit.wide = function (on) { return fin(gsap.timeline().to([P.pupilL, P.pupilR], { scale: on ? 1.25 : 1, duration: 0.15 }, 0)); };
    kit.type = function (dur) {
      var tl = gsap.timeline(); dur = dur || 0.6;
      tl.to(P.armL, { rotation: -30, duration: 0.1 }, 0); tl.to(P.armR, { rotation: 30, duration: 0.1 }, 0);
      tl.to(P.armL, { rotation: -42, duration: 0.06, yoyo: true, repeat: Math.round(dur / 0.12) }, 0.1);
      tl.to(P.armR, { rotation: 42, duration: 0.06, yoyo: true, repeat: Math.round(dur / 0.12) }, 0.16);
      tl.to([P.armL, P.armR], { rotation: 0, duration: 0.12 }, dur + 0.2);
      return fin(tl);
    };

    /* --- life: blink, ear twitch, cursor follow --- */
    var lifeOn = false, blinkCall = null, twitchCall = null, halo = null;
    function blink() {
      blinkCall = gsap.delayedCall(2.5 + Math.random() * 3.5, blink);
      var cur = gsap.getProperty(P.lidL, 'scaleY');
      if (cur > 0.5 || kit.asleep || gsap.getProperty(P.lowL, 'scaleY') > 0.3) return;
      gsap.to(lids, { scaleY: 1, duration: 0.06, yoyo: true, repeat: 1, ease: 'power1.inOut' });
    }
    function twitch() {
      twitchCall = gsap.delayedCall(6 + Math.random() * 2.5, twitch);
      if (kit.asleep) return;
      gsap.to(Math.random() < 0.5 ? P.tipL : P.tipR, { rotation: '+=' + (Math.random() < 0.5 ? -16 : 16), duration: 0.08, yoyo: true, repeat: 1 });
    }
    var qLook, qPx, qPy;
    /* The Sprig's halo breathes twice, slowly, then rests (opacity only), so nothing blinks beside the numbers. */
    kit.pulse = function () {
      if (halo) halo.kill();
      if (!lifeOn) return kit;
      halo = gsap.fromTo(btn.querySelectorAll('.k-halo'), { opacity: 1 }, { opacity: 0.8, duration: 1.2, ease: 'sine.inOut', yoyo: true, repeat: 3 });
      return kit;
    };
    kit.life = function (on) {
      if (on === lifeOn) return kit;
      lifeOn = on;
      if (on) {
        blink(); twitch();
        kit.pulse();
        qLook = gsap.quickTo(P.look, 'rotation', { duration: 0.4, ease: 'power3' });
        qPx = gsap.quickTo(P.pupils, 'x', { duration: 0.25, ease: 'power3' });
        qPy = gsap.quickTo(P.pupils, 'y', { duration: 0.25, ease: 'power3' });
      } else {
        if (blinkCall) blinkCall.kill(); if (twitchCall) twitchCall.kill(); if (halo) { halo.kill(); halo = null; }
      }
      return kit;
    };
    kit.follow = function (sx, sy) {
      if (!lifeOn || kit.lookHold || kit.asleep || kit.static || kit.away) return;
      var dx = (sx - kit.st.x) * flipSign(), dy = sy - (kit.st.y - h * 0.6);
      qLook(clamp(dx / 400, -1, 1) * 6);
      qPx(clamp(dx / 220, -1, 1) * 2.5);
      qPy(clamp(dy / 220, -1, 1) * 2.5);
    };

    /* stop: drop everything scripted and stand still where he is */
    kit.stop = function () {
      gsap.killTweensOf(btn); gsap.killTweensOf(flip);
      for (var n in P) if (P[n]) gsap.killTweensOf(P[n]);
      GLOWS.forEach(function (g) { gsap.killTweensOf(G[g]); });
      if (zloop) { zloop.kill(); zloop = null; }
      gsap.set([P.z1, P.z2, P.z3, P.heart, P.bang, P.talk, P.speed, P.dust], { opacity: 0 });
      gsap.set(flip, { y: 0 });
      gsap.set(btn, { scale: 1 });
      btn.style.clipPath = '';
      btn.style.maskImage = btn.style.webkitMaskImage = '';
      gsap.set(P.head, { x: 0 });
      gsap.set(P.trail, { opacity: 0 });
      if (!kit.away) gsap.set(btn, { autoAlpha: 1 });
      kit.asleep = false; btn.classList.remove('asleep');
      kit.lookHold = false;
      kit.sync();
      kit.pose('stand');
      kit.face(kit.st.face);
      gsap.set(P.pupils, { x: 0, y: 0 }); gsap.set(P.look, { rotation: 0, x: 0 }); gsap.set(P.glow, { scale: 1 });
      return kit;
    };
    kit.remove = function () { kit.life(false); kit.stop(); rm(btn); };

    kit.mount = function (parent) {
      if (btn.parentNode !== parent) parent.appendChild(btn);
      origins();
      kit.pose('stand'); kit.sprig(kit.st.sprig);
      kit.at(kit.st.x, kit.st.y, 'front');
      return kit;
    };
    /* A still copy for print and phones: no motion, a pose, mounted in its own box. */
    kit.still = function (parent, pose, sprig, face) {
      kit.static = true;
      parent.appendChild(btn.querySelector('svg'));
      var pict = btn.querySelector('.k-pict'); if (pict) rm(pict);
      origins();
      kit.pose(pose || 'stand');
      kit.sprig(sprig || 'rose');
      gsap.set(P.face, { x: face && face !== 'front' ? 6 : 0 });
      return kit;
    };
    return kit;
  }

  function centerOf(el) {
    var sr = stage.getBoundingClientRect(), sc = sr.width / 1920, b = el.getBoundingClientRect();
    return { x: (b.left + b.width / 2 - sr.left) / sc, y: (b.top + b.height / 2 - sr.top) / sc };
  }

  /* ---------- the public Kip ---------- */
  var Kip = createKit();
  var buddies = [];
  Kip.createKit = createKit;
  Kip.motes = function (x, y, c, n) { motes(x, y, c, n); };
  Kip.ringAt = function (x, y, c) { ringAt(x, y, c); };
  var baseMount = Kip.mount;
  Kip.mount = function (st) {
    stage = st;
    layer = document.getElementById('kip-layer');
    if (!layer) { layer = document.createElement('div'); layer.id = 'kip-layer'; layer.setAttribute('aria-hidden', 'true'); st.appendChild(layer); }
    baseMount(layer);
    Kip.mounted = true;
    return Kip;
  };
  Kip.buddy = function (o) {
    var b = createKit(o || { scarf: 'amber', scale: 0.85 });
    b.static = Kip.static;
    b.mount(layer);
    buddies.push(b);
    return b;
  };
  Kip.dropBuddies = function () { buddies.forEach(function (b) { b.remove(); }); buddies = []; };
  Kip.buddies = function () { return buddies; };
  Kip.toStage = function (cx, cy) {
    if (!stage) return null;
    var sr = stage.getBoundingClientRect(), sc = sr.width / 1920;
    return { x: (cx - sr.left) / sc, y: (cy - sr.top) / sc };
  };
  window.Kip = Kip;
})();
