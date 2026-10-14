// The map page's and the index's styles, inline in each page (no fonts, no requests): the tokens and the
// shared chrome (BASE_CSS, with the accent colour for each theme), the flow page's sections, under the
// hood and the drawer (PAGE_CSS), and the index's cards (INDEX_CSS).

export const BASE_CSS = (accent: string, accentLight: string): string => `
:root{--bg:#0d0f13;--surface:#15181f;--surface2:#1d212a;--line:#2a2f3a;--text:#eceef2;--muted:#a1a9b6;--accent:${accent};--accent-soft:color-mix(in srgb,${accent} 12%,transparent);--accent-line:color-mix(in srgb,${accent} 55%,transparent);--on-accent:#16130f;--done:#4ade80;--progress:#60a5fa;--idle:#a1a9b6;--stuck:#f87171;--amber:#fbbf24;--l0:#60a5fa;--l1:#fbbf24;--l2:#a78bfa;--l3:#2dd4bf;--l4:#f472b6;--l5:#a3e635;--l6:#fb923c;--l7:#94a3b8;color-scheme:dark}
:root[data-theme=light]{--bg:#f6f7f9;--surface:#ffffff;--surface2:#eef0f4;--line:#d9dde4;--text:#15181e;--muted:#525a67;--accent:${accentLight};--accent-soft:color-mix(in srgb,${accentLight} 9%,transparent);--accent-line:color-mix(in srgb,${accentLight} 55%,transparent);--on-accent:#ffffff;--done:#15803d;--progress:#1d4ed8;--idle:#5b6472;--stuck:#b91c1c;--amber:#a16207;--l0:#2563eb;--l1:#b45309;--l2:#7c3aed;--l3:#0f766e;--l4:#be185d;--l5:#4d7c0f;--l6:#c2410c;--l7:#64748b;color-scheme:light}
@media print{:root{--bg:#fff;--surface:#fff;--surface2:#f1f1f1;--line:#ccc;--text:#000;--muted:#444}.icon-btn,.rail{display:none}header.top{position:static}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;scroll-padding-top:96px}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;overflow-wrap:break-word}
a{color:var(--accent)}code{font:12.5px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:var(--surface2);padding:1px 5px;border-radius:4px;overflow-wrap:anywhere}
button{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.wrap{max-width:1080px;margin:0 auto;padding-left:16px;padding-right:16px}
.sr{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.skip{position:absolute;left:-999px;top:8px;z-index:20;background:var(--surface);padding:8px 12px;border-radius:8px}.skip:focus{left:8px}
.muted{color:var(--muted)}.small{font-size:13px}
.clamp1{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:1;overflow:hidden}
.clamp2{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.st-done{color:var(--done)}.st-in-progress{color:var(--progress)}.st-not-started{color:var(--idle)}.st-stuck{color:var(--stuck)}
.g{display:inline-block;width:1.1em;text-align:center;flex:none}
.ic{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none;vertical-align:-3px}
summary{cursor:pointer;list-style:none}summary::-webkit-details-marker{display:none}
.chip{position:relative;display:inline-flex;align-items:center;gap:5px;border:1px solid var(--line);border-radius:999px;padding:2px 10px;font-size:12.5px;line-height:1.5;color:var(--text);background:var(--surface);text-decoration:none;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
a.chip:hover,summary.chip:hover{border-color:var(--accent-line)}
.chip.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;background:var(--surface2)}
.chip.muted,.chip.t-muted{color:var(--muted)}.chip.t-stuck{color:var(--stuck);border-color:color-mix(in srgb,var(--stuck) 45%,transparent)}.chip.t-done{color:var(--done);border-color:color-mix(in srgb,var(--done) 40%,transparent)}.chip.t-accent{color:var(--accent);border-color:var(--accent-line)}
.pchip{position:relative;display:inline-flex;align-items:center;gap:3px;border:1px solid var(--line);background:var(--surface2);border-radius:999px;padding:2px 10px 2px 6px;font-size:12.5px;cursor:pointer;white-space:nowrap;max-width:15em;flex:none}
.pchip span:not(.g){overflow:hidden;text-overflow:ellipsis}.pchip:hover{border-color:var(--accent-line)}
.pchip.neutral{padding-left:10px;color:var(--muted);background:transparent}
.alias{position:absolute;top:-96px;left:0;width:0;height:0}
.cmore summary{display:flex;align-items:baseline;gap:6px}.cmore summary>span:first-child{flex:0 1 auto;min-width:0}
.cmore .more::after{content:"more";color:var(--accent);font-size:12.5px;white-space:nowrap}.cmore[open] .more::after{content:"less"}
.cmore[open] summary>span:first-child{-webkit-line-clamp:unset}.cmore.fits .more{display:none}.cmore.fits summary{cursor:default}
.show-s{display:none}
/* header */
header.top{position:sticky;top:0;z-index:10;background:color-mix(in srgb,var(--bg) 90%,transparent);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.bar{display:flex;align-items:center;gap:10px;height:48px;min-width:0}
.brand{display:flex;align-items:center;gap:8px;margin:0;font-size:16px;font-weight:700;letter-spacing:-.01em;min-width:0}
.bdot{width:10px;height:10px;border-radius:50%;background:var(--accent);flex:none;box-shadow:0 0 0 4px var(--accent-soft)}
.bname{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.upd{color:var(--muted);font-size:13px;white-space:nowrap}.grow{flex:1}
@media (max-width:480px){.upd{display:none}}
.icon-btn{display:grid;place-items:center;width:44px;height:44px;margin-right:-8px;border-radius:10px;border:0;background:transparent;color:var(--muted);cursor:pointer;flex:none}
@media (hover:hover){.icon-btn:hover{color:var(--text);background:var(--surface2)}}
.icon-btn .ic{width:20px;height:20px}[data-theme=dark] .i-sun,[data-theme=light] .i-moon{display:none}
.rail ol{list-style:none;margin:0;padding:0;display:flex;align-items:center;gap:2px;height:34px}
.rail a{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 10px;border-radius:8px;color:var(--muted);text-decoration:none;font-size:13.5px;font-weight:600}
.rail li:first-child a{margin-left:-10px}
.rail a:hover{color:var(--text)}.rail a.on{color:var(--text);background:var(--surface2)}.rail a.on .num{color:var(--accent)}
.rail .num{font-size:15px}.rail .sep{color:var(--line)}.rail .lbl-s{display:none}
.rbadge,.count{display:inline-grid;place-items:center;min-width:20px;height:20px;padding:0 6px;border-radius:999px;font-size:12px;font-weight:700;letter-spacing:0;background:var(--surface2);color:var(--text);border:1px solid var(--line)}
.rbadge.warn,.count.warn{background:color-mix(in srgb,var(--stuck) 18%,transparent);color:var(--stuck);border-color:color-mix(in srgb,var(--stuck) 45%,transparent)}
.note{background:var(--accent-soft);border:1px solid var(--accent-line);padding:8px 12px;border-radius:10px;font-size:14px;margin:0 0 12px}
footer{margin:28px 0 40px;color:var(--muted);font-size:12.5px}footer code{font-size:11.5px}
.home-btn{display:inline-flex;align-items:center;gap:6px;flex:none;min-height:34px;padding:0 10px;margin-left:-6px;border-radius:10px;border:1px solid var(--line);background:var(--surface);color:var(--muted);text-decoration:none;font-size:13px;font-weight:600;white-space:nowrap}
.home-btn:hover{color:var(--text);border-color:var(--accent-line)}
.home-btn .hb-s{display:none}
@media (max-width:640px){.home-btn{padding:0 8px}.home-btn .hb-l{display:none}.home-btn .hb-s{display:inline}.hide-s{display:none!important}}
@media (pointer:coarse){.home-btn{min-height:40px;min-width:40px;justify-content:center}}
`;

