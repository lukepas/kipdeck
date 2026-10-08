/* === WOW: Kip's moment on each slide, plus small extras ===
   Kip lives on #kip-layer above the slides, so he carries over from one slide to the next.
   Each moment's beat times mirror the matching builder in slides.js (B.sN); keep them in step.
   Going back never replays motion: Kip cuts to the slide's home spot and pose. R replays. */
(function () {
  'use strict';
  var cfg = window.DECK_CONFIG || {};
  var q = new URLSearchParams(location.search);
  var gsap = window.gsap, K = window.Kip, doc = document;
  if (q.has('presenter') || q.has('nokip') || cfg.kip === false || !gsap || !K) return;

  var stage = doc.getElementById('stage');
  var slides = Array.prototype.slice.call(doc.querySelectorAll('.slide'));
  var reducedMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduced = reducedMQ.matches || q.has('static');
  var isPrint = q.has('print');
  var hold = q.has('hold');
  var isFlow = !isPrint && window.matchMedia('(max-width: 820px), (max-aspect-ratio: 4/5)').matches;
  var still = reduced || hold;
  var LANE = 108;            // the top strip: feet just above the eyebrow labels (lifts there are capped at 4 px)
  var HERO = 1.35;           // Kip's size for the two hero moments (s1, s14)

  /* Turning Reduce Motion on or off mid-talk: reload, the same way deck.js handles flow-mode changes.
     Only when it changes what this page does (not under ?static, which is always still). */
  if (reducedMQ.addEventListener && !q.has('static')) reducedMQ.addEventListener('change', function (e) { if (e.matches !== reduced) location.reload(); });

  function A(s, n) { return s.querySelector('[data-a="' + n + '"]'); }
  function $$(s, sel) { return Array.prototype.slice.call(s.querySelectorAll(sel)); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function box(x, y, w, h) { return { x: x, y: y, w: w, h: h, cx: x + w / 2, cy: y + h / 2 }; }
  /* Layout box in stage pixels, from offsets: a slide's start-state transforms do not move it.
     SVG parts have no offsets, so they are measured against their nearest box that has. */
  function lay(el) {
    if (el.offsetLeft === undefined) {
      var p = el.parentElement, pl = lay(p), k = stage.getBoundingClientRect().width / 1920 || 1;
      var a = el.getBoundingClientRect(), b = p.getBoundingClientRect();
      return box(pl.x + (a.left - b.left) / k, pl.y + (a.top - b.top) / k, a.width / k, a.height / k);
    }
    var x = 0, y = 0, e = el;
    while (e && e !== stage && !(e.classList && e.classList.contains('slide'))) { x += e.offsetLeft; y += e.offsetTop; e = e.offsetParent; }
    return box(x, y, el.offsetWidth, el.offsetHeight);
  }

  /* ---------- stickers: a still Kip for print, PDF and phones (s1 waving, s14 happy) ---------- */
  function stickerBox(s) {
    var b = doc.createElement('div');
    b.className = 'kip-sticker'; b.setAttribute('aria-hidden', 'true');
    return b;
  }
  function sticker(s, pose, sprig, left, top) {
    if (!s || s.querySelector('.kip-sticker')) return;
    var b = stickerBox(s);
    b.style.left = left + 'px'; b.style.top = top + 'px';
    s.appendChild(b);
    K.createKit().still(b, pose, sprig, 'front');
  }
  /* Phones: an inline sticker standing on a panel's top-right edge (before that panel in the flow). */
  function inlineSticker(s, panel, pose) {
    if (!s || !panel || s.querySelector('.kip-sticker')) return null;
    var b = stickerBox(s); b.classList.add('inline');
    panel.parentNode.insertBefore(b, panel);
    K.createKit().still(b, pose, 'green', 'front');
    return b;
  }
  function stickers() {
    var s1 = doc.getElementById('s1'), s14 = doc.getElementById('s14');
    if (isFlow) {
      inlineSticker(s1, s1 && A(s1, 'panel'), 'wave');            // on the queue panel, in the first screen
      var b14 = inlineSticker(s14, s14 && A(s14, 'final'), 'happy');   // on the cleared queue, "Nobody waiting."
      /* He arrives with the cleared queue (it rises at 2.0 on this slide's timeline). */
      if (b14 && !reduced) {
        gsap.set(b14, { autoAlpha: 0 });
        s14.addEventListener('slide:enter', function () { gsap.to(b14, { autoAlpha: 1, duration: 0.3, delay: 2.3 }); });
      }
      return;
    }
    sticker(s1, 'wave', 'green', 1720 - 37, 221 - 96);
    sticker(s14, 'happy', 'green', 1812 - 37, 371 - 96);
  }

  stickers();
  if (isPrint || isFlow) return;   // phones, print and PDF: stickers only, no running Kip

  /* ---------- stage mode: mount Kip ---------- */
  K.mount(stage);
  K.static = still;
  K.el.classList.toggle('static', still);
  K.at(2010, LANE, 'l');
  K.away = true;
  if (!still) K.life(true);

  /* ---------- per-slide moments ---------- */
  var ktl = null, cur = -1, lastIdx = -1;
  function enterFrom(tl, x, y, face, at) {
    at = at || 0;
    if (!K.away) tl.add(K.vanish(), at);
    tl.call(function () { K.at(x, y, face); gsap.set(K.el, { autoAlpha: 1, scale: 1 }); }, null, at + 0.16);
    K.st.x = x; K.st.y = y; K.st.face = face; K.away = false;
    return at + 0.16;
  }
  /* Hide him at once, without the vanish puff (when his old spot would sit on the new slide's text). */
  function cut(tl) {
    if (K.away) return;
    tl.set(K.el, { autoAlpha: 0 }, 0);
    K.away = true;
  }
  /* Same lane under 600 px: run. Farther: dash. Short lane change below the top strip: hop.
     Anything else (including any jump into or out of the top strip, which would clip his ears): poof. */
  function arrive(tl, x, y, at, o) {
    o = o || {}; at = at || 0;
    var dx = Math.abs(x - K.st.x), dy = Math.abs(y - K.st.y), g;
    if (K.away || o.poof) g = K.poof(x, y, o.face || 'front');
    else if (dx < 3 && dy < 3) { if (o.face) tl.add(K.faceTo(o.face), at); return at; }
    else if (dy < 4) g = K.runTo(x, { dash: dx >= 600, dur: o.dur, face: o.face });
    else if (dy < 160 && dx < 360 && Math.min(y, K.st.y) > 220) g = K.jumpTo(x, y, { face: o.face });
    else g = K.poof(x, y, o.face || 'front');
    tl.add(g, at);
    return at + g.duration();
  }

  /* Untransformed stage box of an element some slide tween scales (the s2 clock pops in from 0.9). */
  function layUnscaled(el) {
    var r = el.getBoundingClientRect(), sc = gsap.getProperty(el, 'scale') || 1;
    var a = K.toStage(r.left + r.width / 2, r.top + r.height / 2), k = stage.getBoundingClientRect().width / 1920 || 1;
    var w = r.width / k / sc, h = r.height / k / sc;
    return box(a.x - w / 2, a.y - h / 2, w, h);
  }
  /* Rise from behind a real edge (feet line y): ears, then eyes, clipped at the edge. Only ever called
     once that edge is drawn, so he never floats over empty space. Returns the time he is fully out. */
  function riseFrom(tl, x, y, face, at, o) {
    o = o || {};
    var F = K.flip, full = function () { return K.h * K.curSize() + 4; };
    if (!K.away) { tl.add(K.vanish(), Math.max(0, at - 0.2)); }
    tl.call(function () {
      K.at(x, y, face);
      K.el.style.clipPath = 'inset(-300% -300% 0 -300%)';      // hides whatever is below the edge
      gsap.set(F, { y: full() }); gsap.set(K.el, { autoAlpha: 1, scale: 1 });
    }, null, at);
    K.st.x = x; K.st.y = y; K.st.face = face; K.away = false;
    tl.to(F, { y: function () { return full() * 0.45; }, duration: 0.4, ease: 'back.out(1.7)' }, at + 0.03);   // ears, then eyes
    tl.add(K.flick(), at + 0.4);
    var out = at + (o.hold || 0.6);
    tl.to(F, { y: -18, duration: 0.2, ease: 'power2.out' }, out);                                                // springs out
    tl.call(function () { K.el.style.clipPath = ''; }, null, out + 0.16);
    tl.to(F, { y: 0, duration: 0.17, ease: 'power2.in' }, out + 0.2);
    tl.to(K.parts.root, { scaleY: 0.88, duration: 0.05, yoyo: true, repeat: 1 }, out + 0.37);
    return out + 0.47;
  }
  /* Landing squash and stretch, 0.25 s. */
  function squash(tl, at) {
    tl.to(K.parts.root, { scaleY: 0.8, scaleX: 1.16, duration: 0.07, ease: 'power2.out' }, at);
    tl.to(K.parts.root, { scaleY: 1.08, scaleX: 0.94, duration: 0.08, ease: 'power2.inOut' }, at + 0.07);
    tl.to(K.parts.root, { scaleY: 1, scaleX: 1, duration: 0.1, ease: 'back.out(3)' }, at + 0.15);
  }

  var BIG = 2.1;             // s1 entrance size; he settles to HERO
  var M = {
    /* 01: the panel gets its border at FREEZE 2.0 and the header fades in by 2.35. Only then does a big
       Kip rise over the panel's top-left edge, spring out, dash the length of the re-sorted queue,
       skid with a squash and stretch, settle to hero size and wave: 8 agents need you. */
    s1: {
      size: BIG,
      x1: 1720,
      home: function (s) { return { x: M.s1.x1, y: lay(A(s, 'panel')).y - 2, face: 'front', pose: 'happy', sprig: 'green', size: HERO }; },
      play: function (s, tl) {
        var pb = lay(A(s, 'panel')), y = pb.y - 2, x0 = pb.x + 96, x1 = M.s1.x1;
        var rows = $$(s, '[data-a="list"] .q-row');
        if (!K.away) tl.add(K.vanish(), 0);
        tl.call(function () { K.sprig('green'); }, null, 0.2);
        var t = riseFrom(tl, x0, y, 'r', 2.2, { hold: 0.55 });
        var top = rows[3] && lay(rows[3]);                         // the OpenCode row, top of the queue once sorted
        if (top) tl.add(K.lookAt({ x: pb.x + top.cx, y: pb.y + 60 + 36 }), 2.6);
        tl.add(K.lookAt(null), t - 0.1);
        tl.add(K.runTo(x1 - 10, { y: y, dur: 0.6, dash: true, ease: 'power1.in' }), t);
        tl.add(K.skid(), t + 0.6);
        squash(tl, t + 0.6);
        tl.add(K.sizeTo(HERO, 0.3, 'back.out(1.6)'), t + 0.85);
        tl.add(K.faceTo('front'), t + 0.95);
        tl.add(K.wave(2, { keepHappy: true }), t + 1.0);
        if (top) tl.add(K.lookAt({ x: pb.x + top.cx, y: pb.y + 96 }), t + 2.2);
        tl.add(K.lookAt(null), t + 3.2);
      }
    },
    /* 02: Kip sits on the clock's rim and follows the minute hand as it sweeps 0.3-1.9; he slumps
       (ears down) exactly as the sweep lands on +23 min, and flinches at the bars' thud (2.33). */
    s2: {
      rim: function (s) {
        var c = layUnscaled(A(s, 'clock')), k = Math.min(c.w / 300, c.h / 380);
        return { x: c.cx, y: c.y + (c.h - 380 * k) / 2 + 10 * k + 1, cy: c.y + (c.h - 380 * k) / 2 + 150 * k, k: k };
      },
      home: function (s) { var r = M.s2.rim(s); return { x: r.x, y: r.y, face: 'front', pose: 'sitdown', sprig: 'green' }; },
      play: function (s, tl) {
        var r = M.s2.rim(s);
        var t = arrive(tl, r.x, r.y, 0.02, { face: 'front' });
        tl.add(K.poseTo('sit', 0.2), Math.max(t, 0.25));
        // pupils on the minute hand's tip while it sweeps (the slide's own power2.inOut, 10:02 to 10:25)
        for (var j = 0; j <= 4; j++) {
          var tt = 0.3 + j * 0.4, m = 2 + 23 * gsap.parseEase('power2.inOut')(Math.min(1, (tt - 0.3) / 1.6)), a = m * 6 * Math.PI / 180;
          tl.add(K.lookAt({ x: r.x + 116 * r.k * Math.sin(a), y: r.cy - 116 * r.k * Math.cos(a) }), tt);
        }
        tl.add(K.poseTo('sitdown', 0.3), 1.9);
        tl.add(K.lookAt(null), 2.0);
        tl.add(K.flick(), 2.33);
        tl.to(K.parts.root, { y: 6, duration: 0.06, yoyo: true, repeat: 1 }, 2.33);
      }
    },
    /* 03: alt-tab cuts at 1.0 + n*0.24, the hard cut at 2.54 to the window nobody looks at. Kip dashes
       off with the cut, then rises over that window's top edge and stares at its timer. */
    s3: {
      spot: function (s) { var w = lay($$(s, '.win')[3]); return { x: w.x + w.w - 56, y: w.y - 4 }; },
      home: function (s) { var p = M.s3.spot(s); return { x: p.x, y: p.y, face: 'l', pose: 'stand', sprig: 'green', look: lay(A(s, 'wait')) }; },
      play: function (s, tl) {
        arrive(tl, 1560, LANE, 0, { face: 'front' });
        var wins = $$(s, '.win'), seq = [0, 1, 2, 0, 2, 1];
        seq.forEach(function (w, n) { var b = lay(wins[w]); tl.add(K.lookAt({ x: b.cx, y: b.cy }), 1.0 + n * 0.24); });
        tl.add(K.runTo(1995, { dash: true }), 2.54);
        tl.call(function () { K.away = true; }, null, 2.8);
        K.away = true;
        tl.add(K.lookAt(null), 2.8);
        var p = M.s3.spot(s), wt = lay(A(s, 'wait'));
        var t = riseFrom(tl, p.x, p.y, 'l', 2.95, { hold: 0.7 });
        tl.add(K.lookAt({ x: wt.cx, y: wt.cy }), t);
        tl.add(K.wide(true), t);
        tl.add(K.picto('bang', 0.8), t + 0.05);
      }
    },
    /* 04: 2.5 bar at 0.6, 5x pops at 1.35, the stack rises 1.6-2.5 (Claude Code, Cursor, Cognition),
       USD 5.5B+ at 2.45. Kip stands where the stack will grow and rides its top up; before the last
       segment he hops off to the chart floor beside it, then a happy hop and a paw up once the number settles. */
    s4: {
      size: 0.85,
      geo: function (s) {
        var a = A(s, 'sk1').getBoundingClientRect(), p = K.toStage(a.right, a.bottom);
        return { right: p.x, floor: p.y };
      },
      home: function (s) { var g = M.s4.geo(s); return { x: g.right + 54, y: g.floor, face: 'l', pose: 'pawup', sprig: 'teal', size: 0.85 }; },
      play: function (s, tl) {
        var g = M.s4.geo(s), rx = g.right - 30, sk = [A(s, 'sk1'), A(s, 'sk2')];
        tl.add(K.poof(rx, g.floor, 'front'), 0.4);
        tl.add(K.sprigTo('teal', 0.2), 0.75);
        tl.add(K.lookAt({ x: g.right - 400, y: g.floor - 200 }), 1.2);
        tl.add(K.ears(58, 22, 0.08), 1.35);
        tl.to(K.parts.tail, { scale: 1.3, duration: 0.1 }, 1.35);
        tl.add(K.ears(0, 0, 0.2), 1.75);
        tl.to(K.parts.tail, { scale: 1, duration: 0.3 }, 1.8);
        tl.add(K.lookAt(null), 1.55);
        // the ride: his feet follow the top of the stack (Claude Code, then Cursor) as it grows
        var ride = { v: 0 };
        tl.to(ride, { v: 1, duration: 0.5, ease: 'none', onUpdate: function () {
          var top = Infinity;
          sk.forEach(function (e) { var b = e.getBoundingClientRect(); if (b.height > 0.5) top = Math.min(top, K.toStage(0, b.top).y); });
          if (top < Infinity) gsap.set(K.el, { y: top - K.h });
        } }, 1.6);
        tl.to(K.parts.armL, { rotation: 120, duration: 0.2 }, 1.65);
        tl.to(K.parts.root, { scaleY: 0.92, duration: 0.1, yoyo: true, repeat: 1 }, 1.62);
        tl.to(K.parts.armL, { rotation: 0, duration: 0.2 }, 2.0);
        // where the ride leaves him (Cursor's final top, svg y 138 on the sk1 scale), for the hop's arc
        var r1 = A(s, 'sk1').getBoundingClientRect(), ks = (K.toStage(r1.right, 0).x - K.toStage(r1.left, 0).x) / 190;
        K.st.y = g.floor - (480 - 138) * ks;
        tl.call(function () { K.sync(); }, null, 2.1);
        tl.add(K.jumpTo(g.right + 54, g.floor, { h: 30, face: 'l' }), 2.1);
        squash(tl, 2.6);
        tl.add(K.lookAt(lay(A(s, 'tot'))), 2.7);
        tl.add(K.happy(true), 3.0);
        tl.add(K.hop(6), 3.0);
        tl.add(K.poseTo('pawup', 0.2), 3.3);
      }
    },
    /* 05: steps land at 0.5, 1.25, 2.0, 2.75. Kip hops down the left gutter beside each number. */
    s5: {
      size: 0.8,
      ys: function (s) { return $$(s, '.step .n').map(function (n) { var b = lay(n); return b.y + b.h; }); },
      home: function (s) { var ys = M.s5.ys(s); return { x: 70, y: ys[3], face: 'r', pose: 'happy', sprig: 'green', size: 0.8 }; },
      play: function (s, tl) {
        var ys = M.s5.ys(s), beats = [0.5, 1.25, 2.0, 2.75];
        tl.add(K.poof(70, ys[0], 'r'), 0.2);
        tl.add(K.sprigTo('teal', 0.15), 0.5);
        tl.add(K.jumpTo(70, ys[1], { dur: 0.3, face: 'r' }), beats[1] - 0.38);
        tl.add(K.picto('bang', 0.6), beats[1]);
        tl.add(K.jumpTo(70, ys[2], { dur: 0.3, face: 'r' }), beats[2] - 0.38);
        tl.add(K.type(0.5), beats[2] + 0.05);
        tl.add(K.jumpTo(70, ys[3], { dur: 0.3, face: 'r' }), beats[3] - 0.38);
        tl.add(K.sprigTo('green', 0.12), beats[3]);
        tl.add(K.twirl(), beats[3] + 0.05);
        tl.call(function () { K.burst('green', 12); }, null, beats[3] + 0.6);
        tl.add(K.happy(true), beats[3] + 0.6);
      }
    },
    /* 06: sits on the player and watches; his eyes follow the demo's progress dot (see EXTRAS.s6). */
    s6: {
      home: function (s) { return { x: 1720, y: lay(A(s, 'player')).y - 2, face: 'front', pose: 'sit', sprig: 'green' }; },
      play: function (s, tl) {
        var y = lay(A(s, 'player')).y - 2;
        var t = arrive(tl, 1720, y, 0.25, { face: 'front' });
        tl.add(K.sprigTo('green', 0.2), t);
        tl.add(K.poseTo('sit', 0.25), t + 0.05);
        tl.add(K.lookAt({ x: 1300, y: 500 }), t + 0.4);
      }
    },
    /* 07: the packet leaves at 0.6 and reaches each node at 0.6 + 0.36k (+0.3); signed log at 2.76.
       Kip carries it in the lane above the node row, drops down the gutter and runs onto the Pulse and
       Numbers box, right under the signed log, where he plants the wand upright and the pennant flies. */
    s7: {
      size: 0.9,
      lane: function (s) { return lay($$(s, '.node')[1]).y - 61; },             // 440: clear of the ask and sig labels
      num: function (s) { var n = $$(s, '.node'); return lay(n[n.length - 1].querySelector('rect')); }, // Pulse and Numbers
      home: function (s) { var b = M.s7.num(s); return { x: b.x + b.w - 46, y: b.y, face: 'l', pose: 'flag', sprig: 'green', size: 0.9 }; },
      play: function (s, tl) {
        var L = M.s7.lane(s), xs = [515, 735, 955, 1175, 1395, 1655];   // stage x = 120 + svg x (slides.js hit[])
        var hm = M.s7.home(s);
        if (K.away || Math.abs(K.st.x - 430) > 3 || Math.abs(K.st.y - L) > 3) tl.add(K.poof(430, L, 'r'), 0.1);
        tl.add(K.sprigTo('green', 0.15), 0.3);
        xs.forEach(function (x, k) { tl.add(K.runTo(x, { dur: 0.3, ease: 'power2.inOut', carry: true, keepCarry: true }), 0.6 + k * 0.36); });
        tl.add(K.sprigTo('teal', 0.12), 1.9);
        tl.add(K.sprigTo('green', 0.12), 2.3);
        tl.add(K.runTo(1850, { dur: 0.2 }), 2.76);
        tl.add(K.slideDown(hm.y), 2.98);
        tl.add(K.runTo(hm.x, { dur: 0.3, face: 'l' }), 3.55);
        tl.add(K.flag('green'), 3.95);
        tl.add(K.wide(true), 4.3);
        tl.add(K.lookAt({ x: 900, y: hm.y - 200 }), 4.3);
        tl.add(K.wide(false), 5.1);
        tl.add(K.lookAt(null), 5.2);
      }
    },
    /* 08: the stopwatch runs 0.2-1.8 with power1.out and stops on 10.7. Kip races it in the clear band
       under the timeline, skids under the green end dot as it lights, and holds still. */
    s8: {
      lane: function (s) { var c = lay(A(s, 'clicks')); return c.y + c.h + 136; },   // 762: clear of the caption, even mid-poof
      dot: function (s) { var d = $$(s, '[data-a="cdots"] circle'); return d.length ? lay(d[d.length - 1]) : { cx: 785, cy: 574 }; },
      home: function (s) { return { x: Math.round(M.s8.dot(s).cx), y: M.s8.lane(s), face: 'front', pose: 'tada', sprig: 'green' }; },
      play: function (s, tl) {
        var L = M.s8.lane(s), dx = M.s8.dot(s).cx;
        tl.add(K.poof(140, L, 'r'), 0);
        tl.add(K.sprigTo('green', 0.1), 0.05);
        tl.add(K.runTo(dx - 8, { dur: 1.6, ease: 'power1.out' }), 0.2);
        tl.add(K.skid(), 1.8);
        squash(tl, 1.8);
        tl.call(function () { var d = M.s8.dot(s); K.ringAt(d.cx, d.cy, 'green'); K.motes(d.cx, d.cy, 'green', 8); }, null, 1.82);
        tl.add(K.faceTo('front'), 2.05);
        tl.add(K.poseTo('tada', 0.22), 2.05);
      }
    },
    /* 09: dots sift 0.55-0.9, move 0.95-1.55, TAM draws at 1.3, the year-5 square lands at 2.05.
       Kip appears on the TAM's top edge, points at the square, then jumps down onto SAM's top edge. */
    s9: {
      target: function (s) { var c = lay(A(s, 'cv')); var SOM = Math.max(10, 520 * Math.sqrt(7.2 / 4070)); return { x: c.x + 860 - SOM / 2 - 30, y: c.y + 652 - SOM / 2 - 30 }; },
      sam: function (s) { var c = lay(A(s, 'cv')), S = 520 * Math.sqrt(1.85 / 4.07); return { x: c.x + 860 - 64, y: c.y + 652 - S - 1 }; },
      home: function (s) { var p = M.s9.sam(s); return { x: p.x, y: Math.round(p.y), face: 'r', pose: 'stand', sprig: 'green', point: M.s9.target(s) }; },
      play: function (s, tl) {
        var c = lay(A(s, 'cv')), top = c.y + 132, tg = M.s9.target(s), sp = M.s9.sam(s);
        if (!K.away) tl.add(K.vanish(), 0);
        tl.add(K.poof(1720, top, 'front'), 1.3);
        tl.add(K.sprigTo('teal', 0.2), 1.35);
        tl.add(K.lookAt({ x: 1540, y: 520 }), 1.6);
        tl.add(K.sprigTo('green', 0.15), 2.0);
        tl.add(K.pointAt(tg), 2.05);
        tl.add(K.jumpTo(sp.x, Math.round(sp.y), { face: 'r' }), 2.75);
        squash(tl, 3.25);
        tl.add(K.pointAt(tg), 3.6);
      }
    },
    /* 10: chips slide in 0.2-0.95, the empty quadrant lights at 1.0, the hub ring at 1.25.
       Kip pops into the lit quadrant's top-right corner and plants the Sprig there. */
    s10: {
      size: 0.85,
      spot: function (s) { var q = lay(A(s, 'quad')); return { x: q.x + q.w - 68, y: q.y + 19 }; },   // (880, 344)
      home: function (s) { var p = M.s10.spot(s); return { x: p.x, y: p.y, face: 'l', pose: 'flag', sprig: 'green', size: 0.85 }; },
      play: function (s, tl) {
        var p = M.s10.spot(s);
        if (!K.away) tl.add(K.vanish(), 0);
        tl.add(K.sprigTo('green', 0.01), 0.7);
        tl.add(K.poof(p.x, p.y, 'l'), 0.75);
        tl.add(K.flag('green'), 1.15);
        tl.call(function () { var hb = A(s, 'hub').querySelector('g'); if (!hb) return; var b = lay(hb); K.ringAt(b.cx, b.cy, 'green'); }, null, 1.3);
      }
    },
    /* 11: blocks sign at 0.4, 0.58, 0.76; heatmap wipes from 1.3; the lock line at 1.9.
       Kip stands in the slot right of #0414 and stamps each block as it signs. */
    s11: {
      spot: function (s) { var b = lay($$(s, '.blk').pop()); return { x: b.x + b.w + 68, y: b.y + b.h }; },   // (1750, 282)
      home: function (s) { var p = M.s11.spot(s); return { x: p.x, y: p.y, face: 'l', pose: 'stand', sprig: 'green' }; },
      play: function (s, tl) {
        var p = M.s11.spot(s);
        cut(tl);   // his s10 spot sits on this headline: no vanish puff there
        arrive(tl, p.x, p.y, 0, { face: 'l', dur: 0.36 });
        tl.add(K.sprigTo('green', 0.15), 0.3);
        var pulses = $$(s, '.blk').map(function (b) {
          var i = b.querySelector('.wow-pulse');
          if (!i) { i = doc.createElement('i'); i.className = 'wow-pulse'; i.setAttribute('aria-hidden', 'true'); b.appendChild(i); }
          return i;
        });
        [0.4, 0.58, 0.76].forEach(function (t, i) {
          tl.add(K.stamp('green'), t);
          if (pulses[i]) tl.fromTo(pulses[i], { opacity: 0 }, { opacity: 1, duration: 0.08, yoyo: true, repeat: 1, repeatDelay: 0.14, ease: 'power1.out' }, t + 0.14);
        });
        var hm = lay(A(s, 'heat'));
        tl.add(K.lookAt({ x: hm.cx, y: hm.cy }), 1.3);
        tl.add(K.lookAt(null), 2.0);
      }
    },
    /* 12: tiers rise from 0.3, the badge flips to TEAM at 1.0. A teammate (amber jacket, no wand) runs
       in from the right 0.15 s after Kip, for one high-five as the badge flips. */
    s12: {
      y: function (s) { return lay($$(s, '[data-a="tier"]')[1]).y; },
      mate: { scarf: 'amber', scale: 0.85, vars: { '--kip-vest': '#C98A2B', '--kip-vest-dark': '#A06E1F', '--kip-fur': '#DCCAB0', '--kip-knit': '#9C8466' } },
      home: function (s) { var y = M.s12.y(s); return { x: 1600, y: y, face: 'r', pose: 'happy', sprig: 'green', buddy: { x: 1664, y: y, face: 'l', pose: 'happy', sprig: 'off' } }; },
      play: function (s, tl) {
        var y = M.s12.y(s), bd = lay(A(s, 'badge'));
        if (!K.away) tl.add(K.vanish(), 0);
        tl.add(K.poof(1470, y, 'r'), 0.4);
        var b = K.buddy(M.s12.mate);
        b.at(1990, y, 'l'); b.away = true; b.sprig('off'); if (!still) b.life(true);
        tl.add(K.runTo(1600, { dur: 0.3 }), 0.62);
        tl.add(b.runTo(1664, { dash: true, face: 'l' }), 0.77);
        tl.add(K.sprigTo('green', 0.15), 0.85);
        tl.call(function () { K.motes(bd.cx, bd.cy, 'amber', 12); }, null, 1.0);
        // High five with the paws nearest each other; Kip's wand is tucked away for it.
        tl.to(K.parts.sprig, { autoAlpha: 0, duration: 0.08 }, 0.98);
        tl.add(K.armTo(-140, { duration: 0.12, ease: 'power2.out' }), 1.03);
        tl.to(b.parts.armR, { rotation: -140, duration: 0.12, ease: 'power2.out' }, 1.03);
        tl.to([K.parts.root, b.parts.root], { rotation: 6, duration: 0.08, yoyo: true, repeat: 1 }, 1.13);
        tl.call(function () { K.motes(1632, y - 82, 'amber', 8); }, null, 1.15);
        tl.add(K.armTo(0, { duration: 0.2 }), 1.3);
        tl.to(b.parts.armR, { rotation: 0, duration: 0.2 }, 1.3);
        tl.to(K.parts.sprig, { autoAlpha: 1, duration: 0.15 }, 1.4);
        tl.add(K.happy(true), 1.15);
        tl.add(b.happy(true), 1.15);
      }
    },
    /* 13: kept quiet. Commit bars grow from 1.0; he peeks in beside the graph, looks up at the tallest bar
       (Oct 6, 131) and gives a paw up. */
    s13: {
      home: function (s) { return { x: 1860, y: M.s13.y(s), face: 'l', pose: 'pawup', sprig: 'green' }; },
      y: function (s) { var c = lay(A(s, 'commits')); return c.y + c.h; },
      play: function (s, tl) {
        if (!K.away) tl.add(K.vanish(), 0);
        tl.add(K.sprigTo('green', 0.01), 0.2);
        tl.add(K.peek('r', M.s13.y(s), { x: 1860 }), 0.9);
        var bars = $$(A(s, 'commits'), '.b'), c = lay(A(s, 'commits'));
        if (bars[6]) { var bb = lay(bars[6]); tl.add(K.lookAt({ x: c.x + bb.cx, y: c.y + bb.y }), 1.6); }
        tl.to(K.parts.head, { rotation: 10, duration: 0.12, yoyo: true, repeat: 1 }, 1.25);
        tl.add(K.poseTo('pawup', 0.2), 1.8);
        tl.add(K.lookAt(null), 2.8);
      }
    },
    /* 14, the finale: milestones light at 1.2 + 0.4i. Kip hops milestone to milestone in the lane above
       the track, landing on each one as it lights (a small ring at the dot). At M4 a green sweep rings
       out from the dot, he runs to the cleared queue ("Needs you 0"), drops onto its corner, grows to
       hero size and throws both arms up as "Nobody waiting." lands at 3.5. No confetti. */
    s14: {
      spot: function (s) { return { x: 1812, y: lay(A(s, 'final')).y + 1 }; },   // one foot on the cleared queue's corner, clear of the M4 label
      home: function (s) { var p = M.s14.spot(s); return { x: p.x, y: p.y, face: 'front', pose: 'tada', sprig: 'green', size: HERO }; },
      play: function (s, tl) {
        var dots = $$(s, '.ms .m b').map(function (b) { return lay(b); });
        var xs = dots.length > 3 ? dots.map(function (d) { return d.cx; }) : [843, 1086, 1328, 1571];
        var dy = dots.length > 3 ? dots[0].cy : 180;
        var L = lay(A(s, 'ms')).y - 24, p = M.s14.spot(s);                 // 116: just above the milestone label
        if (!K.away) tl.add(K.vanish(), 0);
        tl.add(K.sprigTo('green', 0.01), 0.8);
        tl.add(K.poof(xs[0], L, 'r'), 0.85);
        [1.2, 1.6, 2.0, 2.4].forEach(function (t, i) {
          if (i) tl.add(K.jumpTo(xs[i], L, { dur: 0.3, face: 'r' }), t - 0.38);
          (function (x) { tl.call(function () { K.ringAt(x, dy, 'green'); }, null, t); })(xs[i]);
          squash(tl, t);
        });
        // M4: one green sweep from the dot
        tl.call(function () {
          var r = doc.createElement('i'); r.className = 'kip-fx ring sweep'; r.style.width = r.style.height = '160px'; r.style.color = 'var(--green)';
          var lyr = doc.getElementById('kip-layer'); if (!lyr) return; lyr.appendChild(r);
          gsap.fromTo(r, { x: xs[3] - 80, y: dy - 80, scale: 0, opacity: 0.5 }, { scale: 2.5, opacity: 0, duration: 0.9, ease: 'power2.out', onComplete: function () { r.remove(); } });
        }, null, 2.42);
        tl.add(K.runTo(p.x, { dur: 0.3 }), 2.6);
        tl.add(K.slideDown(p.y), 2.92);
        tl.add(K.faceTo('front'), 3.3);
        tl.add(K.sizeTo(HERO, 0.35, 'back.out(2)'), 3.3);
        var rows = $$(s, '[data-a="flist"] .q-row'), f = lay(A(s, 'flist'));
        if (rows.length) { var rb = lay(rows[rows.length - 1]); tl.add(K.lookAt({ x: f.x + rb.cx, y: f.y + rb.cy }), 3.3); }
        tl.add(K.lookAt(null), 3.5);
        tl.add(K.poseTo('tada', 0.25), 3.5);
        squash(tl, 3.5);
        tl.to(K.parts.glow, { scale: 1.4, duration: 0.18, yoyo: true, repeat: 1, ease: 'sine.inOut' }, 3.6);
      }
    },
    /* 15: appendix. Kip naps in the corner, fully in the right gutter; a click wakes him for a wave. */
    s15: {
      home: function () { return { x: 1862, y: 1008, face: 'l', pose: 'sleep', sprig: 'dim' }; },
      play: function (s, tl) {
        if (!K.away) tl.add(K.vanish(), 0);
        tl.add(K.poof(1862, 1008, 'l'), 0.3);
        tl.call(function () { K.pose('sleep'); K.sprig('dim'); }, null, 0.31);
        tl.add(K.sleep(), 0.34);
      }
    }
  };

  /* ---------- extras: on while a slide is in view, torn down on leave ---------- */
  var EX = {
    /* The queue panel leans toward the cursor, and eases flat again 1.2 s after the cursor stops or leaves,
       so the text is never left soft in 3D on a projector. Off on touch screens. */
    s1: { on: function (s) {
      if (window.matchMedia('(hover: none)').matches) return;
      var panel = A(s, 'panel'), pb = lay(panel);
      gsap.set(panel, { transformPerspective: 1600 });
      var rx = gsap.quickTo(panel, 'rotationX', { duration: 0.6, ease: 'power3' }), ry = gsap.quickTo(panel, 'rotationY', { duration: 0.6, ease: 'power3' });
      function flat() { rx(0); ry(0); }
      s._rest = gsap.delayedCall(1.2, flat).pause();
      s._flat = flat;
      doc.documentElement.addEventListener('mouseleave', flat);
      s._mv = function (p) { rx(clamp(-(p.y - pb.cy) / (pb.h / 2), -1, 1) * 3); ry(clamp((p.x - pb.cx) / (pb.w / 2), -1, 1) * 3); s._rest.restart(true); };
    }, off: function (s) {
      s._mv = null;
      if (s._rest) { s._rest.kill(); s._rest = null; }
      if (s._flat) { doc.documentElement.removeEventListener('mouseleave', s._flat); s._flat = null; }
      var panel = A(s, 'panel'); gsap.killTweensOf(panel); gsap.set(panel, { clearProps: 'transform' });
    } },
    /* A small parallax on the product shots that settles back 1.2 s after the cursor stops, so the
       screenshots' small UI text is still while people read it. Off on touch screens. */
    s5: { on: function (s) {
      if (window.matchMedia('(hover: none)').matches) return;
      var lap = A(s, 'laptop'), ph = A(s, 'phone'), p = { x: 0, y: 0 };
      function apply() { lap.style.translate = (p.x * 3) + 'px ' + (p.y * 3) + 'px'; ph.style.translate = (-p.x * 7) + 'px ' + (-p.y * 7) + 'px'; }
      var qx = gsap.quickTo(p, 'x', { duration: 0.8, ease: 'power3', onUpdate: apply }), qy = gsap.quickTo(p, 'y', { duration: 0.8, ease: 'power3', onUpdate: apply });
      s._rest = gsap.delayedCall(1.2, function () { qx(0); qy(0); }).pause();
      s._mv = function (c) { qx(clamp((c.x - 960) / 960, -1, 1)); qy(clamp((c.y - 540) / 540, -1, 1)); s._rest.restart(true); };
      s._p = p;
    }, off: function (s) { s._mv = null; if (s._rest) { s._rest.kill(); s._rest = null; } if (s._p) gsap.killTweensOf(s._p); A(s, 'laptop').style.translate = ''; A(s, 'phone').style.translate = ''; } },
    s6: { on: function (s) {
      var v = A(s, 'video'), last = 0;
      var cues = [
        [14, function () { gsap.timeline().add(K.ears(-4, -10, 0.12)).add(K.wide(true), 0).add(K.wide(false), 0.8); }],
        [34, function () { gsap.timeline().add(K.hop(14)).add(K.sprigTo('green', 0.15), 0); }],
        [46, function () { gsap.timeline().add(K.happy(true)).add(K.lookAt({ x: 1300, y: 500 }), 0); }],
        [54, function () { gsap.timeline().add(K.poseTo('sit', 0.25)).add(K.wave(1)); }]
      ];
      /* His eyes follow the demo's progress dot (the end of the progress bar under the player). */
      var bar = A(s, 'bar');
      s._tu = function () {
        var t = v.currentTime;
        if (t < last - 1) { last = t; return; }
        if (!busy()) {
          cues.forEach(function (c) { if (last < c[0] && t >= c[0]) c[1](); });
          if (!K.asleep && bar) { var r = bar.getBoundingClientRect(), p = K.toStage(r.right, r.top + r.height / 2); if (p) { K.lookAt(p); } }
        }
        last = t;
      };
      s._pz = function () { if (v.paused && !K.asleep) { K.lookAt(null); gsap.timeline().add(K.faceTo('front')).add(K.happy(true), 0); } };
      v.addEventListener('timeupdate', s._tu); v.addEventListener('pause', s._pz);
    }, off: function (s) { var v = A(s, 'video'); if (s._tu) v.removeEventListener('timeupdate', s._tu); if (s._pz) v.removeEventListener('pause', s._pz); } },
    s10: { on: function (s) {
      var hub = A(s, 'hub');
      s._ping = gsap.delayedCall(2, function () {
        var c = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('cx', 620); c.setAttribute('cy', 135); c.setAttribute('r', 40); c.setAttribute('fill', 'none');
        c.setAttribute('stroke', 'var(--green)'); c.setAttribute('stroke-width', 2); c.setAttribute('class', 'wow-ping');
        hub.insertBefore(c, hub.firstChild);
        s._pc = c;
        gsap.fromTo(c, { scale: 0.75, opacity: 0.8 }, { scale: 3.2, opacity: 0, duration: 1.1, ease: 'power2.out', repeat: 2, repeatDelay: 0.35, onComplete: function () { c.remove(); } });
      });
    }, off: function (s) { if (s._ping) s._ping.kill(); if (s._pc) { gsap.killTweensOf(s._pc); s._pc.remove(); s._pc = null; } } },
    s13: { on: function (s) { $$(s, '.person').forEach(function (p) { p.classList.add('wow-lift'); }); }, off: function () {} },
    s14: { on: function (s) {
      var amt = A(s, 'amt');
      s._in = function () { if (!busy()) K.wide(true); }; s._out = function () { K.wide(false); };
      amt.addEventListener('pointerenter', s._in); amt.addEventListener('pointerleave', s._out);
    }, off: function (s) { var amt = A(s, 'amt'); amt.removeEventListener('pointerenter', s._in); amt.removeEventListener('pointerleave', s._out); } }
  };

  /* ---------- driving ---------- */
  function busy() { return !!(ktl && ktl.isActive()); }
  function homeSpec(i) { var s = slides[i], m = M[s.id]; if (window.__deck) window.__deck.tl(i); /* the slide's builder makes some anchors */ return m ? m.home(s) : { x: 1860, y: LANE, face: 'front', pose: 'stand', sprig: 'rose' }; }
  function applyHome(i) {
    var h = homeSpec(i);
    K.stop();
    K.dropBuddies();
    K.setSize(h.size || 1);
    K.at(h.x, h.y, h.face || 'front');
    K.away = false;
    K.pose(h.pose || 'stand');
    K.sprig(h.sprig || 'rose');
    var was = K.static; K.static = true;
    if (h.point) K.pointAt({ x: h.point.cx !== undefined ? h.point.cx : h.point.x, y: h.point.cy !== undefined ? h.point.cy : h.point.y });
    if (h.look) { K.lookAt({ x: h.look.cx, y: h.look.cy }); K.wide(true); }
    if (h.pose === 'sleep') K.sleep();
    K.static = was;
    if (h.pose === 'sleep' && !was) K.sleep();
    if (h.buddy) {
      var b = K.buddy(M.s12.mate), bh = h.buddy;
      b.at(bh.x, bh.y, bh.face); b.away = false; b.pose(bh.pose); b.sprig(bh.sprig);
      if (!was) b.life(true);
    }
    return h;
  }
  function build(i) {
    var s = slides[i], m = M[s.id];
    if (window.__deck) window.__deck.tl(i);
    if (ktl) { ktl.kill(); ktl = null; }
    K.stop();
    if (s.id !== 's12') K.dropBuddies();
    var tl = gsap.timeline({ paused: true });
    /* Hero size on s1 (s14 grows him itself, at the end of its moment); 96 px everywhere else. */
    var S = (m && m.size) || 1;
    if (Math.abs(K.curSize() - S) > 0.01 || K.st.size !== S) { if (K.away) K.setSize(S); else tl.add(K.sizeTo(S, 0.25), 0); }
    /* Continuity: on a forward step he runs out to the right and in from the left (zip, not a puff). */
    K.travel = travel;
    try { if (m) m.play(s, tl); } finally { K.travel = 0; }
    return tl;
  }
  var travel = 0;
  function enter(i, back) {
    cur = i;
    var s = slides[i];
    if (still || back) { if (ktl) { ktl.kill(); ktl = null; } applyHome(i); }
    else { travel = lastIdx > -1 && i > lastIdx ? 1 : 0; ktl = build(i); travel = 0; ktl.play(0); K.pulse(); }
    lastIdx = i;
    if (!still && EX[s.id]) EX[s.id].on(s);
    idleReset();
  }
  slides.forEach(function (s, i) {
    s.addEventListener('slide:enter', function (e) { enter(i, !!(e.detail && e.detail.back)); });
    s.addEventListener('slide:leave', function () { if (EX[s.id] && !still) EX[s.id].off(s); if (s.id === 's12') { K.buddies().forEach(function (b) { gsap.timeline().add(b.vanish()); }); setTimeout(function () { if (slides[cur] && slides[cur].id !== 's12') K.dropBuddies(); }, 250); } });
    s.addEventListener('slide:replay', function () { if (still) return; if (EX[s.id]) { EX[s.id].off(s); EX[s.id].on(s); } ktl = build(i); ktl.play(0); });
  });

  /* ---------- interaction ---------- */
  var reactN = 0;
  K.el.addEventListener('mousedown', function (e) { e.preventDefault(); });
  K.el.addEventListener('pointerenter', function () {
    if (still || busy() || K.asleep) return;
    gsap.timeline().add(K.ears(-4, -8, 0.15)).add(K.lookAt(null), 0);
    gsap.to(K.parts.glow, { scale: 1.3, duration: 0.2 });
  });
  K.el.addEventListener('pointerleave', function () {
    if (still) return;
    gsap.to(K.parts.glow, { scale: 1, duration: 0.25 });
    if (!busy() && !K.asleep) K.ears(0, 0, 0.2);
  });
  K.el.addEventListener('click', function (e) {
    e.stopPropagation(); e.preventDefault();
    idleReset();
    if (still) { K.happy(!K._happy); K._happy = !K._happy; return; }
    if (busy()) { K.flick(); return; }
    var s = slides[cur];
    if (K.asleep) {
      var tl = gsap.timeline();
      tl.add(K.wake()).add(K.wave(2)).add(K.happy(true));
      if (s && s.id === 's15') tl.call(function () { if (slides[cur] && slides[cur].id === 's15' && !busy()) K.sleep(); }, null, '+=6');
      ktl = tl;
      return;
    }
    var r = reactN++ % 4;
    if (r === 0) K.wave(2);
    else if (r === 1) { K.hop(K.st.y < 140 ? 8 : 22); K.burst('multi', 8); }
    else if (r === 2) K.twirl();
    else { K.picto('heart', 0.9); K.happy(true); gsap.delayedCall(1, function () { if (!busy()) K.happy(false); }); }
  });

  function zoomies() {
    if (still || cur < 0) return;
    if (ktl) ktl.kill();
    K.stop(); K.dropBuddies();
    var h = homeSpec(cur), tl = gsap.timeline();
    if (Math.abs(K.curSize() - 1) > 0.01) tl.add(K.sizeTo(1, 0.2));
    if (Math.abs(K.st.y - LANE) > 3) tl.add(K.poof(K.st.x < 960 ? 200 : 1700, LANE, 'r'));
    tl.add(K.runTo(K.st.x > 960 ? 160 : 1760, { dash: true }));
    tl.add(K.runTo(1860, { dash: true }));
    tl.add(K.slideDown(720));
    tl.add(K.vanish());
    tl.add(K.peek('r', 720, {}), '+=0.3');
    tl.add(K.wave(1));
    tl.add(K.poof(h.x, h.y, h.face || 'front'));
    tl.call(function () { applyHome(cur); });
    ktl = tl;
  }

  K.zoomies = zoomies;

  /* One pointermove for everything that follows the cursor. */
  window.addEventListener('pointermove', function (e) {
    idleReset();
    var p = K.toStage(e.clientX, e.clientY); if (!p) return;
    if (!still) K.follow(p.x, p.y);
    var s = slides[cur]; if (s && s._mv) s._mv(p);
  }, { passive: true });

  doc.addEventListener('keydown', function (e) {
    idleReset();
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var help = doc.querySelector('.help');
    if (help && help.classList.contains('open')) return;
    if ((e.key === 'k' || e.key === 'K') && !e.repeat) zoomies();
  });

  /* Idle: after 2 minutes with no input he sits and dozes; any input wakes him. Never in fullscreen,
     where a presenter may talk over one slide for a long time. Input only stamps a time (no timer churn);
     one repeating check every 5 s does the rest. */
  var IDLE = 120000, lastInput = performance.now();
  function idleReset() {
    if (still) return;
    lastInput = performance.now();
    if (K.asleep && slides[cur] && slides[cur].id !== 's15' && !busy()) K.wake();
  }
  function idleCheck() {
    gsap.delayedCall(5, idleCheck);
    var s = slides[cur];
    /* Presenting (Fullscreen API, F11 or kiosk: the window fills the screen): never doze. */
    var presenting = doc.fullscreenElement || window.innerHeight >= screen.height - 2 || (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches);
    if (still || presenting || performance.now() - lastInput < IDLE) return;
    if (!s || busy() || K.asleep || K.away) return;
    if (s.id === 's6') { var v = A(s, 'video'); if (v && !v.paused) return; }
    gsap.timeline().add(K.poseTo('sit', 0.4)).add(K.sleep(), '+=0.4');
  }
  if (!still) gsap.delayedCall(5, idleCheck);
  ['wheel', 'touchstart'].forEach(function (ev) { window.addEventListener(ev, idleReset, { passive: true }); });

  /* The help card lists the K key while Kip is on. */
  var dl = doc.querySelector('.help dl');
  if (dl && !still) dl.insertAdjacentHTML('beforeend', '<dt>K</dt><dd>Kip does a lap</dd>');

  /* For scripts/kip-check.mjs: build a slide's moment paused (arriving from the slide before), or set its home. */
  window.__wow = {
    build: function (i) {
      var was = K.static; K.static = false;
      if (i > 0) applyHome(i - 1); else { K.stop(); K.at(2010, LANE, 'l'); K.away = true; }
      travel = i > 0 ? 1 : 0;
      var tl = build(i);
      travel = 0;
      K.static = was;
      ktl = tl;
      return tl;
    },
    home: function (i) { return applyHome(i); },
    box: function () { var out = [K.box()]; K.buddies().forEach(function (b) { out.push(b.box()); }); return out.filter(Boolean); },
    get current() { return cur; }
  };
})();
