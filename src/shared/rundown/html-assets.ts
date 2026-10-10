// The map page's own stylesheet and script, inlined into map.html (html.ts): dark by default with one
// orange accent (the saved project-map style), a light theme behind the toggle and for print, no fonts
// or requests of any kind. The script only adds what can't be drawn ahead: the theme toggle, the part
// drawer, "and N more", and "updated 3h ago" kept current.

export const PAGE_CSS = `
:root{--bg:#0e1014;--surface:#171a21;--surface2:#1f232c;--border:#2c313c;--text:#eceef2;--muted:#a8afbb;--accent:#ff8a3d;--accent-soft:rgba(255,138,61,.12);
--done:#4ade80;--progress:#60a5fa;--idle:#a8afbb;--stuck:#f87171;--h0:#1f232c;--h1:rgba(255,138,61,.28);--h2:rgba(255,138,61,.5);--h3:rgba(255,138,61,.75);--h4:#ff8a3d;color-scheme:dark}
:root[data-theme=light]{--bg:#f7f7f5;--surface:#ffffff;--surface2:#eef0f3;--border:#d5d9e0;--text:#16181d;--muted:#4b5361;--accent:#c2410c;--accent-soft:rgba(194,65,12,.08);
--done:#15803d;--progress:#1d4ed8;--idle:#5b6472;--stuck:#b91c1c;--h0:#eef0f3;--h1:rgba(194,65,12,.22);--h2:rgba(194,65,12,.45);--h3:rgba(194,65,12,.7);--h4:#c2410c;color-scheme:light}
@media print{:root{--bg:#fff;--surface:#fff;--surface2:#f1f2f4;--border:#ccc;--text:#111;--muted:#444;--accent:#c2410c;--accent-soft:#fff3ec;--done:#15803d;--progress:#1d4ed8;--idle:#555;--stuck:#b91c1c}.theme,.more-btn{display:none}}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-text-size-adjust:100%}
a{color:var(--accent)}
code,.mono{overflow-wrap:anywhere;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.92em}
.wrap{max-width:1200px;margin:0 auto;padding:0 16px 64px}
header.top{position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--border);padding:12px 0;margin-bottom:20px}
header.top .wrap{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;padding-bottom:0}
header.top h1{font-size:20px;margin:0;letter-spacing:-.01em}
.meta{color:var(--muted);font-size:13px;display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center}
.pill{border:1px solid var(--border);border-radius:999px;padding:1px 8px;font-size:12px;color:var(--muted)}
.theme{margin-left:auto;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:4px 10px;font:inherit;font-size:13px;cursor:pointer}
section{margin:28px 0}
h2{font-size:15px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:0 0 12px;font-weight:600}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr));gap:12px}
.card{min-width:0;overflow-x:auto;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px}
.card .label{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.05em}
.card .big{font-size:24px;font-weight:700;line-height:1.2;margin:4px 0}
.card .sub{color:var(--muted);font-size:13px}
.card.next{border-color:var(--accent);background:var(--accent-soft);grid-column:span 2}
@media (max-width:640px){.card.next{grid-column:auto}}
.card.next .big{font-size:17px}
.bar{display:flex;height:10px;border-radius:5px;overflow:hidden;background:var(--surface2);margin:8px 0}
.bar span{display:block;height:100%}
.legend{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:13px;color:var(--muted)}
.st{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.st svg{flex:none}
.s-done{color:var(--done)}.s-in-progress{color:var(--progress)}.s-not-started{color:var(--idle)}.s-stuck{color:var(--stuck)}
.changes{background:var(--accent-soft);border:1px solid var(--accent);border-left-width:4px;border-radius:8px;padding:12px 16px}
.needs{border:1px solid var(--stuck);border-left-width:4px;border-radius:8px;padding:10px 16px;margin:0 0 12px}.needs .label{color:var(--stuck);font-size:12px;text-transform:uppercase;letter-spacing:.05em;font-weight:700}.needs ul{margin:4px 0 0;padding-left:18px}.needs li{margin:2px 0}.needs .more-btn{font-weight:700;padding:0}
.changes ul{margin:0;padding-left:18px}.changes li{margin:2px 0}
.changes .hidden{display:none}
.more-btn{background:none;border:0;color:var(--accent);font:inherit;cursor:pointer;padding:4px 0}
.tree{width:100%;height:auto;display:block;background:var(--surface);border:1px solid var(--border);border-radius:8px}
.tree .tile{cursor:pointer;outline:none}
.tree .tile:focus .frame,.tree .tile:hover .frame{stroke:var(--accent);stroke-width:3}
.tree text{fill:var(--text);font-size:15px}
.tree .tsub{fill:var(--muted);font-size:12px}
.tree .cell{fill:none;stroke:var(--text);stroke-opacity:.12}
.tree .ctext{fill:var(--muted);font-size:11px}
.tree .wait{fill:var(--stuck);font-size:12px;font-weight:600}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--border);vertical-align:top}
th{color:var(--muted);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.04em}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
.scroll{overflow-x:auto}
.tl{list-style:none;margin:0;padding:0;display:flex;gap:0;overflow-x:auto}
.tl li{flex:1 0 150px;position:relative;padding:28px 10px 0 0}
.tl li:before{content:"";position:absolute;top:10px;left:0;right:0;height:2px;background:var(--border)}
.tl .node{position:absolute;top:2px;left:0;width:18px;height:18px;border-radius:50%;border:2px solid var(--muted);background:var(--bg)}
.tl .done .node{background:var(--done);border-color:var(--done)}
.tl .active .node{border:3px solid var(--accent);box-shadow:0 0 0 4px var(--accent-soft)}
.tl .name{font-weight:600}.tl .active .name{color:var(--accent)}
.tl .when{color:var(--muted);font-size:12px}
.items{margin:12px 0 0;padding-left:18px}
.items li.done{color:var(--muted);text-decoration:line-through}
.badge{display:inline-block;background:var(--accent);color:#111;border-radius:4px;padding:0 6px;font-size:12px;font-weight:700;margin-left:8px}
.heat{display:flex;flex-wrap:wrap;gap:16px 32px;align-items:flex-start}
.heat>div{min-width:0;max-width:100%}.heat svg{max-width:100%;height:auto}
.heat rect.d0{fill:var(--h0)}.heat rect.d1{fill:var(--h1)}.heat rect.d2{fill:var(--h2)}.heat rect.d3{fill:var(--h3)}.heat rect.d4{fill:var(--h4)}.heat rect.fut{fill:none}
.heat .axis{fill:var(--muted);font-size:10px}
.totals{display:flex;gap:16px;flex-wrap:wrap;color:var(--muted);font-size:13px}.totals b{color:var(--text);font-size:16px}
.who{list-style:none;padding:0;margin:8px 0 0;font-size:13px;columns:2;column-gap:24px}
.lanes{width:100%;height:auto;background:var(--surface);border:1px solid var(--border);border-radius:8px}
.lanes .ln{stroke:var(--progress);stroke-width:3;fill:none}.lanes .def{stroke:var(--accent)}.lanes .mg{stroke:var(--idle);stroke-opacity:.5}
.lanes text{fill:var(--text);font-size:12px}.lanes .lt{fill:var(--muted);font-size:11px}
.lanes .wt{fill:var(--accent);font-size:11px;font-weight:700}
.decs{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr));gap:12px}
.dec .q{font-weight:600;margin:4px 0 8px}
.dec ul{margin:0;padding-left:18px;font-size:14px}
.dec li.def{color:var(--accent);font-weight:600}
.dec .defline{margin-top:8px;font-size:13px}
.how{color:var(--muted);font-size:13px;margin-top:10px}
details{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:8px 14px;margin-top:10px}
summary{cursor:pointer;color:var(--muted)}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr));gap:12px}
.langbar{display:flex;height:12px;border-radius:6px;overflow:hidden;margin:6px 0}
.check{list-style:none;padding:0;margin:0;font-size:14px}.check li:before{content:"\\2717  ";color:var(--stuck)}.check li.ok:before{content:"\\2713  ";color:var(--done)}
.note{color:var(--muted);font-size:13px;overflow-wrap:anywhere}
.drawer{position:fixed;top:0;right:0;bottom:0;width:min(440px,100%);background:var(--surface);border-left:1px solid var(--border);z-index:10;overflow:auto;padding:16px;display:none;box-shadow:-8px 0 24px rgba(0,0,0,.35)}
.drawer.open{display:block}
.drawer h3{margin:0 40px 6px 0;font-size:18px}
.drawer .x{position:absolute;top:10px;right:10px;background:none;border:1px solid var(--border);color:var(--text);border-radius:6px;width:32px;height:32px;font-size:18px;cursor:pointer}
.drawer dl{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:14px}.drawer dt{color:var(--muted)}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
@media (max-width:640px){.tree{min-width:620px}.lanes{min-width:760px}.who{columns:1}header.top h1{font-size:17px}}
`;