export const PAGE_CSS = `
/* sections */
.desc{margin:16px 0 0;color:var(--muted);font-size:14px;max-width:92ch}
.desc summary{display:flex;align-items:baseline;gap:6px}.desc .clamp1{flex:0 1 auto}
.desc .more::after{content:"more";color:var(--accent);font-size:12.5px;white-space:nowrap}.desc[open] .more::after{content:"less"}
.desc[open] .clamp1{-webkit-line-clamp:unset}.desc.fits .more{display:none}.desc.fits summary{cursor:default}
.sec{padding-top:30px}.intro{padding-top:20px}
.sh{display:flex;align-items:center;gap:8px;margin:0 0 14px;font-size:13px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--muted)}
.sh .num{font-size:18px;color:var(--accent);letter-spacing:0}
.tagpill{font-size:11.5px;font-weight:700;letter-spacing:.02em;text-transform:none;color:var(--accent);border:1px solid var(--accent-line);border-radius:999px;padding:0 8px}
/* road */
.track{list-style:none;margin:0;padding:0;display:flex}
.node{flex:1 1 0;min-width:0;position:relative}
.conn{position:absolute;top:46px;right:50%;width:100%;height:4px;overflow:visible;z-index:0}
.conn line{stroke:var(--accent);stroke-width:3}.conn.dashed line{stroke:var(--muted);stroke-opacity:.55;stroke-width:2;stroke-dasharray:5 5}
.first-d>.conn{display:none}
.nflag{height:22px;display:flex;align-items:center;justify-content:center;gap:4px;font-size:12px;font-weight:700;color:var(--accent);white-space:nowrap}
.nflag .ic{width:14px;height:14px}
.nbtn{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;width:100%;padding:0 4px 6px;border:0;background:none;text-decoration:none;color:inherit;cursor:pointer;border-radius:12px;text-align:center}
.ndw{height:50px;display:flex;align-items:center;justify-content:center}
.ndot{width:20px;height:20px;border-radius:50%;border:2px dashed var(--muted);background:var(--bg);box-shadow:0 0 0 4px var(--bg)}
.ms-done .ndot{border:0;background:var(--accent)}
.ringw{position:relative;width:56px;height:56px;display:grid;place-items:center;border-radius:50%;background:var(--bg);box-shadow:0 0 0 4px var(--bg),0 0 0 9px var(--accent-soft)}
.ring{position:absolute;inset:0;width:100%;height:100%}.ring-bg{fill:none;stroke:var(--surface2);stroke-width:6}.ring-fg{fill:none;stroke:var(--accent);stroke-width:6;stroke-linecap:round}
.ring-t{position:relative;font-size:13px;font-weight:800}
.nlab{display:flex;flex-direction:column;align-items:center;gap:1px;margin-top:8px;min-width:0;max-width:100%}
.nlab b{font-size:13px}.focus .nlab b{color:var(--accent)}
.nname{font-size:13.5px;line-height:1.3;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;max-width:100%}
.nmeta{font-size:12px;color:var(--muted)}.ms-active .nmeta{color:var(--text);font-weight:600}
.ms-ahead .nname,.ms-ahead .nlab b{color:var(--muted)}
.nbtn:hover .nname{color:var(--accent)}.node.sel .nbtn{background:var(--surface2)}
.dbadge{margin-top:4px;font-size:11px;font-weight:700;color:var(--accent);background:var(--accent-soft);border-radius:999px;padding:0 7px;white-space:nowrap}
.more-m{display:none}.hide-d{display:none}.fold:not(.first-d){display:none}
.track.unfold .hide-d{display:block}.track.unfold .fold{display:none}.track.unfold .fold+.node>.conn{display:none}
.since{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:16px 0 0;font-size:13px}
.since-l{color:var(--muted);font-weight:600}
.since-more summary{color:var(--accent)}.since-more ul{margin:8px 0 0;padding-left:18px;color:var(--muted)}.since-more[open]{flex-basis:100%}
.checklist{margin-top:14px}
.ck{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:0 16px 4px}
.ck>summary{padding:12px 0 6px}.ck-h{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px}
.ck.ck-done p{margin:0;padding:14px 0 12px;display:flex;gap:8px;align-items:center}
.dw{margin:0 0 6px;font-size:13px;color:var(--muted)}
.items{list-style:none;margin:0;padding:0}
.it{display:flex;align-items:center;gap:10px;padding:7px 0;border-top:1px solid var(--line);min-height:44px}
.it-t{flex:1;min-width:0}.it.done .it-t{color:var(--muted)}
.ck-g{width:18px;text-align:center;flex:none;color:var(--muted);font-weight:700}
.it.next{border-left:3px solid var(--accent);margin-left:-16px;padding-left:13px;background:linear-gradient(90deg,var(--accent-soft),transparent 70%)}
.tag-next{font-size:12px;font-weight:700;color:var(--accent);white-space:nowrap;text-decoration:none}
.it.fold{display:block}.it.fold summary{color:var(--muted);font-size:13.5px;min-height:30px;display:flex;align-items:center;gap:10px}
.others{margin-top:6px}.others>summary{color:var(--muted);font-size:13.5px;min-height:44px;display:flex;align-items:center;gap:8px}.others>summary::before{content:"\\25B8";color:var(--accent)}.others[open]>summary::before{content:"\\25BE"}
.msd{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:0 16px 4px;margin-top:8px}.msd>summary{padding:10px 0}
/* next */
.next-card{display:flex;gap:16px;align-items:flex-start;background:var(--accent-soft);border:1px solid var(--accent-line);border-left:4px solid var(--accent);border-radius:14px;padding:18px 20px}
.next-card.empty{background:var(--surface);border-color:var(--line)}.next-card.empty p{margin:0}
.next-ic{flex:none;display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:var(--accent);color:var(--on-accent)}
.next-body{flex:1;min-width:0}.next-t{margin:0;font-size:20px;line-height:1.3;font-weight:650}
.next-why{margin:6px 0 0;color:var(--muted);font-size:14px}
.next-foot{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:14px}
.btn-ghost{display:inline-flex;align-items:center;gap:6px;margin-left:auto;min-height:36px;padding:4px 12px;border-radius:10px;border:1px solid var(--line);background:var(--surface);cursor:pointer;font-size:13px;font-weight:600}
.btn-ghost:hover{border-color:var(--accent-line);color:var(--accent)}.btn-ghost .ic{width:16px;height:16px}
/* needs */
.anchor{display:block;position:relative;top:-96px}
.ok-line{margin:0;color:var(--done);font-weight:600}
.dec-grid{display:grid;align-items:start;grid-template-columns:minmax(0,1fr);gap:12px}
@media (min-width:860px){.dec-grid.two{grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-flow:row dense}}
.dec{display:flex;flex-direction:column;gap:10px;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px 16px;min-width:0}
.dec:target{border-color:var(--accent)}
.dec-top{display:flex;align-items:flex-start;gap:10px}
.did{flex:none;font-size:12px;font-weight:800;color:var(--accent);border:1px solid var(--accent-line);border-radius:6px;padding:1px 6px;margin-top:1px}
.dq{flex:1;min-width:0;margin:0;font-size:15px;line-height:1.35;font-weight:650}
.raised{margin:0;font-size:12px;color:var(--muted)}
.opts{display:flex;flex-wrap:wrap;gap:8px}
.opt{display:inline-flex;align-items:center;gap:8px;min-height:44px;max-width:100%;padding:8px 12px;border-radius:10px;border:1px solid var(--line);background:var(--surface2);cursor:pointer;font-size:13.5px;text-align:left;line-height:1.3}
.opt:hover{border-color:var(--accent-line)}
.opt.is-default{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
.opt-t{min-width:0;overflow-wrap:anywhere}
.def-l{flex:none;font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--accent)}
.dec-why{font-size:13px;color:var(--muted)}.why-l{font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;margin-right:4px}
.dec-ub{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;border-top:1px dashed var(--line);padding-top:10px;font-size:13px}
.ub-l{font-size:11.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--muted)}
.wait{flex-basis:100%;color:var(--muted)}
.stuck-list{display:flex;flex-direction:column;gap:8px}.dec-grid+.stuck-list{margin-top:12px}
.stuck-row{display:flex;align-items:center;gap:12px;width:100%;min-height:44px;padding:10px 14px;text-align:left;cursor:pointer;border-radius:12px;background:color-mix(in srgb,var(--stuck) 7%,var(--surface));border:1px solid color-mix(in srgb,var(--stuck) 35%,transparent)}
.stuck-row:hover{border-color:var(--stuck)}.stuck-row:target{box-shadow:0 0 0 2px var(--stuck)}
a.stuck-row{color:inherit;text-decoration:none}.stuck-row.is-next{min-height:44px;padding:6px 14px;background:var(--surface);border-color:var(--line)}.stuck-row.is-next .sr-ic{background:var(--accent-soft);color:var(--accent)}.stuck-row.is-next:hover{border-color:var(--accent-line)}
.sr-ic{flex:none;display:grid;place-items:center;width:30px;height:30px;border-radius:8px;background:color-mix(in srgb,var(--stuck) 14%,transparent);color:var(--stuck)}
.sr-name{flex:0 1 auto;max-width:38%;font-weight:650;display:flex;gap:4px}.sr-name .g{color:var(--stuck)}
.sr-wait{flex:1;min-width:0;color:var(--muted);font-size:13.5px}
.more-needs{margin-top:8px}.more-needs>summary,.answered>summary{min-height:44px;display:flex;align-items:center;color:var(--accent);font-size:13.5px}
.answered>summary{color:var(--done)}.answered ul{margin:0 0 6px;padding-left:18px;font-size:14px}
.foot-note{margin:10px 0 0}
/* parts */
.parts-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;margin-bottom:14px}.parts-head .sh{margin:0}
.stack{flex:1 1 140px;display:flex;gap:2px;height:8px;border-radius:4px;overflow:hidden;background:var(--surface2);min-width:100px}
.seg.st-done{background:var(--done)}.seg.st-in-progress{background:var(--progress)}.seg.st-not-started{background:var(--idle);opacity:.55}.seg.st-stuck{background:var(--stuck)}
.legend{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:2px 14px;font-size:13px;color:var(--muted)}.legend li{white-space:nowrap}
.pills{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.pill{position:relative;display:flex;flex-direction:column;justify-content:center;gap:4px;min-height:58px;min-width:0;padding:9px 14px 9px 12px;background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--idle);border-radius:12px}
.pill.st-stuck{border-left-color:var(--stuck)}.pill.st-in-progress{border-left-color:var(--progress)}.pill.st-not-started{border-left-style:dashed}.pill.st-unjudged{border-left-color:var(--line)}.pill.st-unjudged .p2{padding-left:0}
.pill:hover{border-color:var(--accent-line)}.pill:target{box-shadow:0 0 0 2px var(--accent)}
.pill-btn{display:flex;align-items:center;gap:6px;min-width:0;padding:0;border:0;background:none;cursor:pointer;font-weight:650;text-align:left}
.pill-btn::after{content:"";position:absolute;inset:0;border-radius:12px}.pill-btn:focus-visible{outline:none}.pill-btn:focus-visible::after{outline:2px solid var(--accent);outline-offset:2px}
.pill .pname{color:var(--text)}.pname{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.ghost{flex:none;margin-left:auto;font-size:11.5px;font-weight:600;color:var(--muted)}
.p2{display:flex;flex-wrap:wrap;align-items:center;gap:4px 12px;padding-left:22px;font-size:12.5px;color:var(--muted)}
.see{position:relative;z-index:1;color:var(--stuck);font-weight:650;text-decoration:none}.see:hover{text-decoration:underline}
.age{margin-left:auto;padding:0 8px;border:1px solid var(--line);border-radius:999px;white-space:nowrap}.age.old{color:var(--amber);border-color:color-mix(in srgb,var(--amber) 50%,transparent)}
.cells{white-space:nowrap}.cells span[aria-hidden]{color:var(--accent)}.cells.all span[aria-hidden]{color:var(--done)}
.done-line{display:flex;flex-wrap:wrap;align-items:center;gap:0 6px;margin:12px 0 0;font-size:13.5px;color:var(--muted)}.done-line b{color:var(--text)}
.linkish{border:0;background:none;padding:6px 0;cursor:pointer;color:var(--text);text-decoration:underline;text-decoration-color:var(--line);text-underline-offset:3px;text-align:left}.linkish:hover{color:var(--accent);text-decoration-color:var(--accent)}
/* hood */
.hood{margin-top:44px;background:var(--surface);border:1px solid var(--line);border-radius:14px}
.hood>summary,.panel>summary{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;min-height:52px;padding:10px 18px}
.hood>summary b{font-size:15px}.gist{display:inline-flex;flex-wrap:wrap;align-items:center;gap:6px;color:var(--muted);font-size:13px}
.chev{display:grid;place-items:center;color:var(--muted);transition:transform .15s}.chev .ic{width:16px;height:16px}
details[open]>summary>.chev{transform:rotate(90deg)}
.panel{border-top:1px solid var(--line)}.panel>summary{min-height:46px;padding-left:28px}.panel>summary b{font-size:14px}
.panel-body{padding:4px 18px 18px 28px}
.minibars rect{fill:var(--accent)}
.treemap{width:100%;height:auto;display:block}.treemap.narrow{display:none}
.tm-part{cursor:pointer;outline:none}.tm-part .bg{stroke-width:1.5;fill-opacity:.16}
.tm-part.st-done .bg{fill:var(--done);stroke:var(--done)}.tm-part.st-in-progress .bg{fill:var(--progress);stroke:var(--progress)}
.tm-part.st-not-started .bg{fill:var(--idle);stroke:var(--idle);fill-opacity:.06;stroke-dasharray:5 4}.tm-part.st-unjudged .bg{fill:var(--idle);stroke:var(--line);fill-opacity:.08}.tm-part.st-stuck .bg{fill:var(--stuck);stroke:var(--stuck);fill-opacity:.22;stroke-width:2.5}
.tm-part:hover .bg,.tm-part:focus-visible .bg{fill-opacity:.32;stroke-width:3}
.tm-name{font-size:14px;font-weight:650;fill:var(--text)}.tm-sub{font-size:12px;fill:var(--muted)}
.tm-part.st-done .g{fill:var(--done)}.tm-part.st-in-progress .g{fill:var(--progress)}.tm-part.st-not-started .g{fill:var(--idle)}.tm-part.st-stuck .g{fill:var(--stuck)}
.tablewrap{overflow-x:auto;border:1px solid var(--line);border-radius:12px;margin-top:6px}
table{border-collapse:collapse;width:100%;font-size:13.5px}th,td{text-align:left;padding:6px 10px;border-bottom:1px solid var(--line);vertical-align:middle}
thead th{font-size:12px;color:var(--muted);font-weight:600}tbody tr:last-child>*{border-bottom:0}tbody th{font-weight:600}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.act{display:grid;grid-template-columns:minmax(0,1fr) 220px;gap:20px;align-items:start}
.heatmap{width:100%;height:auto;display:block}
.hm{fill:var(--accent)}.hm.l0{fill:var(--surface2)}.hm.l1{fill-opacity:.3}.hm.l2{fill-opacity:.52}.hm.l3{fill-opacity:.76}.hm.l4{fill-opacity:1}
.ax{font-size:10px;fill:var(--muted)}
.contrib{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.contrib li{display:flex;align-items:center;gap:8px;font-size:13.5px}.contrib .cn{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.av{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--surface2);border:1px solid var(--line);font-size:11px;font-weight:700;flex:none}
.sub-d{margin-top:10px}.sub-d>summary{color:var(--accent);font-size:13.5px;min-height:36px;display:flex;align-items:center}
.commits,.plain{list-style:none;margin:0;padding:0}.commits li,.plain li{padding:5px 0;border-bottom:1px solid var(--line);font-size:13.5px}
.branches{width:100%;height:auto;display:block}
.lane{stroke:var(--progress);stroke-width:2.5;fill:none}.lane.def{stroke:var(--accent);stroke-width:4}.lane.nobase{stroke-dasharray:4 5;stroke:var(--muted)}
.tip{fill:var(--surface);stroke:var(--progress);stroke-width:2.5}.isdef .tip{stroke:var(--accent)}.tip.has-wt{fill:var(--progress)}
.br-name{font-size:13px;font-weight:600;fill:var(--text)}.isdef .br-name{fill:var(--accent)}.br-meta{font-size:11px;fill:var(--muted)}
.wt-t{font-size:9.5px;font-weight:700;fill:var(--accent);letter-spacing:.06em}.now{stroke:var(--line);stroke-dasharray:2 3}
.wt-inline{font-size:10px;letter-spacing:.06em;font-weight:700;color:var(--accent);border:1px solid var(--accent);border-radius:4px;padding:0 4px}
.br-list{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);list-style:none;padding:0}.br-list li{padding:6px 0;border-bottom:1px solid var(--line)}
.mini-h{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:14px 0 4px}
.vitals{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px;margin:4px 0 16px}
.vitals div{background:var(--surface2);border-radius:10px;padding:8px 12px}.vitals dt{font-size:12px;color:var(--muted)}.vitals dd{margin:0;font-weight:700;font-size:16px}.vitals dd.small{font-weight:400;font-size:12.5px}
.langbar{display:flex;height:10px;border-radius:5px;overflow:hidden;gap:2px}
.lang.l0,.sw.l0{background:var(--l0)}.lang.l1,.sw.l1{background:var(--l1)}.lang.l2,.sw.l2{background:var(--l2)}.lang.l3,.sw.l3{background:var(--l3)}.lang.l4,.sw.l4{background:var(--l4)}.lang.l5,.sw.l5{background:var(--l5)}.lang.l6,.sw.l6{background:var(--l6)}.lang.l7,.sw.l7{background:var(--l7)}
.langs{list-style:none;padding:0;margin:8px 0 0;display:flex;flex-wrap:wrap;gap:4px 14px;font-size:13px}.sw{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px}
/* drawer, toast */
dialog{border:1px solid var(--line);border-radius:16px;background:var(--surface);color:var(--text);padding:0;width:min(620px,calc(100vw - 32px));max-height:calc(100vh - 48px)}
dialog::backdrop{background:rgba(0,0,0,.55)}
.dlg-body{padding:18px 22px 22px;overflow:auto;max-height:calc(100vh - 50px)}
.dr-head{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin-right:48px}.dr-head h2{margin:0;font-size:19px}.dr-head>.g{font-size:18px}
.badge{display:inline-flex;align-items:center;gap:2px;font-size:12px;font-weight:700;border:1px solid currentColor;border-radius:999px;padding:0 8px 0 4px;white-space:nowrap}
.dr-wait{display:flex;gap:10px;align-items:flex-start;background:color-mix(in srgb,var(--stuck) 8%,transparent);border:1px solid color-mix(in srgb,var(--stuck) 35%,transparent);border-radius:10px;padding:10px 12px}.dr-wait .ic{color:var(--stuck);margin-top:2px}.dr-wait span,.sr-wait,.wait,.dec-why,.next-t,.it-t,.dr-list li{overflow-wrap:anywhere}
.dr-nums{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:14px 0}.dr-nums div{background:var(--surface2);border-radius:10px;padding:6px 10px}.dr-nums dt{font-size:11.5px;color:var(--muted)}.dr-nums dd{margin:0;font-weight:700;font-size:17px}
.dlg-body h3{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:16px 0 6px}
.dr-list{list-style:none;margin:0;padding:0}.dr-list li{padding:5px 0;border-bottom:1px solid var(--line);font-size:14px}
.kind{font-size:10.5px;font-weight:800;text-transform:uppercase;color:var(--accent);margin-right:4px}
.dr-more{margin-top:14px}.dr-more>summary{color:var(--accent);font-size:13.5px;min-height:36px;display:flex;align-items:center}
.close{position:absolute;top:10px;right:10px;width:44px;height:44px;border-radius:10px;border:1px solid var(--line);background:var(--surface2);font-size:17px;cursor:pointer}
.toast{position:fixed;left:50%;bottom:24px;transform:translate(-50%,20px);opacity:0;pointer-events:none;background:var(--text);color:var(--bg);padding:10px 16px;border-radius:10px;font-size:14px;font-weight:600;transition:opacity .15s,transform .15s;z-index:30;max-width:calc(100vw - 32px)}
.toast.on{opacity:1;transform:translate(-50%,0)}
.copybox{position:fixed;left:16px;right:16px;bottom:16px;z-index:31;max-width:640px;margin:0 auto;background:var(--surface);border:1px solid var(--accent);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:8px}.copybox[hidden]{display:none}.copybox p{margin:0}.copybox code{display:block;padding:8px;user-select:all}.copybox .btn-ghost{margin-left:auto}
@media (max-width:900px){.act{grid-template-columns:1fr}}
@media (max-width:720px){.pills{grid-template-columns:1fr}}
@media (min-width:641px){.js .others{display:none}}
@media (max-width:640px){
.hide-s{display:none!important}.show-s{display:block}.it.done .pchip.neutral{display:none}.js .others:not(.need-m){display:none}.upd{font-size:12px}
.sec{padding-top:22px}.sh{margin-bottom:10px}.it{padding:4px 0;font-size:14px;gap:8px}.ck{padding:0 12px 2px}.it.next{margin-left:-12px;padding-left:9px}.dec{padding:12px;gap:8px}.dec-grid{gap:10px}.next-why{-webkit-line-clamp:1}.pill{min-height:52px;padding:7px 12px 7px 10px}.pills{gap:8px}.hood{margin-top:32px}.since{margin-top:10px}.foot-note{display:none}
.rail .lbl{display:none}.rail .lbl-s{display:inline;font-size:12px}.rail .num{font-size:14px}.rail a{gap:4px;padding:0 8px;min-height:32px;justify-content:center}.rail li:first-child a{margin-left:-8px}.rail .sep{display:none}.rail ol{gap:0;justify-content:space-between;overflow-x:auto;scrollbar-width:none}.rail .rbadge{min-width:18px;height:18px;padding:0 5px;font-size:11px}
.track .node.hide-m{display:none}.track .more-m{display:block}.track .node.fold{display:block}
.track .node>.conn{display:block}.track .node.first-m>.conn{display:none}
.conn{top:42px}.ringw{width:48px;height:48px}.ndw{height:44px}
.nname{font-size:12.5px}.nflag{font-size:11px}
.next-card{padding:14px;gap:12px}.next-ic{width:32px;height:32px}.next-t{font-size:17px}.btn-ghost{margin-left:0}
.stuck-row{flex-wrap:wrap;gap:6px 10px}.sr-name{max-width:calc(100% - 44px)}.sr-wait{flex-basis:100%}

.treemap.wide{display:none}.treemap.narrow{display:block}.br-svg{display:none}.br-list{position:static;width:auto;height:auto;margin:0;overflow:visible;clip:auto}
.panel>summary,.panel-body{padding-left:18px}
.parts-t th:nth-child(4),.parts-t td:nth-child(4),.parts-t th:nth-child(6),.parts-t td:nth-child(6),.parts-t th:nth-child(8),.parts-t td:nth-child(8){display:none}
.dr-nums{grid-template-columns:repeat(2,minmax(0,1fr))}
dialog{width:100vw;max-width:100vw;height:100dvh;max-height:100dvh;margin:0;border-radius:0;border:0}.dlg-body{max-height:100dvh}
}
@media (max-width:380px){.age{margin-left:0}.p2{padding-left:0}}
@media (pointer:coarse){.chip,.pchip{min-height:32px}}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important;scroll-behavior:auto!important}}
`;

