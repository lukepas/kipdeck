// Checks the deck's resting frames: type size, the cover and close queues, the phone layout, and copy that
// must stay out. Usage: node scripts/deck-check.mjs   (exit code 1 on any failure; PORT=<n> to pin the port)
import { serve } from './serve.mjs';
import { chromium } from './browser.mjs';

const STAGE_MIN = 14;   // px, at 1920x1080: every label and caption
const PHONE_MIN = 13;   // px, at 390 wide: the phone reading layout
const BANNED = [/\bHerdr\b/, /\bEntire\b/, /\bx2\b/, /mergeline/i, /ugc ?army/i];
const fails = [];
const errors = [];
const fail = (m) => { fails.push(m); console.log('FAIL ' + m); };

/* Rendered text size on the active slide (or every slide on a phone), in CSS px of the 1920 stage.
   On a phone, SVG charts scale to the screen width as a whole, so their labels are left out there. */
const smallText = (all) => {
  const st = document.getElementById('stage').getBoundingClientRect();
  const k = all ? 1 : st.width / 1920;
  const roots = all ? window.__deck.slides : [window.__deck.slides[window.__deck.current]];
  const out = [];
  for (const s of roots) {
    const w = document.createTreeWalker(s, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const t = n.nodeValue.trim();
      if (!t) continue;
      const el = n.parentElement;
      if (!el || el.closest('.notes, .kip-sticker, .kip, .src-quiet')) continue;
      if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      const r = document.createRange(); r.selectNodeContents(n);
      if (![...r.getClientRects()].some((q) => q.width > 0.5 && q.height > 0.5)) continue;
      let px = parseFloat(getComputedStyle(el).fontSize);
      const svg = el.closest('svg');
      if (svg && all) continue;
      if (svg && el instanceof SVGElement) { const m = el.getScreenCTM(); if (m) px *= Math.hypot(m.a, m.b); }
      else { let o = el; while (o && o !== s) { const tr = getComputedStyle(o).transform; if (tr && tr !== 'none') { const m = new DOMMatrix(tr); px *= Math.hypot(m.a, m.b); } o = o.parentElement; } }
      out.push({ px: px / k, t: t.slice(0, 40), slide: s.id });
    }
  }
  return out;
};

const { server, url } = await serve();

