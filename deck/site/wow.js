/* === WOW: Kip's few moments, plus small extras ===
   Kip lives on #kip-layer above the slides. He appears only where a moment earns him: the cover (s1),
   the merge in the demo (s6, cued by the video), the ask (s14) and the appendix nap (s15). On every
   other slide he is off stage, so nothing competes with the one point the slide makes.
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
      /* He arrives with the queue panel (on phones it rises at 0.25 on this slide's timeline, see B.s14). */
      if (b14 && !reduced) {
        gsap.set(b14, { autoAlpha: 0 });
        s14.addEventListener('slide:enter', function () { gsap.to(b14, { autoAlpha: 1, duration: 0.3, delay: 0.5 }); });
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
       skid with a squash and stretch, settle to hero size and wave: 3 agents need you. */
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
        var top = rows[3] && lay(rows[3]);                         // the OpenCode row, the oldest wait, top of the queue once sorted
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
    /* 14, the finale: milestones light at 1.2 + 0.4i. Kip hops milestone to milestone in the lane above
       the track, landing on each one as it lights (a small ring at the dot). At M4 a green sweep rings
       out from the dot, he runs to the cleared queue ("Needs you 0"), drops onto its corner, grows to
       hero size and throws both arms up as the last merge lands (3.5; "Nobody waiting." follows). No confetti. */
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
    /* 06, the merge: off stage while the demo plays, then at the Ship beat (the merge in the recording)
       he pops onto the player's top edge, gives one hop and a green burst, and leaves again after a few
       seconds. The cue time is the Ship beat's own data-t in index.html. */
    s6: { on: function (s) {
      var v = A(s, 'video'), ship = s.querySelector('[data-beat="ship"]'), at = ship ? +ship.dataset.t : 27.4, last = 0;
      s._tu = function () {
        var t = v.currentTime;
        if (t < last - 1) { last = t; return; }
        if (last < at && t >= at && !busy()) {
          var y = lay(A(s, 'player')).y - 2, tl = gsap.timeline();
          tl.add(K.poof(1720, y, 'front'));
          tl.add(K.sprigTo('green', 0.15), 0.2);
          tl.add(K.hop(14), 0.3);
          tl.call(function () { K.burst('green', 10); }, null, 0.45);
          tl.add(K.happy(true), 0.45);
          tl.add(K.vanish(), 3.4);
          ktl = tl;
        }
        last = t;
      };
      v.addEventListener('timeupdate', s._tu);
    }, off: function (s) { var v = A(s, 'video'); if (s._tu) v.removeEventListener('timeupdate', s._tu); } },
    s13: { on: function (s) { $$(s, '.person').forEach(function (p) { p.classList.add('wow-lift'); }); }, off: function () {} },
    s14: { on: function (s) {
      var amt = A(s, 'amt');
      s._in = function () { if (!busy()) K.wide(true); }; s._out = function () { K.wide(false); };
      amt.addEventListener('pointerenter', s._in); amt.addEventListener('pointerleave', s._out);
    }, off: function (s) { var amt = A(s, 'amt'); amt.removeEventListener('pointerenter', s._in); amt.removeEventListener('pointerleave', s._out); } }
  };

  /* ---------- driving ---------- */
  function busy() { return !!(ktl && ktl.isActive()); }
  function homeSpec(i) { var s = slides[i], m = M[s.id]; if (window.__deck) window.__deck.tl(i); /* the slide's builder makes some anchors */ return m ? m.home(s) : null; }
  /* Off stage: no puff, just gone (slides without a moment). */
  function offStage() { K.stop(); K.dropBuddies(); K.at(2010, LANE, 'l'); K.away = true; gsap.set(K.el, { autoAlpha: 0 }); }
  function applyHome(i) {
    var h = homeSpec(i);
    if (!h) { offStage(); return null; }
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
    return h;
  }
  function build(i) {
    var s = slides[i], m = M[s.id];
    if (window.__deck) window.__deck.tl(i);
    if (ktl) { ktl.kill(); ktl = null; }
    K.stop();
    K.dropBuddies();
    var tl = gsap.timeline({ paused: true });
    if (!m) { var v = K.vanish(); tl.add(v, 0); tl.call(offStage, null, v.duration() + 0.01); return tl; }   // no moment here: he leaves (forward: runs off right)
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
    s.addEventListener('slide:leave', function () { if (EX[s.id] && !still) EX[s.id].off(s); });
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
    if (!h) return;   // he is off stage on this slide
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
    /* Which slides have a scripted moment (and so a home spot). s6's merge is cued by its video instead. */
    has: function (i) { return !!M[slides[i].id]; },
    get current() { return cur; }
  };
})();