export const INDEX_CSS = `
.help{margin:16px 0 14px;font-size:14px}
.q{display:block;width:100%;max-width:420px;margin:0 0 14px;padding:9px 12px;font:inherit;font-size:14px;color:var(--text);background:var(--surface);border:1px solid var(--line);border-radius:10px}
.q:focus{border-color:var(--accent-line);outline:none}
.pcs{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,340px),1fr));gap:12px}
.pc{position:relative;display:flex;flex-direction:column;gap:6px;min-width:0;padding:12px 14px;background:var(--surface);border:1px solid var(--line);border-radius:14px}
.pc:hover{border-color:var(--accent-line)}
.pc[hidden]{display:none}
.pc-top{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;min-width:0}
.pc-name{flex:1 1 auto;min-width:0;font-size:16px;font-weight:700;color:var(--text);text-decoration:none;overflow-wrap:anywhere}
.pc-name::after{content:"";position:absolute;inset:0;z-index:1;border-radius:14px}.pc-name:focus-visible{outline:none}.pc-name:focus-visible::after{outline:2px solid var(--accent);outline-offset:2px}
.pc-name:hover{color:var(--accent)}
.needs-b{display:inline-flex;align-items:center;gap:4px;flex:none;white-space:nowrap;padding:0 7px;border-radius:999px;font-size:12px;font-weight:700;color:var(--stuck);background:color-mix(in srgb,var(--stuck) 14%,transparent);border:1px solid color-mix(in srgb,var(--stuck) 40%,transparent)}.needs-b .ic{width:13px;height:13px}
.pc-age{margin-left:auto;display:inline-flex;align-items:center;gap:6px;flex:none;font-size:12.5px;color:var(--muted);white-space:nowrap}
.stale-m{font-size:11px;font-weight:700;color:var(--amber);border:1px solid color-mix(in srgb,var(--amber) 50%,transparent);border-radius:999px;padding:0 6px}
.pc-path{display:flex;align-items:center;gap:8px;min-width:0;font:12px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted)}
.pp{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:rtl;text-align:left}
.pc-br{flex:none;max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 6px;border-radius:999px;background:var(--surface2);color:var(--text)}
.pc-road{display:flex;align-items:center;gap:6px;min-width:0;font-size:13.5px;white-space:nowrap}
.ms-id{color:var(--accent)}.ms-n{overflow:hidden;text-overflow:ellipsis;min-width:0}.ms-c{font-variant-numeric:tabular-nums;color:var(--muted)}
.pbar{flex:none;display:inline-block;width:56px;height:6px;border-radius:3px;background:var(--surface2);overflow:hidden}.pbar span{display:block;height:100%;background:var(--accent)}
.pc-next{margin:0;font-size:13.5px}.pc-next .arrow{color:var(--accent)}
.pc-parts{display:flex;flex-wrap:wrap;gap:2px 12px;font-size:13px;color:var(--muted)}
.pc.stale .pc-name{color:var(--muted)}
`;
