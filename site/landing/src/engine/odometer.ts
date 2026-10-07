// An odometer: each digit is a reel that rolls to its value (CSS draws the reel, see .odo in
// motion.css). The element's text stays exactly the value ("00:07"), so tests, copy and screen
// readers see a plain string; only the paint rolls.
//
// With `paintOnly`, a changed digit only rolls its reel and leaves the text as it was, so a tick
// causes no layout at all. That is for a counter inside something that moves by transform (the
// asking row as it climbs), where a relayout would be reported as a layout shift; the element's
// container must carry the value for assistive tech instead, or hide it from it (the hero row hides its paint-only clock).

export function odometer(el: HTMLElement, paintOnly = false): (text: string) => void {
  const cells: HTMLElement[] = [];
  let current = '';
  function build(text: string) {
    el.textContent = '';
    cells.length = 0;
    for (const ch of text) {
      const s = document.createElement('span');
      if (/\d/.test(ch)) {
        s.className = 'd';
        s.style.setProperty('--d', ch);
      }
      s.textContent = ch;
      el.append(s);
      cells.push(s);
    }
    current = text;
  }
  el.classList.add('odo');
  build(el.textContent ?? '');
  return (text: string) => {
    if (text === current) return;
    if (text.length !== current.length) return build(text);
    for (let i = 0; i < text.length; i++) {
      if (text[i] === current[i]) continue;
      const c = cells[i];
      if (!paintOnly || !c.classList.contains('d')) c.textContent = text[i];
      if (c.classList.contains('d')) c.style.setProperty('--d', text[i]);
    }
    current = text;
  };
}