export const PAGE_JS = `
(function(){
var data=JSON.parse(document.getElementById('rundown').textContent);
var root=document.documentElement;
function store(k,v){try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v)}catch(e){return null}}
var saved=store('rundown-theme');if(saved==='light'||saved==='dark')root.dataset.theme=saved;
var tb=document.querySelector('.theme');
function label(){tb.textContent=root.dataset.theme==='light'?'Dark':'Light'}
if(tb){label();tb.addEventListener('click',function(){root.dataset.theme=root.dataset.theme==='light'?'dark':'light';store('rundown-theme',root.dataset.theme);label()})}
var ago=document.querySelector('[data-ago]');
function rel(){if(!ago)return;var s=(Date.now()-Date.parse(ago.dataset.ago))/1000;ago.textContent=s<60?'just now':s<3600?Math.floor(s/60)+'m ago':s<86400?Math.floor(s/3600)+'h ago':Math.floor(s/86400)+'d ago'}
rel();setInterval(rel,60000);
var more=document.querySelector('.more-btn');
if(more)more.addEventListener('click',function(){document.querySelectorAll('.changes .hidden').forEach(function(li){li.classList.remove('hidden')});more.remove()});
var drawer=document.querySelector('.drawer');var last=null;
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return'&#'+c.charCodeAt(0)+';'})}
function open(id){var p=data.parts.find(function(x){return x.id===id});if(!p)return;last=document.activeElement;
var m=p.metrics;var todos=(data.facts.files.todo.locations||[]).filter(function(t){return (p.paths||[]).some(function(g){var b=g.split('/').filter(function(s){return !/[*?]/.test(s)}).join('/');return !b||t.path===b||t.path.indexOf(b+'/')===0})}).slice(0,12);
var items=[];data.milestones.forEach(function(ms){ms.items.forEach(function(it){if(it.partId===id)items.push(ms.id+': '+(it.done?'[x] ':'[ ] ')+it.text)})});
var decs=data.decisions.filter(function(d){return d.partId===id});
drawer.querySelector('.body').innerHTML='<h3>'+esc(p.name)+'</h3><p class="note">'+esc(p.summary)+'</p>'+
'<p><span class="st s-'+esc(p.status)+'">'+((document.querySelector('[data-glyph="'+esc(p.status)+'"]')||{}).innerHTML||'')+'</span>'+(p.waitingOn?' waiting on <b>'+esc(p.waitingOn)+'</b>':'')+'</p>'+
'<dl><dt>Lines</dt><dd>'+m.lines.toLocaleString()+'</dd><dt>Files</dt><dd>'+m.files+'</dd><dt>Test files</dt><dd>'+m.testFiles+'</dd><dt>TODO / FIXME</dt><dd>'+m.todo+' / '+m.fixme+'</dd><dt>Commits, 30 days</dt><dd>'+m.commits30d+'</dd><dt>Last commit</dt><dd>'+esc(m.lastCommit?m.lastCommit.slice(0,10):'none')+'</dd><dt>Uncommitted</dt><dd>'+m.uncommitted+'</dd><dt>Paths</dt><dd><code>'+esc((p.paths||[]).join(', '))+'</code></dd></dl>'+
(p.evidence.length?'<h4>Why '+esc(p.status.replace('-',' '))+'</h4><ul>'+p.evidence.map(function(e){return'<li>'+esc(e.text)+(e.ref?' <code>'+esc(e.ref)+'</code>':'')+'</li>'}).join('')+'</ul>':'')+
(items.length?'<h4>Milestone items</h4><ul>'+items.map(function(t){return'<li>'+esc(t)+'</li>'}).join('')+'</ul>':'')+
(decs.length?'<h4>Your call</h4><ul>'+decs.map(function(d){return'<li>'+esc(d.id+'. '+d.question)+'</li>'}).join('')+'</ul>':'')+
(todos.length?'<h4>TODO locations</h4><ul>'+todos.map(function(t){return'<li><code>'+esc(t.path+':'+t.line)+'</code> '+esc(t.tag)+'</li>'}).join('')+'</ul>':'');
drawer.classList.add('open');drawer.setAttribute('aria-hidden','false');drawer.querySelector('.x').focus()}
function close(){drawer.classList.remove('open');drawer.setAttribute('aria-hidden','true');if(last&&last.focus)last.focus()}
document.querySelectorAll('[data-part]').forEach(function(el){el.addEventListener('click',function(){open(el.dataset.part)});el.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();open(el.dataset.part)}})});
drawer.querySelector('.x').addEventListener('click',close);
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&drawer.classList.contains('open'))close()});
})();
`;
