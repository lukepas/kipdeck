/* === PER-SLIDE MOTION ===
   One builder per slide. Each returns a paused GSAP timeline whose final frame is the slide's resting state.
   Rule: motion explains state change. Rows enter 24 px up with a fade, attention pulses, resolution snaps.
   State that depends on time (timers, pills, counters) is derived from a proxy tween's onUpdate,
   so jumping to any time (screenshots, print, reduced motion) renders the right frame. */
(function () {
  'use strict';
  var E = 'power3.out';
  function A(s, n) { return s.querySelector('[data-a="' + n + '"]'); }
  function AA(s, n) { return Array.prototype.slice.call(s.querySelectorAll('[data-a="' + n + '"]')); }
  function $$(s, sel) { return Array.prototype.slice.call(s.querySelectorAll(sel)); }
  function rise(tl, els, at, o) {
    if (!els || (els.length === 0)) return;
    var v = { y: 24, autoAlpha: 0, duration: 0.32, ease: E, stagger: 0.07 };
    if (o) for (var k in o) v[k] = o[k];
    tl.from(els, v, at);
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function mmss(sec) { sec = Math.max(0, Math.round(sec)); return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0'); }
  function fmt(v, dec) { return Number(v).toLocaleString('en-US', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 }); }
  /* A proxy clock: calls fn(seconds) for every rendered frame between `at` and `at + dur`. */
  function clock(tl, at, dur, fn) {
    var p = { t: 0 };
    fn(0);
    tl.to(p, { t: dur, duration: dur, ease: 'none', onUpdate: function () { fn(p.t); } }, at);
    return p;
  }
  function counter(tl, el, from, to, at, dur, dec, suffix) {
    var p = { v: from };
    suffix = suffix || '';
    tl.fromTo(p, { v: from }, { v: to, duration: dur, ease: 'power2.out', onUpdate: function () { el.textContent = fmt(p.v, dec) + suffix; } }, at);
  }
  /* Typed text: reveal characters left to right. */
  function typeText(tl, el, text, at, dur) {
    var p = { n: 0 };
    tl.fromTo(p, { n: 0 }, { n: text.length, duration: dur, ease: 'none', onUpdate: function () { el.textContent = text.slice(0, Math.round(p.n)); } }, at);
  }
  /* Scramble then resolve: "text resolves from noise". */
  function scramble(tl, el, text, at, dur) {
    var chars = '#%&*+=<>?/\\|01';
    var p = { k: 0 };
    tl.fromTo(p, { k: 0 }, { k: 1, duration: dur, ease: 'none', onUpdate: function () {
      var keep = Math.floor(p.k * text.length), out = '';
      for (var i = 0; i < text.length; i++) out += i < keep || text[i] === ' ' ? text[i] : chars[(i * 7 + Math.floor(p.k * 40)) % chars.length];
      el.textContent = p.k >= 1 ? text : out;
    } }, at);
  }

  var B = {};

  /* ---------- 01 TITLE: cold open, eight agents ping, the queue snaps into one ranked list ---------- */
  B.s1 = function (s, gsap) {
    var rows = [
      ['CC', 'Add rate limiting to /api/login', 'Claude Code'],
      ['Cx', 'Fix the flaky checkout test', 'Codex'],
      ['Cu', 'Write the README quickstart', 'Cursor'],
      ['Oc', 'Upgrade the payment SDK to v5', 'OpenCode'],
      ['Pi', 'Port the settings page to the form kit', 'Pi'],
      ['Gk', 'Split the orders service tests', 'Grok'],
      ['Mu', 'Bump the Node image to 22', 'Muse'],
      ['Ds', 'Rename the billing env vars', 'DeepSeek Harness']
    ];
    var list = A(s, 'list');
    list.innerHTML = '';
    var els = rows.map(function (r) {
      var d = document.createElement('div');
      d.className = 'q-row';
      d.innerHTML = '<span class="av">' + r[0] + '</span><span class="ttl">' + r[1] + '<small>' + r[2] + '</small></span><span class="pill cyan"><i class="dot"></i><b>working</b></span><span class="tm">--:--</span>';
      list.appendChild(d);
      return d;
    });
    var rowH = els[0].offsetHeight || 72;
    els.forEach(function (d, i) { gsap.set(d, { y: i * rowH }); });
    list.style.height = (rows.length * rowH) + 'px';
    var order = [3, 0, 6, 1, 7, 2, 5, 4];       // the order agents start asking
    var flipAt = {}; order.forEach(function (r, k) { flipAt[r] = 1.0 + k * 0.12; });
    var FREEZE = 2.0, SPEED = 600;              // 1 s of animation shows as 10 min of waiting

    var tl = gsap.timeline({ paused: true });
    var panel = A(s, 'panel');
    tl.set([A(s, 'wm'), A(s, 'h'), A(s, 'sub'), A(s, 'meta'), A(s, 'founders'), A(s, 'qhead')], { autoAlpha: 0 }, 0);
    tl.fromTo(A(s, 'term'), { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.15 }, 0.55);
    tl.from(els, { autoAlpha: 0, x: -16, duration: 0.26, ease: 'power2.out', stagger: 0.07 }, 0.45);
    tl.from($$(s, '.q-row .ttl'), { clipPath: 'inset(0 100% 0 0)', duration: 0.3, ease: 'none', stagger: 0.07 }, 0.45);

    clock(tl, 0, 2.9, function (t) {
      panel.classList.toggle('bare', t < FREEZE);
      els.forEach(function (d, i) {
        var pill = d.children[2], tm = d.children[3];
        var asking = t >= flipAt[i];
        if (asking !== d._asking) {
          d._asking = asking;
          pill.className = 'pill ' + (asking ? 'pink' : 'cyan');
          pill.lastChild.textContent = asking ? 'needs you' : 'working';
          d.classList.toggle('hot', asking);
        }
        tm.textContent = asking ? mmss((Math.min(t, FREEZE) - flipAt[i]) * SPEED) : '--:--';
        var settled = t >= FREEZE + 0.3;
        var top = order[0] === i;
        pill.classList.toggle('pulse', settled && top);
        pill.style.opacity = settled && !top ? 0.55 : 1;
        d.style.background = settled && top ? 'var(--pink-a)' : '';
      });
    });
    // The snap: rows reorder by wait (FLIP to their ranked slot) and the chrome arrives.
    order.forEach(function (r, rank) { tl.to(els[r], { y: rank * rowH, duration: 0.5, ease: 'power3.inOut' }, FREEZE); });
    tl.to(A(s, 'qhead'), { autoAlpha: 1, duration: 0.25 }, FREEZE + 0.1);
    // The headline lands first (0.2 s); the queue keeps animating beside it.
    tl.fromTo(A(s, 'h'), { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.32, ease: E }, 0.15);
    tl.fromTo([A(s, 'wm'), A(s, 'sub')], { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.32, ease: E, stagger: 0.08 }, 0.3);
    tl.fromTo([A(s, 'meta'), A(s, 'founders')], { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.35, stagger: 0.1 }, 0.55);
    return tl;
  };

  /* ---------- 02 PROBLEM: the clock sweeps 23 minutes, then the Faros gap opens ---------- */
  B.s2 = function (s, gsap) {
    var svg = A(s, 'clock'), ticks = A(s, 'ticks');
    ticks.innerHTML = '';
    for (var i = 0; i < 12; i++) {
      var a = i * Math.PI / 6, r1 = 124, r2 = i % 3 ? 116 : 106;
      ticks.insertAdjacentHTML('beforeend', '<line x1="' + (150 + r1 * Math.sin(a)) + '" y1="' + (150 - r1 * Math.cos(a)) + '" x2="' + (150 + r2 * Math.sin(a)) + '" y2="' + (150 - r2 * Math.cos(a)) + '" stroke="var(--muted)" stroke-width="' + (i % 3 ? 2 : 4) + '"/>');
    }
    var lbl = svg.querySelector('.idle-l');
    if (!lbl) { svg.insertAdjacentHTML('beforeend', '<text class="idle-l" x="150" y="338" text-anchor="middle" style="font:700 30px var(--mono); fill:var(--pink)"></text><text x="150" y="368" text-anchor="middle" style="font:500 13px var(--mono); fill:var(--muted); letter-spacing:.08em">IDLE, BLOCKED</text>'); lbl = svg.querySelector('.idle-l'); }
    var mh = A(s, 'mh'), hh = A(s, 'hh'), arc = A(s, 'arc');
    function setClock(m) {
      mh.setAttribute('transform', 'rotate(' + (m * 6) + ' 150 150)');
      hh.setAttribute('transform', 'rotate(' + (300 + m * 0.5) + ' 150 150)');
      var a0 = 2 * 6 * Math.PI / 180, a1 = m * 6 * Math.PI / 180, R = 136;
      var large = (a1 - a0) > Math.PI ? 1 : 0;
      arc.setAttribute('d', m <= 2.01 ? '' : 'M150 150 L' + (150 + R * Math.sin(a0)) + ' ' + (150 - R * Math.cos(a0)) + ' A' + R + ' ' + R + ' 0 ' + large + ' 1 ' + (150 + R * Math.sin(a1)) + ' ' + (150 - R * Math.cos(a1)) + ' Z');
      lbl.textContent = '10:' + String(Math.floor(m)).padStart(2, '0') + '  +' + Math.max(0, Math.floor(m) - 2) + ' min';
    }
    var tl = gsap.timeline({ paused: true });
    // Problem slide: the line hard-cuts in, no fade.
    rise(tl, [A(s, 'k')], 0, { duration: 0.2 });
    tl.from(A(s, 'qnote'), { autoAlpha: 0, duration: 0.3 }, 1.9);
    tl.from(svg, { autoAlpha: 0, scale: 0.9, duration: 0.4, ease: E, transformOrigin: '50% 50%' }, 0.1);
    clock(tl, 0.3, 1.6, function (t) { setClock(2 + 23 * gsap.parseEase('power2.inOut')(clamp(t / 1.6, 0, 1))); });
    tl.from(A(s, 'b1'), { attr: { width: 0 }, duration: 0.7, ease: 'power3.out' }, 1.7);
    tl.from(A(s, 'b2'), { attr: { width: 0 }, duration: 0.7, ease: 'power3.out' }, 1.85);
    tl.from(A(s, 'b3'), { attr: { width: 0 }, duration: 0.35, ease: 'power4.out' }, 2.0);
    tl.fromTo(A(s, 'faros'), { y: 0 }, { y: 5, duration: 0.06, yoyo: true, repeat: 1, ease: 'power1.inOut' }, 2.33); // the thud
    tl.from([A(s, 'v1'), A(s, 'v2'), A(s, 'v3')], { autoAlpha: 0, duration: 0.2, stagger: 0.08 }, 2.25);
    tl.from(A(s, 'gap'), { attr: { width: 0 }, duration: 0.6, ease: 'power2.inOut' }, 2.45);
    tl.from(A(s, 'gapl'), { autoAlpha: 0, duration: 0.3 }, 2.9);
    rise(tl, [A(s, 't1'), A(s, 't2')], 2.6, { stagger: 0.12 });
    return tl;
  };

  /* ---------- 03 MULTI-TOOL: four queues fill, a cursor alt-tabs, the oldest ask sits unseen ---------- */
  B.s3 = function (s, gsap) {
    var asks = [
      ['run the migration now?', 'keep both test files?', 'which branch is base?'],
      ['update the snapshot or fix the selector?', 'which env var holds the key?', 'retry the build?'],
      ['delete the old settings page?', 'pin the SDK version?'],
      ['OK to drop the legacy column?', 'retry the flaky deploy?']
    ];
    var wins = $$(s, '.win');
    var items = [];
    wins.forEach(function (w, i) {
      var ul = w.querySelector('ul'); ul.innerHTML = '';
      asks[i].forEach(function (q) { var li = document.createElement('li'); li.innerHTML = '<b>?</b> ' + q; ul.appendChild(li); items.push({ li: li, w: i }); });
    });
    // Arrival order across windows; the OpenCode ask arrives first and is never looked at.
    var arrival = [9, 0, 3, 7, 1, 4, 8, 2, 5, 6, 10].filter(function (k) { return k < items.length; });
    var wrap = A(s, 'wins'), focus = A(s, 'focus');
    function rectOf(i) { var w = wins[i]; return { x: w.offsetLeft - 4, y: w.offsetTop - 4, width: w.offsetWidth + 8, height: w.offsetHeight + 8 }; }
    var tl = gsap.timeline({ paused: true });
    rise(tl, [A(s, 'k')], 0);
    tl.from(A(s, 'hero'), { autoAlpha: 0, y: 30, duration: 0.4, ease: E }, 0.05);
    counter(tl, A(s, 'n70'), 0, 70, 0.1, 1.0);
    rise(tl, [A(s, 'lead')], 0.4);
    rise(tl, wins, 0.15, { stagger: 0.06 });
    arrival.forEach(function (k, n) { tl.from(items[k].li, { autoAlpha: 0, x: 12, duration: 0.18, ease: E }, 0.5 + n * 0.14); });
    clock(tl, 0, 4.2, function (t) {
      var counts = [0, 0, 0, 0];
      arrival.forEach(function (k, n) { if (t >= 0.5 + n * 0.14) counts[items[k].w]++; });
      wins.forEach(function (w, i) { w.querySelector('[data-badge]').textContent = counts[i]; });
      var startWait = 38 * 60 + 10;
      A(s, 'wait').textContent = mmss(startWait + clamp(t - 0.5, 0, 3.7) * 48);
    });
    // Frantic alt-tab: hard cuts between the three windows people look at. Never the fourth.
    var seq = [0, 1, 2, 0, 2, 1];
    tl.set(focus, { autoAlpha: 0 }, 0);
    seq.forEach(function (w, n) { tl.set(focus, Object.assign({ autoAlpha: 1, borderColor: 'rgba(244,246,250,.9)' }, rectOf(w)), 1.0 + n * 0.24); });
    // Hard cut to silence: the far window, timer still running.
    var cut = 1.0 + seq.length * 0.24 + 0.1;
    tl.set(wins.slice(0, 3), { opacity: 0.32 }, cut);
    tl.set(focus, Object.assign({ borderColor: '#FF2E63', boxShadow: '0 0 0 6px rgba(255,46,99,.18)' }, rectOf(3)), cut);
    tl.from(A(s, 'wait'), { autoAlpha: 0, scale: 1.3, duration: 0.25, ease: 'back.out(2)' }, cut);
    rise(tl, [A(s, 'pain')], cut + 0.2);
    rise(tl, [A(s, 'e1'), A(s, 'e2'), A(s, 'e3')], cut + 0.4, { stagger: 0.1 });
    tl.to({}, { duration: 0.6 }, cut + 0.6);
    return tl;
  };

  /* ---------- 04 WHY NOW: the run-rate climbs, the vendors stack, the rounds drop in ---------- */
  B.s4 = function (s, gsap) {
    var tl = gsap.timeline({ paused: true });
    rise(tl, [A(s, 'k'), A(s, 'h'), A(s, 'p')], 0);
    tl.from(A(s, 'axis'), { autoAlpha: 0, duration: 0.3 }, 0.1);
    tl.from(A(s, 'r1'), { attr: { y: 480, height: 0 }, duration: 0.4, ease: E }, 0.3);
    tl.from(A(s, 'l1'), { autoAlpha: 0, duration: 0.2 }, 0.6);
    tl.from(A(s, 'r2'), { attr: { y: 480, height: 0 }, duration: 0.8, ease: 'expo.out' }, 0.7);
    tl.from(A(s, 'ln'), { autoAlpha: 0, duration: 0.3 }, 0.9);
    tl.from(A(s, 'l2'), { autoAlpha: 0, y: 10, duration: 0.25 }, 1.2);
    tl.from(A(s, 'x5'), { autoAlpha: 0, scale: 1.8, transformOrigin: '50% 50%', duration: 0.3, ease: 'back.out(2)' }, 1.35);
    tl.from(A(s, 'sk1'), { attr: { y: 480, height: 0 }, duration: 0.45, ease: E }, 1.6);
    tl.from(A(s, 'sk2'), { attr: { y: 290, height: 0 }, duration: 0.4, ease: E }, 1.9);
    tl.from(A(s, 'sk3'), { attr: { y: 138, height: 0 }, duration: 0.35, ease: E }, 2.15);
    tl.from($$(A(s, 'stack'), 'text'), { autoAlpha: 0, duration: 0.2, stagger: 0.1 }, 2.0);
    tl.from(A(s, 'tot'), { autoAlpha: 0, y: 12, duration: 0.35, ease: 'back.out(2)' }, 2.45);
    rise(tl, [A(s, 'f1'), A(s, 'f2')], 1.0, { stagger: 0.12 });
    tl.from(A(s, 'tll'), { autoAlpha: 0, duration: 0.3 }, 2.6);
    rise(tl, [A(s, 'c1'), A(s, 'c2'), A(s, 'c3')], 2.7, { y: 16, duration: 0.35, stagger: 0.12 });
    return tl;
  };

  /* ---------- 05 PRODUCT: four verbs, each wiping to the real screen ---------- */
  B.s5 = function (s, gsap) {
    var steps = $$(s, '.step'), shots = $$(s, '[data-shot]'), pshots = $$(s, '[data-pshot]');
    var beats = [0.5, 1.25, 2.0, 2.75];
    var tl = gsap.timeline({ paused: true });
    rise(tl, [A(s, 'k'), A(s, 'h')], 0);
    tl.from(A(s, 'laptop'), { autoAlpha: 0, y: 40, duration: 0.45, ease: E }, 0.15);
    tl.from(A(s, 'phone'), { autoAlpha: 0, y: 80, duration: 0.5, ease: E }, beats[1]);
    steps.forEach(function (st, i) {
      tl.from(st, { autoAlpha: 0, y: 24, duration: 0.3, ease: E }, beats[i] - 0.1);
      tl.fromTo(st.querySelector('.v'), { scale: 1.35, transformOrigin: '0% 50%' }, { scale: 1, duration: 0.3, ease: 'back.out(2.5)' }, beats[i]);
      if (shots[i] && i > 0) tl.fromTo(shots[i], { clipPath: 'inset(0 0 0 100%)' }, { clipPath: 'inset(0 0 0 0%)', duration: 0.4, ease: 'power3.inOut' }, beats[i]);
    });
    pshots.forEach(function (p) { var k = +p.dataset.pshot; if (k > 1) tl.fromTo(p, { clipPath: 'inset(0 0 0 100%)' }, { clipPath: 'inset(0 0 0 0%)', duration: 0.4, ease: 'power3.inOut' }, beats[k] + 0.05); });
    clock(tl, 0, 3.6, function (t) { steps.forEach(function (st, i) { st.classList.toggle('on', t >= beats[i]); }); });
    var sig = A(s, 'sig');
    tl.from(sig, { autoAlpha: 0, duration: 0.15 }, beats[3] + 0.4);
    typeText(tl, sig, 'signed: agent / model / reviewer / wait', beats[3] + 0.4, 0.5);
    tl.fromTo(sig, { scale: 1.04 }, { scale: 1, duration: 0.12 }, beats[3] + 0.95);
    return tl;
  };

  /* ---------- 06 DEMO: the laptop zooms in, the recording plays with narration and step markers ---------- */
  B.s6 = function (s, gsap) {
    var video = A(s, 'video'), cap = A(s, 'cap'), bar = A(s, 'bar'), mks = $$(s, '.mk');
    var lines = [
      [0, "Engineers now run several coding agents at once. The bottleneck isn't the agents: it's how long they sit waiting on you."],
      [5, 'One command, in your repository. No account, no Kipdeck cloud.'],
      [10, "Every vendor's agent in one list, each on its own branch."],
      [14, 'Codex is blocked. It goes to the top and its question opens in plain words.'],
      [20, "One box. No hunting through terminals. And the top bar counts who's waiting on you."],
      [27, 'Claude Code finished: three files, tests pass. The real diff, beside the list.'],
      [34, 'Merged, without GitHub if you want. Every merge is a signed record: agent, model, reviewer, wait.'],
      [40, 'Same inbox on your phone.'],
      [46, "Nothing waits on you. And here's the number we sell on: human wait time, per agent and model."],
      [54, 'Free and open source for one engineer. Teams pay for the shared inbox, routing, SSO and audit.']
    ];
    function sync(t) {
      var line = lines[0][1];
      lines.forEach(function (l) { if (t >= l[0]) line = l[1]; });
      if (cap.textContent !== line) cap.textContent = line;
      bar.style.width = (t / 60 * 100) + '%';
      mks.forEach(function (m) { m.classList.toggle('on', t >= +m.dataset.mk); });
    }
    if (!s._wired) {
      s._wired = true;
      video.addEventListener('timeupdate', function () { sync(video.currentTime); });
      video.addEventListener('ended', function () { sync(60); });
      s.addEventListener('slide:enter', function () {
        if (document.body.classList.contains('print')) return;
        video.preload = 'auto';
        try { video.currentTime = 0; } catch (e) { /* not loaded yet */ }
        var p = video.play(); if (p && p.catch) p.catch(function () {});
      });
      s.addEventListener('slide:leave', function () { video.pause(); });
      A(s, 'player').addEventListener('click', function () { if (video.paused) video.play(); else video.pause(); });
    }
    sync(0);
    var tl = gsap.timeline({ paused: true });
    rise(tl, [A(s, 'k'), A(s, 'h'), A(s, 'lede'), A(s, 'cta')], 0);
    tl.from(A(s, 'player'), { scale: 0.86, autoAlpha: 0, duration: 0.55, ease: 'expo.out', transformOrigin: '50% 40%' }, 0.05);
    return tl;
  };

  /* ---------- 07 HOW IT WORKS: one question travels the pipeline, then eight at once ---------- */
  B.s7 = function (s, gsap) {
    var g = A(s, 'packets'); g.innerHTML = '';
    var NS = 'http://www.w3.org/2000/svg';
    function dot(r) { var c = document.createElementNS(NS, 'circle'); c.setAttribute('r', r); g.appendChild(c); return c; }
    var main = dot(11), halo = dot(22);
    halo.setAttribute('fill', 'none'); halo.setAttribute('stroke-width', '2');
    var many = []; for (var i = 0; i < 8; i++) many.push(dot(7));
    // Path: along y=230 from the CLI box to the signed log, then down into Numbers.
    var L1 = 1535 - 250, L2 = 425 - 230, LT = L1 + L2;
    function at(d) { return d <= L1 ? [250 + d, 230] : [1535, 230 + (d - L1)]; }
    function colorAt(d) { var x = 250 + d; return x < 1055 ? '#FF2E63' : x < 1275 ? '#2DD4D4' : '#3DDC97'; }
    var nodes = {}; $$(s, '.node').forEach(function (n) { nodes[n.dataset.n] = n.querySelector('rect'); });
    var hit = [['attach', 395], ['read', 615], ['rank', 835], ['inbox', 1055], ['merge', 1275], ['log', 1535]];
    function place(c, d, show) { var p = at(d); c.setAttribute('cx', p[0]); c.setAttribute('cy', p[1]); c.setAttribute('fill', colorAt(d)); c.style.opacity = show ? 1 : 0; }
    var ask = A(s, 'ask'), sigt = A(s, 'sigt');
    var P = { d: 0, on: 0, m: 0 };
    function render() {
      place(main, P.d, P.on > 0);
      var p = at(P.d); halo.setAttribute('cx', p[0]); halo.setAttribute('cy', p[1]); halo.setAttribute('stroke', colorAt(P.d)); halo.style.opacity = P.on * 0.5;
      hit.forEach(function (h) {
        var lit = 250 + P.d >= h[1] - 4 || P.m > 0;
        nodes[h[0]].style.stroke = lit ? (h[1] >= 1275 ? 'var(--green)' : h[1] >= 1055 ? 'var(--cyan)' : 'var(--line-2)') : '';
        nodes[h[0]].style.strokeWidth = lit ? 2 : '';
      });
      nodes.num.style.stroke = P.d >= LT - 2 || P.m > 0.9 ? 'var(--green)' : '';
      many.forEach(function (c, i) {
        var local = clamp(P.m * 1.6 - i * 0.08, 0, 1);
        place(c, local * L1, local > 0 && local < 1);
      });
    }
    render();
    var tl = gsap.timeline({ paused: true });
    rise(tl, [A(s, 'k'), A(s, 'h'), A(s, 'p')], 0);
    tl.from($$(s, '.node'), { autoAlpha: 0, y: 16, duration: 0.3, ease: E, stagger: 0.05 }, 0.1);
    tl.from($$(s, '.wire'), { autoAlpha: 0, duration: 0.3 }, 0.3);
    tl.to(P, { on: 1, duration: 0.15, onUpdate: render }, 0.6);
    var t = 0.6;
    hit.forEach(function (h) { var d = h[1] - 250; tl.to(P, { d: d, duration: 0.3, ease: 'power2.inOut', onUpdate: render }, t); t += 0.36; });
    tl.to(P, { d: LT, duration: 0.25, ease: 'power2.in', onUpdate: render }, t);
    tl.to(P, { on: 0, duration: 0.2, onUpdate: render }, t + 0.25);
    tl.from(ask, { autoAlpha: 0, duration: 0.1 }, 0.6 + 0.36);
    scramble(tl, ask, '? update the snapshot or fix the selector', 0.6 + 0.36, 0.5);
    tl.from(sigt, { autoAlpha: 0, duration: 0.1 }, 0.6 + 0.36 * 5);
    typeText(tl, sigt, 'sig 3f9a..c1e0 (illustrative)', 0.6 + 0.36 * 5, 0.4);
    tl.to(P, { m: 1, duration: 1.3, ease: 'none', onUpdate: render }, t + 0.35);
    // A persistent lit wire: the static and PDF frames still show the flow.
    var lit = A(s, 'lit'), litLen = L1 + L2;
    lit.style.strokeDasharray = litLen; 
    tl.fromTo(lit, { strokeDashoffset: litLen }, { strokeDashoffset: 0, duration: 2.4, ease: 'none' }, 0.6);
    rise(tl, $$(s, '.callouts .pill'), t + 0.6, { stagger: 0.08 });
    return tl;
  };

  /* ---------- 08 PROOF: the stopwatch stops at 10.7 s, the odometers roll, the testnet hashes type ---------- */
  B.s8 = function (s, gsap) {
    var sec = A(s, 'sec'), cg = A(s, 'cdots');
    // Clicks 2 and 3 land 0.3 s apart, so they share one dot labelled "2".
    var clicksAt = [3.376, 5.436, 10.702], counts = ['1', '2', '1'];
    cg.innerHTML = '';
    var NS = 'http://www.w3.org/2000/svg';
    var cs = clicksAt.map(function (c, i) {
      var x = 14 + c / 10.702 * 490;
      var g = document.createElementNS(NS, 'g');
      var e = document.createElementNS(NS, 'circle'); e.setAttribute('cx', x); e.setAttribute('cy', 30); e.setAttribute('r', 11);
      e.setAttribute('fill', i === 2 ? 'var(--green)' : 'var(--pink)'); g.appendChild(e);
      if (counts[i] !== '1') { var tx = document.createElementNS(NS, 'text'); tx.setAttribute('x', x); tx.setAttribute('y', 64); tx.setAttribute('text-anchor', 'middle'); tx.setAttribute('style', 'font:500 14px var(--mono); fill:var(--muted)'); tx.textContent = 'x' + counts[i]; g.appendChild(tx); }
      cg.appendChild(g); return g;
    });
    var DUR = 1.6;
    var tl = gsap.timeline({ paused: true });
    rise(tl, [A(s, 'k'), A(s, 'h')], 0);
    tl.from(A(s, 'honest'), { autoAlpha: 0, duration: 0.6 }, 0.3);
    clock(tl, 0.2, DUR, function (t) {
      var v = 10.7 * gsap.parseEase('power1.out')(clamp(t / DUR, 0, 1));
      sec.textContent = v.toFixed(1);
      cs.forEach(function (c, i) { c.style.opacity = v >= clicksAt[i] - 0.05 ? 1 : 0; });
    });
    tl.fromTo(A(s, 'watch'), { scale: 1 }, { scale: 1.04, duration: 0.06, yoyo: true, repeat: 1, transformOrigin: '0% 50%' }, 0.2 + DUR);
    // Before/after: the scan line sweeps from the POC to now.
    var img = A(s, 'baimg'), scan = A(s, 'scan');
    tl.fromTo(scan, { left: '0%' }, { left: '100%', duration: 1.1, ease: 'power2.inOut' }, 0.5);
    tl.fromTo(img, { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 1.1, ease: 'power2.inOut' }, 0.5);
    tl.to(scan, { autoAlpha: 0, duration: 0.2 }, 1.65);
    var tiles = AA(s, 'tile');
    rise(tl, tiles, 0.35, { stagger: 0.06 });
    tiles.forEach(function (tile, i) {
      var c = tile.querySelector('[data-count]'); if (!c) return;
      var to = +c.dataset.count, from = c.dataset.from ? +c.dataset.from : 0, dec = +(c.dataset.dec || 0);
      counter(tl, c, from, to, 0.45 + i * 0.06, 1.1, dec);
    });
    var txs = AA(s, 'tx');
    rise(tl, txs, 1.5, { stagger: 0.1 });
    txs.forEach(function (tx, i) { var el = tx.querySelector('[data-type]'); scramble(tl, el, el.dataset.type, 1.55 + i * 0.12, 0.5); });
    return tl;
  };

  /* ---------- 09 MARKET: 3,650 dots filter down to a to-scale TAM, SAM and a tiny bright SOM ---------- */
  B.s9 = function (s, gsap) {
    var cv = A(s, 'cv'), W = 860, H = 700, dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = W * dpr; cv.height = H * dpr;
    var ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var light = document.documentElement.getAttribute('data-theme') === 'light' || window.matchMedia('print').matches;
    var C = light ? { dot: '#8A93A5', cyan: '#0E9E9E', pink: '#E0154B', text: '#0A0F1C', muted: '#4B5568' } : { dot: '#4A5468', cyan: '#2DD4D4', pink: '#FF2E63', text: '#F4F6FA', muted: '#98A2B4' };
    var N = 3650, COLS = 73, ROWS = 50, AGENT = 1131;           // 1 dot = 10,000 developers; 31% of 36.5M = 11.3M
    var rnd = []; for (var i = 0; i < N; i++) { var x = Math.sin(i * 12.9898) * 43758.5453; rnd.push(x - Math.floor(x)); }
    var rank = rnd.map(function (v, i) { return [v, i]; }).sort(function (a, b) { return a[0] - b[0]; });
    var isAgent = new Array(N); rank.forEach(function (r, k) { isAgent[r[1]] = k < AGENT; });
    var TAM = 520, SAM = TAM * Math.sqrt(1.85 / 4.07), SOM = Math.max(10, TAM * Math.sqrt(7.2 / 4070));
    var BOT = H - 48, X0 = W - TAM, Y0 = BOT - TAM;                                // squares share the bottom-right corner
    var aIdx = 0, targets = {};
    var side = Math.ceil(Math.sqrt(AGENT)), step = (TAM - 40) / side;
    for (i = 0; i < N; i++) if (isAgent[i]) { var k = aIdx++; targets[i] = [X0 + 20 + (k % side) * step, Y0 + 20 + Math.floor(k / side) * step]; }
    function ease(v) { v = clamp(v, 0, 1); return v < .5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; }
    function draw(t) {
      ctx.clearRect(0, 0, W, H);
      var appear = clamp(t / 0.5, 0, 1), sift = clamp((t - 0.55) / 0.35, 0, 1), move = ease((t - 0.95) / 0.6), fade = clamp((t - 1.55) / 0.3, 0, 1);
      ctx.font = '500 14px "JetBrains Mono", monospace'; ctx.fillStyle = C.muted; ctx.globalAlpha = appear;
      ctx.fillText('EACH DOT = 10,000 DEVELOPERS', 0, 14);
      for (var i = 0; i < N; i++) {
        var c = i % COLS, r = Math.floor(i / COLS);
        var x = 6 + c * (W - 12) / (COLS - 1), y = 40 + r * (H - 60) / (ROWS - 1);
        var vis = clamp(appear * ROWS - r, 0, 1);
        if (!vis) continue;
        if (isAgent[i]) {
          var tg = targets[i];
          x = x + (tg[0] - x) * move; y = y + (tg[1] - y) * move;
          ctx.globalAlpha = vis * (1 - fade * 0.85); ctx.fillStyle = sift > 0 ? C.cyan : C.dot;
        } else {
          ctx.globalAlpha = vis * (1 - sift); ctx.fillStyle = C.dot;
          if (sift >= 1) continue;
        }
        ctx.beginPath(); ctx.arc(x, y, 2.1, 0, 6.2832); ctx.fill();
      }
      // TAM
      var tamA = clamp((t - 1.3) / 0.35, 0, 1);
      if (tamA) {
        ctx.globalAlpha = tamA; ctx.strokeStyle = C.cyan; ctx.lineWidth = 2; ctx.strokeRect(X0 + 1, Y0 + 1, TAM - 2, TAM - 2);
        ctx.globalAlpha = tamA * 0.12 * fade; ctx.fillStyle = C.cyan; ctx.fillRect(X0, Y0, TAM, TAM);
        ctx.globalAlpha = tamA; ctx.fillStyle = C.text; ctx.font = '700 30px "Space Grotesk", sans-serif'; ctx.fillText('TAM', X0 + 22, Y0 + 44);
              }
      var samA = clamp((t - 1.75) / 0.3, 0, 1);
      if (samA) {
        var sz = SAM * (0.6 + 0.4 * ease(samA));
        var sx = W - sz, sy = BOT - sz;
        ctx.globalAlpha = samA; ctx.fillStyle = C.cyan; ctx.globalAlpha = samA * 0.22; ctx.fillRect(sx, sy, sz, sz);
        ctx.globalAlpha = samA; ctx.strokeStyle = C.cyan; ctx.strokeRect(sx + 1, sy + 1, sz - 2, sz - 2);
        ctx.fillStyle = C.text; ctx.font = '700 26px "Space Grotesk", sans-serif'; ctx.fillText('SAM', sx + 20, sy + 40);
      }
      var somA = clamp((t - 2.05) / 0.3, 0, 1);
      if (somA) {
        var bx = W - SOM - 30, by = BOT - SOM - 30;
        ctx.globalAlpha = somA * 0.35; ctx.strokeStyle = C.pink; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(bx + SOM / 2, by + SOM / 2, 14 + 26 * (1 - somA) + 8, 0, 6.2832); ctx.stroke();
        ctx.globalAlpha = somA; ctx.fillStyle = C.pink; ctx.fillRect(bx, by, SOM, SOM);
        // Leader runs along the bottom edge, under the squares, out to the left.
        var ly = H - 14;
        ctx.strokeStyle = C.pink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(bx + SOM / 2, by + SOM + 4); ctx.lineTo(bx + SOM / 2, ly); ctx.lineTo(X0 - 16, ly); ctx.stroke();
        ctx.fillStyle = C.text; ctx.font = '700 26px "Space Grotesk", sans-serif'; ctx.textAlign = 'right'; ctx.fillText('YEAR-5 PATH', X0 - 26, ly - 26);
        ctx.font = '500 14px "JetBrains Mono", monospace'; ctx.fillStyle = C.muted; ctx.fillText('OUR ASSUMPTION', X0 - 26, ly - 4); ctx.textAlign = 'left';
      }
      ctx.globalAlpha = 1;
    }
    // SOM is offset 30 px inside SAM's corner so it is visible; it is drawn at its true scaled size (min 10 px).
    var tl = gsap.timeline({ paused: true });
    rise(tl, [A(s, 'k'), A(s, 'h')], 0);
    var lns = AA(s, 'ln'), when = [0.2, 0.6, 1.3, 1.75, 2.05];
    lns.forEach(function (l, i) { rise(tl, [l], when[i]); });
    clock(tl, 0, 2.4, draw);
    rise(tl, [A(s, 'budget')], 2.2);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { draw(tl.time()); });
    return tl;
  };

  /* ---------- 10 COMPETITION: crowded quadrants, then the empty one lights up ---------- */
  B.s10 = function (s, gsap) {
    var NS = 'http://www.w3.org/2000/svg', g = A(s, 'chips'), hub = A(s, 'hub');
    g.innerHTML = ''; hub.innerHTML = '';
    // x: single vendor (left) to vendor-neutral (right); y: team (top) to single developer (bottom).
    var chips = [
      ['Cognition', 'sells its own agents', 64, 40], ['Factory', 'sells its own agents', 236, 40], ['Cursor cloud agents', 'own vendor only', 64, 150],
      ['Claude Code Agent view', 'own vendor only', 64, 300], ['One vendor CLI', 'one terminal', 64, 420],
      ['Conductor', 'Teams plan, runs per dev', 470, 292], ['Herdr', 'OSS, one machine', 640, 370], ['Entire', 'history, not live', 470, 420], ['tmux', 'one pane', 700, 462]
    ];
    function el(tag, attrs, parent) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); (parent || g).appendChild(e); return e; }
    var chipEls = chips.map(function (c) {
      var grp = el('g', { transform: 'translate(' + c[2] + ',' + c[3] + ')' });
      var w = c[0].length * 10.5 + 32;
      el('rect', { x: 0, y: 0, width: w, height: 40, rx: 20, fill: 'var(--raised)', stroke: 'var(--line-2)' }, grp);
      el('text', { x: 16, y: 26, 'font-size': 17, fill: 'var(--text)', style: 'font-family:var(--sans);font-weight:500' }, grp).textContent = c[0];
      el('text', { x: 16, y: 60, 'font-size': 13, fill: 'var(--muted)' }, grp).textContent = c[1];
      return grp;
    });
    var cx = 620, cy = 135;
    var clis = ['Claude Code', 'Codex', 'Cursor', 'OpenCode', 'Pi', 'Grok', 'Muse', 'DeepSeek'];
    var lines = [], labels = [];
    clis.forEach(function (n, i) {
      var a = -Math.PI / 2 + i * (2 * Math.PI / clis.length), rx = 118, ry = 94;
      var x = cx + rx * Math.cos(a), y = cy + ry * Math.sin(a);
      var ca = Math.cos(a), sa = Math.sin(a), off = 12;   // dot radius plus 8 px
      lines.push(el('line', { x1: cx, y1: cy, x2: x, y2: y, stroke: 'var(--green)', 'stroke-width': 1.5, opacity: 0.6 }, hub));
      var t = el('text', { x: x + ca * off, y: y + sa * off + (sa > 0.3 ? 12 : sa < -0.3 ? -2 : 5), 'font-size': 14, 'text-anchor': ca > 0.3 ? 'start' : ca < -0.3 ? 'end' : 'middle', fill: 'var(--muted)' }, hub);
      t.textContent = n; labels.push(t);
      el('circle', { cx: x, cy: y, r: 4, fill: 'var(--green)' }, hub);
    });
    var ring = el('circle', { cx: cx, cy: cy, r: 40, fill: 'none', stroke: 'var(--pink)', 'stroke-width': 3 }, hub);
    var us = el('g', { transform: 'translate(' + (cx - 84) + ',' + (cy - 26) + ')' }, hub);
    el('rect', { x: 0, y: 0, width: 168, height: 52, rx: 26, fill: 'var(--green)' }, us);
    var ut = el('text', { x: 84, y: 34, 'font-size': 22, 'text-anchor': 'middle', fill: '#0A0F1C', style: 'font-family:var(--display);font-weight:700' }, us);
    ut.textContent = (window.DECK_CONFIG && window.DECK_CONFIG.name) || 'Kipdeck';
    var tl = gsap.timeline({ paused: true });
    rise(tl, [A(s, 'k'), A(s, 'h')], 0);
    tl.from(s.querySelectorAll('.quad .axisl'), { autoAlpha: 0, duration: 0.3 }, 0.1);
    tl.from(chipEls, { x: '-=40', autoAlpha: 0, duration: 0.4, ease: E, stagger: 0.06 }, 0.2);
    tl.to(A(s, 'tr'), { opacity: 1, duration: 0.3 }, 1.0);
    tl.from(us, { autoAlpha: 0, scale: 0.8, transformOrigin: '84px 26px', duration: 0.3, ease: E }, 1.0);
    tl.fromTo(ring, { attr: { r: 30 }, opacity: 0.9 }, { attr: { r: 150 }, opacity: 0, duration: 0.7, ease: 'power2.out' }, 1.25);
    tl.from(lines, { attr: { x2: cx, y2: cy }, duration: 0.45, ease: E, stagger: 0.04 }, 1.35);
    tl.from(labels, { autoAlpha: 0, duration: 0.2, stagger: 0.04 }, 1.55);
    rise(tl, AA(s, 'ans'), 0.5, { stagger: 0.15 });
    return tl;
  };

  /* ---------- 11 MOAT: signed records chain up and fan out into a heatmap no vendor can draw ---------- */
  B.s11 = function (s, gsap) {
    var chain = A(s, 'chain'); chain.innerHTML = '';
    var recs = [['#0412', 'Codex', 'waited 4m'], ['#0413', 'Claude Code', 'waited 1m'], ['#0414', 'Cursor', 'waited 9m']];
    var blks = recs.map(function (r, i) {
      var d = document.createElement('div'); d.className = 'blk';
      d.innerHTML = '<b>' + r[0] + ' &#10003; signed</b><br>' + r[1] + '<br>' + r[2];
      chain.appendChild(d);
      if (i < recs.length - 1) { var l = document.createElement('span'); l.style.cssText = 'align-self:center;width:18px;height:2px;background:var(--green);opacity:.6'; chain.appendChild(l); }
      return d;
    });
    var tag = document.createElement('div'); tag.className = 't-label'; tag.style.cssText = 'flex-basis:100%; order:-1; margin-bottom:2px'; tag.innerHTML = 'Signed merge records <span class="c-amber">(illustration)</span>'; chain.appendChild(tag);
    var heat = A(s, 'heat'); heat.innerHTML = '';
    var agents = ['Claude Code', 'Codex', 'Cursor', 'OpenCode', 'Pi'];
    heat.insertAdjacentHTML('beforeend', '<div class="hd"></div>' + ['W1', 'W2', 'W3', 'W4', 'W5'].map(function (w) { return '<div class="hd">' + w + '</div>'; }).join(''));
    var cells = [];
    agents.forEach(function (a, r) {
      heat.insertAdjacentHTML('beforeend', '<div class="lb">' + a + '</div>');
      for (var c = 0; c < 5; c++) {
        var v = clamp(0.95 - c * 0.17 + ((r * 7 + c * 3) % 5) * 0.06 - r * 0.04, 0.05, 1);   // waits shrink week over week
        var d = document.createElement('div');
        d.style.background = v > 0.6 ? 'rgba(255,46,99,' + (v * 0.75).toFixed(2) + ')' : v > 0.35 ? 'rgba(255,176,32,' + (0.25 + v * 0.6).toFixed(2) + ')' : 'rgba(61,220,151,' + (0.25 + (1 - v) * 0.5).toFixed(2) + ')';
        d.dataset.d = r + c; heat.appendChild(d); cells.push(d);
      }
    });
    var tl = gsap.timeline({ paused: true });
    rise(tl, [A(s, 'k'), A(s, 'h')], 0);
    rise(tl, AA(s, 'pt'), 0.3, { stagger: 0.1 });
    tl.from(blks, { x: 40, autoAlpha: 0, duration: 0.35, ease: E, stagger: 0.18 }, 0.4);
    tl.from(chain.querySelectorAll(':scope > span'), { autoAlpha: 0, duration: 0.2, stagger: 0.18 }, 0.6);
    rise(tl, [A(s, 'heatcard')], 1.1);
    // A linear diagonal opacity wipe: data, not confetti.
    tl.from(cells, { autoAlpha: 0, duration: 0.2, ease: 'none', stagger: function (i) { return +cells[i].dataset.d * 0.05; } }, 1.3);
    rise(tl, [A(s, 'lock')], 1.9);
    rise(tl, [A(s, 'fork')], 2.1);
    return tl;
  };

  /* ---------- 12 BUSINESS: free tier, then the team tier; the badge flips to TEAM ---------- */
  B.s12 = function (s, gsap) {
    var badge = A(s, 'badge');
    var tl = gsap.timeline({ paused: true });
    rise(tl, [A(s, 'k'), A(s, 'h')], 0);
    rise(tl, AA(s, 'tier'), 0.3, { stagger: 0.12 });
    clock(tl, 0, 2.4, function (t) {
      var team = t >= 1.0;
      badge.textContent = team ? 'TEAM' : 'FREE';
      badge.style.color = team ? 'var(--amber)' : 'var(--green)';
      badge.style.background = team ? 'var(--amber-a)' : 'var(--green-a)';
    });
    tl.fromTo(badge, { scale: 1.2 }, { scale: 1, duration: 0.15 }, 1.0);
    tl.fromTo(s.querySelector('.tier.team'), { borderColor: 'rgba(255,255,255,.18)' }, { borderColor: '#FFB020', duration: 0.3 }, 1.05);
    rise(tl, [A(s, 'gtml')], 1.0);
    rise(tl, AA(s, 'fs'), 1.1, { stagger: 0.12, y: 0, x: -20 });
    rise(tl, [A(s, 'note12')], 1.8);
    return tl;
  };

  /* ---------- 13 TEAM: three cards reveal, then the commit graph ---------- */
  B.s13 = function (s, gsap) {
    var data = [['30', 11], ['1', 14], ['2', 64], ['3', 32], ['4', 118], ['5', 92], ['6', 131], ['7', 71]];
    var box = A(s, 'commits'); box.innerHTML = '';
    var bars = data.map(function (d, i) {
      var b = document.createElement('div'); b.className = 'b';
      b.style.height = Math.round(d[1] / 131 * 110) + 'px';
      b.innerHTML = '<span>' + d[1] + '</span><em>' + (i === 0 ? 'Sep 30' : 'Oct ' + d[0]) + '</em>';
      box.appendChild(b); return b;
    });
    var tl = gsap.timeline({ paused: true });
    rise(tl, [A(s, 'k'), A(s, 'h')], 0);
    tl.fromTo(AA(s, 'card'), { clipPath: 'inset(0 0 100% 0)', y: 12 }, { clipPath: 'inset(0 0 0% 0)', y: 0, duration: 0.3, ease: E, stagger: 0.1 }, 0.2);
    var st = s.querySelector('[data-count]');
    counter(tl, st, 0, 400, 0.4, 0.8, 0, 'k');
    rise(tl, [A(s, 'why')], 0.8);
    tl.from(bars, { scaleY: 0, transformOrigin: '50% 100%', duration: 0.35, ease: E, stagger: 0.05 }, 1.0);
    return tl;
  };

  /* ---------- 14 ASK: USD 100k splits into its uses, milestones light, the queue clears ---------- */
  B.s14 = function (s, gsap) {
    var NS = 'http://www.w3.org/2000/svg', svg = A(s, 'donut'); svg.innerHTML = '';
    var R = 110, Cf = 2 * Math.PI * R, parts = [[0.7, 'var(--green)'], [0.1, 'var(--cyan)'], [0.1, 'var(--amber)'], [0.1, 'var(--muted)']];
    var acc = 0, arcs = [];
    parts.forEach(function (p) {
      var c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', 150); c.setAttribute('cy', 150); c.setAttribute('r', R); c.setAttribute('fill', 'none');
      c.setAttribute('stroke', p[1]); c.setAttribute('stroke-width', 46);
      var len = p[0] * Cf - 4;
      c.setAttribute('stroke-dasharray', len + ' ' + (Cf - len));
      c.setAttribute('transform', 'rotate(' + (-90 + acc * 360) + ' 150 150)');
      svg.appendChild(c); arcs.push({ el: c, len: len }); acc += p[0];
    });
    svg.insertAdjacentHTML('beforeend', '<text x="150" y="146" text-anchor="middle" style="font:700 40px var(--display); fill:var(--text)">70%</text><text x="150" y="174" text-anchor="middle" style="font:500 13px var(--mono); fill:var(--muted); letter-spacing:.08em">FOUNDER TIME</text>');
    var flist = A(s, 'flist'); flist.innerHTML = '';
    var rows = [['Cx', 'Fix the flaky checkout test', 'Codex', 754], ['CC', 'Add rate limiting to /api/login', 'Claude Code', 512], ['Cu', 'Write the README quickstart', 'Cursor', 204]];
    var els = rows.map(function (r, i) {
      var d = document.createElement('div'); d.className = 'q-row hot';
      d.style.top = (i * 70) + 'px';
      d.innerHTML = '<span class="av">' + r[0] + '</span><span class="ttl">' + r[1] + '<small>' + r[2] + '</small></span><span class="pill pink"><i class="dot"></i><b>needs you</b></span><span class="tm"></span>';
      flist.appendChild(d); return d;
    });
    var ms = $$(s, '.ms .m');
    var tl = gsap.timeline({ paused: true });
    tl.from(A(s, 'k'), { autoAlpha: 0, duration: 0.2 }, 0);
    // Ask slide: a mask reveal on the number.
    tl.fromTo(A(s, 'amt'), { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 0.4, ease: 'power3.inOut' }, 0.05);
    counter(tl, A(s, 'amtn'), 0, 100, 0.05, 0.6);
    rise(tl, [A(s, 'terms'), A(s, 'terms2')], 0.4);
    arcs.forEach(function (a, i) { tl.fromTo(a.el, { attr: { 'stroke-dashoffset': a.len } }, { attr: { 'stroke-dashoffset': 0 }, duration: 0.45, ease: 'power2.out' }, 0.7 + i * 0.12); });
    rise(tl, $$(A(s, 'legend'), 'div'), 0.8, { stagger: 0.08 });
    tl.from(A(s, 'ms'), { autoAlpha: 0, duration: 0.3 }, 1.0);
    tl.fromTo(A(s, 'fill'), { width: '0%' }, { width: '75%', duration: 1.2, ease: 'power1.inOut' }, 1.2);
    clock(tl, 0, 4.4, function (t) {
      ms.forEach(function (m, i) { m.classList.toggle('on', t >= 1.2 + i * 0.4); });
      els.forEach(function (d, i) {
        var done = t >= 2.9 + i * 0.25, w = rows[i][3];
        var left = done ? 0 : Math.round(w * (1 - clamp((t - 2.4) / (0.5 + i * 0.25), 0, 1)));
        d.children[3].textContent = mmss(left);
        if (d._done !== done) {
          d._done = done;
          d.classList.toggle('hot', !done); d.classList.toggle('done', done);
          d.children[2].className = 'pill ' + (done ? 'green' : 'pink');
          d.children[2].lastChild.textContent = done ? 'merged' : 'needs you';
        }
      });
    });
    rise(tl, [A(s, 'final')], 2.0);
    els.forEach(function (d, i) { tl.fromTo(d, { scale: 1.04 }, { scale: 1, duration: 0.12 }, 2.9 + i * 0.25); });
    tl.from(A(s, 'nobody'), { autoAlpha: 0, x: 10, duration: 0.3 }, 3.5);
    rise(tl, [A(s, 'close'), A(s, 'contact')], 3.6);
    return tl;
  };

  /* ---------- 15 APPENDIX ---------- */
  B.s15 = function (s, gsap) {
    var tl = gsap.timeline({ paused: true });
    rise(tl, [A(s, 'k'), A(s, 'h')], 0);
    rise(tl, s.querySelectorAll('table tr'), 0.2, { stagger: 0.04, y: 10 });
    rise(tl, AA(s, 'ev'), 0.4, { stagger: 0.08 });
    return tl;
  };

  window.SLIDE_BUILDERS = B;
})();
