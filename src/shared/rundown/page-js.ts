// The map page's and the index's small inline scripts. The page reads fine without them; they add the
// theme toggle (remembered per browser), relative times, the part drawer (a dialog with a close button,
// Esc closes it), milestone switching on the road, Copy as prompt and the option buttons (with a manual
// copy box when the clipboard is refused), the section rail highlight, and the index's filter box.

/** A card is marked stale after this many days without a new render. */
export const STALE_DAYS = 14;

const JS_THEME = `function get(k){try{return localStorage.getItem(k)}catch(e){return null}}
function put(k,v){try{localStorage.setItem(k,v)}catch(e){}}
var tb=$('#theme');
function apply(t){root.setAttribute('data-theme',t);if(tb){tb.setAttribute('aria-pressed',t==='dark'?'true':'false');tb.title=t==='dark'?'Dark theme (click for light)':'Light theme (click for dark)'}}
var saved=get('rundown-theme');apply(saved==='light'||saved==='dark'?saved:root.getAttribute('data-theme')||'dark');
if(tb)tb.addEventListener('click',function(){var t=root.getAttribute('data-theme')==='dark'?'light':'dark';apply(t);put('rundown-theme',t)});`;
const JS_REL = `function rel(iso){var s=Math.round((Date.now()-Date.parse(iso))/1000);if(!isFinite(s))return null;if(s<60)return'just now';var u=[[31536000,'y'],[2592000,'mo'],[604800,'w'],[86400,'d'],[3600,'h'],[60,'min']];for(var i=0;i<u.length;i++)if(s>=u[i][0])return Math.floor(s/u[i][0])+u[i][1]+' ago';return'just now'}
$$('time[data-rel]').forEach(function(t){var v=rel(t.getAttribute('datetime'));if(v)t.textContent=v});`;

