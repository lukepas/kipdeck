// Runs before the first paint so a chosen theme never flashes the other one. A file of its own
// because the page's CSP allows no inline script.
try {
  var t = localStorage.getItem('theme');
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
} catch (e) {}
