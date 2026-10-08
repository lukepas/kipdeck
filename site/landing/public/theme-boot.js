// Runs before the first paint so a chosen theme never flashes the other one. A file of its own
// because the page's CSP allows no inline script. It also marks the page as scripted ("js") this
// early, so the hero's opening starts from its first frame instead of flashing its final state.
document.documentElement.classList.add('js');
try {
  var t = localStorage.getItem('theme');
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
} catch (e) {}