export const PAGE_JS = `
(function(){
var d=document,root=d.documentElement;root.classList.add('js');
function $(s,c){return (c||d).querySelector(s)}
function $$(s,c){return Array.prototype.slice.call((c||d).querySelectorAll(s))}
${JS_THEME}
var calm=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
function reveal(el){for(var p=el;p;p=p.parentElement)if(p.tagName==='DETAILS'&&!p.open)p.open=true}
function go(id){var el=d.getElementById(id);if(!el)return false;reveal(el);el.scrollIntoView({block:'start',behavior:calm?'auto':'smooth'});if(!/^(A|BUTTON|SUMMARY|DETAILS)$/.test(el.tagName)&&!el.hasAttribute('tabindex'))el.setAttribute('tabindex','-1');try{el.focus({preventScroll:true})}catch(e){}return true}
var dlg=$('#drawer'),body=$('#drawer-body'),last=null;
function openPart(id){var tpl=d.getElementById('tpl-'+id);if(!tpl||!dlg)return false;last=d.activeElement;body.innerHTML='';body.appendChild(tpl.content.cloneNode(true));var h=body.querySelector('h2');if(h)$('#drawer-title').textContent=h.textContent;if(dlg.showModal)dlg.showModal();else dlg.setAttribute('open','');var c=dlg.querySelector('.close');if(c)c.focus();return true}
function closeDlg(){if(!dlg)return;if(dlg.close)dlg.close();else dlg.removeAttribute('open')}
if(dlg){dlg.querySelector('.close').addEventListener('click',closeDlg);dlg.addEventListener('click',function(e){if(e.target===dlg)closeDlg()});dlg.addEventListener('close',function(){if(last&&last.focus)last.focus();last=null})}
var toast=$('#toast'),tt;
function say(m){toast.textContent=m;toast.classList.add('on');clearTimeout(tt);tt=setTimeout(function(){toast.classList.remove('on')},2600)}
function manual(text){var box=$('#copybox'),c=$('#copybox code');c.textContent=text;box.hidden=false;var rg=d.createRange();rg.selectNodeContents(c);var s=getSelection();s.removeAllRanges();s.addRange(rg);say('Press Cmd/Ctrl+C to copy')}
function legacy(text,msg){var ta=d.createElement('textarea');ta.value=text;ta.setAttribute('readonly','');ta.style.position='fixed';ta.style.top='0';ta.style.opacity='0';d.body.appendChild(ta);ta.select();var ok=false;try{ok=d.execCommand('copy')}catch(e){}d.body.removeChild(ta);if(ok)say(msg);else manual(text)}
function copy(text,msg){if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(function(){say(msg)},function(){legacy(text,msg)})}else legacy(text,msg)}
var ck=$('#checklist'),home=ck?ck.innerHTML:'';
function selectMs(id){if(!ck)return;$$('.node.sel').forEach(function(n){n.classList.remove('sel')});var node=d.getElementById('node-'+id);var src=d.getElementById('msd-'+id);if(src){if(node)node.classList.add('sel');var c=src.cloneNode(true);c.removeAttribute('id');c.className='ck';c.open=true;ck.innerHTML='';ck.appendChild(c)}else ck.innerHTML=home}
d.addEventListener('click',function(e){
var t=e.target;if(!t||!t.closest)return;var a;
if((a=t.closest('[data-copy]'))){e.preventDefault();copy(a.getAttribute('data-copy'),a.getAttribute('data-toast')||'Copied');return}
if(t.closest('[data-hide-copybox]')){$('#copybox').hidden=true;return}
if(!t.closest('a.see')&&(a=t.closest('[data-open-part]'))){if(openPart(a.getAttribute('data-open-part')))e.preventDefault();return}
if((a=t.closest('[data-ms]'))){e.preventDefault();selectMs(a.getAttribute('data-ms'));return}
if((a=t.closest('[data-unfold]'))){e.preventDefault();if(window.innerWidth<640)go('ms-others');else{var tr=$('.track');if(tr)tr.classList.add('unfold')}return}
if((a=t.closest('[data-select-ms]'))){e.preventDefault();selectMs(a.getAttribute('data-select-ms'));go('road');return}
if((a=t.closest('a[href^="#"]'))){var id=a.getAttribute('href').slice(1);if(!id)return;if(dlg&&dlg.open&&dlg.contains(a)){last=null;closeDlg()}if(go(id)){e.preventDefault();try{history.replaceState(null,'','#'+id)}catch(x){}}}
});
d.addEventListener('keydown',function(e){if(e.key!=='Enter'&&e.key!==' ')return;var g=e.target.closest&&e.target.closest('[role=button][data-open-part]');if(g&&g.tagName!=='BUTTON'){e.preventDefault();openPart(g.getAttribute('data-open-part'))}});
if(location.hash.length>1){var hel=d.getElementById(location.hash.slice(1));if(hel){reveal(hel);setTimeout(function(){hel.scrollIntoView()},0)}}
var hood=$('#hood');if(hood){if(get('rundown-hood')==='1')hood.open=true;hood.addEventListener('toggle',function(){put('rundown-hood',hood.open?'1':'0')})}
var links=$$('.rail a[data-rail]');
if('IntersectionObserver' in window&&links.length){var vis={};var io=new IntersectionObserver(function(es){es.forEach(function(x){vis[x.target.id]=x.isIntersecting});var cur=null;for(var i=0;i<links.length;i++){if(vis[links[i].getAttribute('data-rail')]){cur=links[i];break}}links.forEach(function(l){l.classList.toggle('on',l===cur);if(l===cur)l.setAttribute('aria-current','location');else l.removeAttribute('aria-current')})},{rootMargin:'-90px 0px -45% 0px'});links.forEach(function(l){var s=d.getElementById(l.getAttribute('data-rail'));if(s)io.observe(s)})}
function fit(){$$('.desc,.cmore').forEach(function(x){if(x.open)return;var c=x.querySelector('summary>span');x.classList.toggle('fits',!!c&&c.scrollHeight<=c.clientHeight+1)})}fit();
var rt;window.addEventListener('resize',function(){clearTimeout(rt);rt=setTimeout(fit,150)});d.addEventListener('toggle',function(e){if(e.target.id==='hood'||e.target.classList.contains('more-needs'))fit()},true);
d.addEventListener('click',function(e){var sm=e.target.closest&&e.target.closest('.fits>summary');if(sm&&!e.target.closest('a,button'))e.preventDefault()},true);
${JS_REL}
})();`;

export const INDEX_JS = `
(function(){
var d=document,root=d.documentElement;root.classList.add('js');
function $(s,c){return (c||d).querySelector(s)}
function $$(s,c){return Array.prototype.slice.call((c||d).querySelectorAll(s))}
${JS_THEME}
${JS_REL}
var q=$('#q'),cards=$$('#pcs > li'),none=$('#nomatch');
// A card goes stale while the page sits open or unrefreshed for days.
cards.forEach(function(c){var t=c.querySelector('time[datetime]');if(!t||c.classList.contains('stale'))return;if(Date.now()-Date.parse(t.getAttribute('datetime'))>${STALE_DAYS}*864e5){c.classList.add('stale');var m=d.createElement('span');m.className='stale-m';m.textContent='stale';t.parentNode.insertBefore(m,t)}});
if(q)q.addEventListener('input',function(){var v=q.value.trim().toLowerCase(),n=0;cards.forEach(function(c){var hit=!v||c.getAttribute('data-q').indexOf(v)!==-1;c.hidden=!hit;if(hit)n++});if(none)none.hidden=n>0});
})();`;