/* The <head> as served, before any script runs: link previews (Slack, LinkedIn, iMessage, email) read
   only this, so a {{token}} there is what people see. It must name the product and carry a share card
   that exists in site/. */
{
  const raw = await (await fetch(url)).text();
  const head = (/<head>([\s\S]*?)<\/head>/i.exec(raw) ?? [])[1] ?? '';
  if (!head) fail('head: no <head> in index.html');
  if (head.includes('{{')) fail('head: template token in <head>: ' + (head.match(/.*\{\{.*/g) ?? []).map((l) => l.trim()).join(' | '));
  const meta = (attr, key) => (new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`).exec(head) ?? [])[1] ?? '';
  const title = (/<title>([^<]*)<\/title>/.exec(head) ?? [])[1] ?? '';
  if (!/Kipdeck/.test(title)) fail('head: <title> does not name Kipdeck: ' + title);
  for (const [attr, key] of [['name', 'description'], ['property', 'og:title'], ['property', 'og:description'], ['property', 'og:image'], ['name', 'twitter:card']]) {
    if (!meta(attr, key)) fail(`head: no ${key}`);
  }
  const og = meta('property', 'og:image');
  if (og && !/^https:\/\//.test(og)) fail('head: og:image must be absolute (most previews ignore a relative one): ' + og);
  if (og) {
    const local = new URL(new URL(og).pathname.replace(/^\//, ''), url);
    const r = await fetch(local);
    if (!r.ok) fail(`head: og:image ${new URL(og).pathname} is not in site/ (${r.status})`);
  }
  if (!fails.some((f) => f.startsWith('head'))) console.log('ok head: ' + title);
}

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
  await page.goto(url + '?hold=final#1');
  await page.waitForFunction(() => window.__deckReady);
  const total = await page.evaluate(() => window.__deck.total);

  for (let i = 1; i <= total; i++) {
    await page.goto(url + '?hold=final&n=' + i + '#' + i);
    await page.waitForFunction(() => window.__deckReady && document.fonts.status === 'loaded');
    await page.waitForTimeout(120);
    const small = (await page.evaluate((fn) => eval(fn)(false), '(' + smallText.toString() + ')')).filter((x) => x.px < STAGE_MIN - 0.05);
    if (small.length) fail(`s${i}: text under ${STAGE_MIN}px: ` + [...new Set(small.map((x) => x.t + ' (' + x.px.toFixed(1) + ')'))].slice(0, 6).join(' | '));
    else console.log(`ok s${i} type`);
  }

  // The cover ends mixed: three need you (oldest first, by age), five keep working; waits read as ages.
  await page.goto(url + '?hold=final&n=c#1');
  await page.waitForFunction(() => window.__deckReady);
  const cover = await page.evaluate(() => {
    const s = document.getElementById('s1');
    const rows = [...s.querySelectorAll('.q-row')].map((r) => ({ y: +getComputedStyle(r).transform.split(',')[5]?.replace(')', '') || 0, pill: r.children[2].textContent.trim(), tm: r.children[3].textContent.trim(), w: r.dataset.w }));
    rows.sort((a, b) => a.y - b.y);
    return { rows, count: s.querySelector('[data-a="qcount"]').textContent };
  });
  const asking = cover.rows.filter((r) => r.pill === 'needs you');
  if (asking.length !== 3 || cover.rows.filter((r) => r.pill === 'working').length !== 5) fail('s1: expected 3 needs you and 5 working, got ' + cover.rows.map((r) => r.pill).join(', '));
  if (cover.count !== '3') fail('s1: header count ' + cover.count);
  if (cover.rows.slice(0, 3).some((r) => r.pill !== 'needs you')) fail('s1: the three waits are not ranked on top');
  if (asking.map((r) => r.w).join() !== 'w3,w2,w1') fail('s1: wait tiers by age, oldest first, got ' + asking.map((r) => r.w).join());
  if (asking.some((r) => !/^\d+(m \d\ds|s|h \d\dm)$/.test(r.tm))) fail('s1: waits should read as ages: ' + asking.map((r) => r.tm).join(', '));
  if (!fails.some((f) => f.startsWith('s1:'))) console.log('ok s1 queue: ' + asking.map((r) => r.tm).join(', '));

  // The close: each wait is merged and says how long it waited; nothing waits; one clear line.
  await page.goto(url + '?hold=final&n=a#14');
  await page.waitForFunction(() => window.__deckReady);
  const close = await page.evaluate(() => {
    const s = document.getElementById('s14');
    return { rows: [...s.querySelectorAll('[data-a="flist"] .q-row')].map((r) => r.children[2].textContent.trim() + ' / ' + r.children[3].textContent.trim()), count: s.querySelector('[data-a="fcount"]').textContent, line: s.querySelector('[data-a="close"]').textContent.trim() };
  });
  if (close.rows.length !== 3 || close.rows.some((r) => !/^merged \/ waited \d+m$/.test(r))) fail('s14: rows should read "merged / waited Nm": ' + close.rows.join(' | '));
  if (close.count !== '0') fail('s14: header count ' + close.count);
  if (close.line.split(/[.!?](\s|$)/).filter((x) => x && x.trim()).length !== 1) fail('s14: the close should be one line: ' + close.line);
  if (!fails.some((f) => f.startsWith('s14:'))) console.log('ok s14 close: ' + close.rows.join(' | '));

  // Copy that must stay out of every slide.
  const text = await page.evaluate(() => window.__deck.slides.map((s) => { const c = s.cloneNode(true); c.querySelectorAll('.notes').forEach((n) => n.remove()); return c.textContent; }).join('\n'));
  for (const re of BANNED) if (re.test(text)) fail('copy: found ' + re);
  // Copy that must stay in: the upstream credit (Kipdeck is a fork of agent-office, MIT) and a way to reach us.
  for (const re of [/agent-office \(MIT\) by webdevcody \/ AgentSystemLabs/, /Ours, from 2026-09-30: the inbox and Proof of Merge/]) if (!re.test(text)) fail('copy: missing the upstream credit ' + re);
  const contact = await page.evaluate(() => [...document.querySelectorAll('#s14 [data-a="contact"] a')].map((a) => a.getAttribute('href')));
  for (const re of [/^mailto:\S+@\S+$/, /^https:\/\/kipdeck\.com\/?$/, /^https:\/\/github\.com\/zbagdzevicius\/kipdeck$/]) if (!contact.some((h) => re.test(h))) fail('s14: contact line has no link matching ' + re + ' (got ' + contact.join(', ') + ')');
  if (!fails.some((f) => f.startsWith('copy:') || f.startsWith('s14: contact'))) console.log('ok copy: upstream credit, contact links ' + contact.join(', '));

  // Phone: reading layout, no sideways scroll, no tiny text, and the footer never collides.
  const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pp = await pctx.newPage();
  pp.on('pageerror', (e) => errors.push('phone: ' + e));
  pp.on('response', (r) => { if (r.status() >= 400) errors.push('phone: ' + r.status() + ' ' + r.url()); });
  await pp.goto(url + '?static');
  await pp.waitForFunction(() => window.__deckReady);
  await pp.evaluate(() => window.__deck.finalAll());
  await pp.waitForTimeout(300);
  const sw = await pp.evaluate(() => document.documentElement.scrollWidth);
  if (sw !== 390) fail('phone: scrollWidth ' + sw);
  const psmall = (await pp.evaluate((fn) => eval(fn)(true), '(' + smallText.toString() + ')')).filter((x) => x.px < PHONE_MIN - 0.05);
  if (psmall.length) fail(`phone: text under ${PHONE_MIN}px: ` + [...new Set(psmall.map((x) => x.slide + ' ' + x.t + ' (' + x.px.toFixed(1) + ')'))].slice(0, 8).join(' | '));
  const foot = await pp.evaluate(() => [...document.querySelectorAll('.foot')].map((f) => { const [a, b] = [...f.children].map((c) => c.getBoundingClientRect()); return a.right <= b.left + 0.5 || a.bottom <= b.top + 0.5; }));
  if (foot.some((ok) => !ok)) fail('phone: footer text collides on ' + foot.filter((ok) => !ok).length + ' slides');
  if (!fails.some((f) => f.startsWith('phone'))) console.log('ok phone');

  /* Live playback: held frames and print jump straight to the end, so a motion bug that ends blank
     (a CSS transition fighting a GSAP tween) passes every check above. Play slides 1 and 14 for real. */
  const queueState = (sel, countSel) => {
    const rows = [...document.querySelectorAll(sel)].map((r) => {
      const cs = getComputedStyle(r);
      return { op: +cs.opacity, vis: cs.visibility, kid: +getComputedStyle(r.children[1]).opacity, calm: r.classList.contains('calm') };
    });
    return { rows, count: document.querySelector(countSel).textContent };
  };
  const liveCheck = async (pg, label, idx, sel, countSel, want) => {
    await pg.waitForFunction((i) => window.__deck.tl(i) && window.__deck.tl(i).progress() === 1, idx, { timeout: 15000 });
    await pg.waitForTimeout(600);   // let any CSS transition settle after the timeline ends
    const st = await pg.evaluate(({ sel, countSel }) => (0, eval)('(' + window.__qs + ')')(sel, countSel), { sel, countSel });
    const hidden = st.rows.filter((r) => r.op < 0.6 || r.vis !== 'visible');
    if (st.rows.length !== want.rows || hidden.length) fail(`${label}: ${hidden.length} of ${st.rows.length} queue rows invisible after live playback`);
    if (st.count !== want.count) fail(`${label}: header count ${st.count}, expected ${want.count}`);
    if (want.calm && !st.rows.filter((r) => r.calm).every((r) => r.kid < 0.8)) fail(`${label}: working rows are not dimmed`);
    if (!fails.some((f) => f.startsWith(label))) console.log(`ok ${label}`);
  };
  const S1 = ['#s1 .q-row', '#s1 [data-a="qcount"]', { rows: 8, count: '3', calm: true }];
  const S14 = ['#s14 [data-a="flist"] .q-row', '#s14 [data-a="fcount"]', { rows: 3, count: '0' }];
  const qsSrc = queueState.toString();

  const lctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const lp = await lctx.newPage();
  lp.on('pageerror', (e) => errors.push('live: ' + e));
  await lp.addInitScript((src) => { window.__qs = src; }, qsSrc);
  await lp.goto(url + '#1');
  await lp.waitForFunction(() => window.__deckReady);
  await liveCheck(lp, 'live s1 desktop', 0, ...S1);
  await lp.goto(url + '#14');
  await lp.waitForFunction(() => window.__deckReady);
  await liveCheck(lp, 'live s14 desktop', 13, ...S14);

  const fctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const fp = await fctx.newPage();
  fp.on('pageerror', (e) => errors.push('live phone: ' + e));
  await fp.addInitScript((src) => { window.__qs = src; }, qsSrc);
  await fp.goto(url);
  await fp.waitForFunction(() => window.__deckReady);
  await liveCheck(fp, 'live s1 phone', 0, ...S1);
  await fp.evaluate(() => document.getElementById('s14').scrollIntoView());
  // On a phone the close must not sit as an empty band: the queue is up within a second of arriving.
  await fp.waitForFunction(() => document.getElementById('s14').dataset.played === '1');
  await fp.waitForTimeout(1000);
  const early = await fp.evaluate(() => [...document.querySelectorAll('#s14 [data-a="flist"] .q-row')].every((r) => +getComputedStyle(r.closest('[data-a="final"]')).opacity > 0.6));
  if (!early) fail('live s14 phone: the queue is not up 1 s after the slide scrolls in');
  await liveCheck(fp, 'live s14 phone', 13, ...S14);
} finally {
  await browser.close();
  server.close();
}
if (errors.length) fail('page errors:\n' + errors.join('\n'));
console.log(fails.length ? `\n${fails.length} problem(s)` : '\nall deck checks passed');
process.exit(fails.length ? 1 : 0);
