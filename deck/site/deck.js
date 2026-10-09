/* === DECK ENGINE ===
   Navigation, scaling, flow mode for phones, presenter window, print/PDF and per-slide timelines.
   Per-slide motion lives in slides.js (window.SLIDE_BUILDERS). */
(function () {
  'use strict';
  var cfg = window.DECK_CONFIG || { name: 'Kipdeck' };
  var q = new URLSearchParams(location.search);
  var doc = document;
  var stage = doc.getElementById('stage');
  var slides = Array.prototype.slice.call(doc.querySelectorAll('.slide'));
  var total = slides.length;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches || q.has('static');
  var presenter = q.has('presenter');
  var timelines = {};
  var current = -1;

  /* --- 1. Name config: replace {{name}} and {{cmd}} everywhere before first paint --- */
  var cmd = cfg.name.toLowerCase().replace(/\s+/g, '-');
  function fill(str) { return str.replace(/\{\{name\}\}/g, cfg.name).replace(/\{\{cmd\}\}/g, cmd); }
  cfg.commitment = fill(cfg.commitment || '');
  doc.title = fill(doc.title);
  var walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  var n; while ((n = walker.nextNode())) { if (n.nodeValue.indexOf('{{') > -1) n.nodeValue = fill(n.nodeValue); }
  doc.querySelectorAll('[alt],[aria-label],[title]').forEach(function (el) {
    ['alt', 'aria-label', 'title'].forEach(function (a) { var v = el.getAttribute(a); if (v && v.indexOf('{{') > -1) el.setAttribute(a, fill(v)); });
  });
  var md = doc.querySelector('meta[name=description]'); if (md) md.content = fill(md.content);
  doc.querySelectorAll('[data-commit]').forEach(function (el) { el.textContent = cfg.commitment; });
  doc.querySelectorAll('[data-cta]').forEach(function (el) { el.textContent = cfg.npmPublished ? 'Try it: npx ' + cmd + ' --demo' : 'Hosted demo on request'; });
  /* Install claim: one command only once it is true. Until npm publish (M1) it says how it installs today. */
  doc.querySelectorAll('[data-install]').forEach(function (el) {
    el.textContent = cfg.npmPublished ? 'npx ' + cmd + ': one command' : 'Installs from a local tarball today; npm at M1';
  });
  doc.querySelectorAll('[data-a=contact]').forEach(function (el) {
    var parts = [(cfg.team || []).join(', ')];
    if (cfg.contactEmail) parts.push(cfg.contactEmail);
    if (cfg.demoUrl) parts.push(cfg.demoUrl);
    if (cfg.repoUrl) parts.push(cfg.repoUrl);
    el.textContent = parts.join('  /  ');
  });

  /* --- 2. Footer on every slide --- */
  slides.forEach(function (s, i) {
    var f = doc.createElement('div');
    f.className = 'foot';
    f.innerHTML = '<span><b>' + cfg.name + '</b> &middot; <span class="foot-x">Investor deck &middot; </span>Data as of ' + cfg.asOf + '</span><span><b>' + String(i + 1).padStart(2, '0') + '</b> / ' + String(total).padStart(2, '0') + '</span>';
    s.appendChild(f);
    s.setAttribute('aria-label', (i + 1) + ' of ' + total + ': ' + (s.dataset.title || ''));
  });

  /* --- 3. Mode: stage (scaled 1920x1080) or flow (phones, narrow portrait) --- */
  var flowMQ = window.matchMedia('(max-width: 820px), (max-aspect-ratio: 4/5)');
  var isPrint = q.has('print');
  function isFlow() { return !isPrint && flowMQ.matches; }
  function fit() {
    if (isFlow()) { doc.body.classList.add('flow'); stage.style.transform = ''; return; }
    doc.body.classList.remove('flow');
    var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.transform = 'scale(' + s + ')';
  }

  /* --- 4. Timelines --- */
  var B = window.SLIDE_BUILDERS || {};
  function tl(i) {
    var s = slides[i];
    if (!timelines[i]) {
      var build = B[s.id];
      timelines[i] = build && window.gsap ? build(s, window.gsap) : null;
      if (timelines[i]) timelines[i].pause(0);
    }
    return timelines[i];
  }
  function play(i) {
    var t = tl(i); if (!t) return;
    if (reduced || isPrint) { t.progress(1).pause(); return; }
    t.restart();
  }
  /* Going back never replays motion: the slide shows its final frame. R still replays. */
  function rest(i) { var t = tl(i); if (t) t.progress(1).pause(); }
  function finalAll() { slides.forEach(function (_, i) { var t = tl(i); if (t) t.progress(1).pause(); }); }
  function seek(i, seconds) { var t = tl(i); if (t) { t.pause(); t.time(Math.min(seconds, t.duration())); } }

  /* --- 5. Navigation (stage mode) --- */
  var bar = doc.querySelector('.progress');
  var chan = 'BroadcastChannel' in window ? new BroadcastChannel('kipdeck-deck') : null;
  function go(i, opts) {
    i = Math.max(0, Math.min(total - 1, i));
    if (i === current && !(opts && opts.force)) return;
    var prev = current;
    var back = prev > -1 && i < prev;
    stage.style.setProperty('--dir', back ? -1 : 1);
    if (prev > -1) {
      var out = slides[prev];
      out.classList.add('leaving');
      clearTimeout(out._lv); out._lv = setTimeout(function () { out.classList.remove('leaving'); }, 320);
      slides[prev].classList.remove('active');
      var pt = timelines[prev]; if (pt) pt.pause();
      slides[prev].dispatchEvent(new CustomEvent('slide:leave', { detail: { index: prev } }));
    }
    current = i;
    tl(i); // build (and set start state) before the slide becomes visible
    slides[i].classList.add('active');
    slides[i].dispatchEvent(new CustomEvent('slide:enter', { detail: { index: i, back: back } }));
    slides[i].classList.remove('leaving');
    if (!(opts && opts.noPlay)) { if (back) rest(i); else play(i); }
    /* Build the next slide's timeline while the browser is idle, so stepping forward never pays for it. */
    if (i + 1 < total && !timelines[i + 1]) {
      var pre = function () { if (current === i) tl(i + 1); };
      if (window.requestIdleCallback) requestIdleCallback(pre, { timeout: 1500 }); else setTimeout(pre, 300);
    }
    bar.firstElementChild.style.width = ((i + 1) / total * 100) + '%';
    bar.classList.toggle('done', i === total - 1);
    if (prev > -1) doc.body.classList.remove('show-hint');   // the key hint goes once someone has moved
    if (!(opts && opts.silent)) {
      history.replaceState(null, '', location.pathname + location.search + '#' + (i + 1));
      if (chan) chan.postMessage({ type: 'goto', i: i });
    }
  }
  function next() { go(current + 1); }
  function prev() { go(current - 1); }
  window.__deck = { go: go, finalAll: finalAll, seek: seek, total: total, tl: tl, slides: slides, get current() { return current; },
    reduced: reduced, print: isPrint, flow: isFlow(), hold: !!q.get('hold') };

  function fromHash() { var h = parseInt((location.hash || '').replace('#', ''), 10); return isNaN(h) ? 0 : h - 1; }

  /* --- 6. Presenter window: notes, next slide, timer; synced with BroadcastChannel --- */
  if (presenter) {
    doc.body.innerHTML = '';
    doc.body.style.overflow = 'auto';
    var t0 = Date.now();
    var wrap = doc.createElement('div');
    wrap.style.cssText = 'padding:32px;font-family:var(--sans);color:var(--text);max-width:1100px;margin:0 auto';
    wrap.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:baseline"><div class="t-label" id="pn"></div><div class="t-num" id="pt" style="font-size:40px"></div></div>' +
      '<h1 class="t-h3" id="ph" style="margin:18px 0"></h1><p id="pnotes" style="font:400 26px/1.5 var(--sans)"></p>' +
      '<p class="t-label" style="margin-top:36px" id="pnext"></p>' +
      '<div style="display:flex;gap:12px;margin-top:28px"><button id="bp" class="pill outline" style="height:52px;padding:0 24px;cursor:pointer">&larr; Prev</button><button id="bn" class="pill outline" style="height:52px;padding:0 24px;cursor:pointer">Next &rarr;</button></div>';
    doc.body.appendChild(wrap);
    var data = slides.map(function (s) { var a = s.querySelector('.notes'); return { title: s.dataset.title, notes: a ? fill(a.textContent) : '' }; });
    var pi = fromHash();
    function render() {
      doc.getElementById('pn').textContent = 'Slide ' + (pi + 1) + ' / ' + total;
      doc.getElementById('ph').textContent = data[pi].title;
      doc.getElementById('pnotes').textContent = data[pi].notes;
      doc.getElementById('pnext').textContent = pi + 1 < total ? 'Next: ' + data[pi + 1].title : 'Last slide';
    }
    function send(i) { pi = Math.max(0, Math.min(total - 1, i)); render(); if (chan) chan.postMessage({ type: 'goto', i: pi }); }
    doc.getElementById('bp').onclick = function () { send(pi - 1); };
    doc.getElementById('bn').onclick = function () { send(pi + 1); };
    doc.addEventListener('keydown', function (e) { if (['ArrowRight', ' ', 'PageDown'].indexOf(e.key) > -1) { e.preventDefault(); send(pi + 1); } if (['ArrowLeft', 'PageUp'].indexOf(e.key) > -1) { e.preventDefault(); send(pi - 1); } });
    if (chan) chan.onmessage = function (m) { if (m.data.type === 'goto') { pi = m.data.i; render(); } };
    setInterval(function () { var s = Math.floor((Date.now() - t0) / 1000); doc.getElementById('pt').textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }, 500);
    render();
    return;
  }

  /* --- 7. Boot --- */
  fit();
  window.addEventListener('resize', function () { var was = doc.body.classList.contains('flow'); fit(); if (was !== doc.body.classList.contains('flow')) location.reload(); });

  if (reduced || isPrint || q.has('hold')) doc.body.classList.add('no-trans');
  if (isPrint) {
    finalAll();
    slides.forEach(function (s) { s.classList.add('active'); });
    doc.body.classList.add('print');
    window.__deckReady = true;
    return;
  }

  if (isFlow()) {
    /* Flow mode: all slides visible in a column; each plays its motion when scrolled into view. */
    slides.forEach(function (s) { s.classList.add('active'); });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var i = slides.indexOf(en.target);
        if (en.isIntersecting && en.intersectionRatio > 0.25 && !en.target.dataset.played) {
          en.target.dataset.played = '1'; current = i; play(i); en.target.dispatchEvent(new CustomEvent('slide:enter', { detail: { index: i, back: false } }));
          bar.firstElementChild.style.width = ((i + 1) / total * 100) + '%';
        } else if (!en.isIntersecting && en.target.dataset.played) {
          en.target.dispatchEvent(new CustomEvent('slide:leave', { detail: { index: i } }));
        }
      });
    }, { threshold: [0, 0.25, 0.5] });
    // Build each slide (start state) shortly before it scrolls in so nothing pops.
    var pre = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { var i = slides.indexOf(en.target); tl(i); pre.unobserve(en.target); } });
    }, { rootMargin: '0px 0px 60% 0px' });
    slides.forEach(function (s) { pre.observe(s); io.observe(s); });
    window.__deckReady = true;
    return;
  }

  var start = fromHash();
  var hold = q.get('hold');   // ?hold=final or ?hold=<seconds> for screenshots
  if (hold) {
    go(start, { noPlay: true, silent: true });
    if (hold === 'final') { var ft = tl(start); if (ft) ft.progress(1).pause(); }
    else seek(start, parseFloat(hold));
  } else {
    go(start);
  }
  window.__deckReady = true;

  doc.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var help = doc.querySelector('.help');
    if (help.classList.contains('open')) { if (e.key === 'Escape' || e.key === '?') help.classList.remove('open'); return; }
    switch (e.key) {
      case 'ArrowRight': case 'ArrowDown': case ' ': case 'PageDown': case 'Enter': e.preventDefault(); next(); break;
      case 'ArrowLeft': case 'ArrowUp': case 'PageUp': case 'Backspace': e.preventDefault(); prev(); break;
      case 'Home': go(0); break;
      case 'End': go(total - 1); break;
      case 's': case 'S': doc.body.classList.toggle('no-src'); break;
      case 'r': case 'R': play(current); slides[current].dispatchEvent(new CustomEvent('slide:replay')); break;
      case 'f': case 'F': if (!doc.fullscreenElement) doc.documentElement.requestFullscreen && doc.documentElement.requestFullscreen(); else doc.exitFullscreen(); break;
      case 'p': case 'P': window.open(location.pathname + '?presenter#' + (current + 1), 'kipdeck-presenter', 'width=1100,height=760'); break;
      case 'b': case 'B': case '.': stage.style.visibility = stage.style.visibility === 'hidden' ? '' : 'hidden'; break;
      case '?': help.classList.add('open'); break;
    }
  });
  doc.querySelector('.help .x').addEventListener('click', function () { doc.querySelector('.help').classList.remove('open'); });
  doc.querySelector('.navbtn.prev').addEventListener('click', prev);
  doc.querySelector('.navbtn.next').addEventListener('click', next);
  if (chan) chan.onmessage = function (m) { if (m.data.type === 'goto') go(m.data.i, { silent: true }); };

  /* Click: right two thirds advance, left third goes back. Links, video and buttons keep their own click. */
  doc.getElementById('viewport').addEventListener('click', function (e) {
    if (e.target.closest('a, button, video, .player, .kip')) return;
    if (e.clientX < window.innerWidth / 3) prev(); else next();
  });
  /* Touch swipe in stage mode (landscape phones, tablets). */
  var tx = null;
  doc.addEventListener('touchstart', function (e) { tx = e.touches[0].clientX; }, { passive: true });
  doc.addEventListener('touchend', function (e) {
    if (tx === null) return; var dx = e.changedTouches[0].clientX - tx; tx = null;
    if (Math.abs(dx) > 50) { dx < 0 ? next() : prev(); }
  });
  window.addEventListener('hashchange', function () { go(fromHash(), { silent: true }); });
  window.addEventListener('beforeprint', finalAll);

  /* Show the key hint for a few seconds on the first slide. */
  if (!hold) { doc.body.classList.add('show-hint'); setTimeout(function () { doc.body.classList.remove('show-hint'); }, 4500); }
  if ('ontouchstart' in window) doc.querySelectorAll('.navbtn').forEach(function (b) { b.style.display = 'block'; });
})();
