// Another order for a vertical list without touching its DOM: for each element, the translateY
// that draws it where it would sit if the list were in `order`. Elements left out of `order` are
// skipped (the caller hides them). The gap between two neighbours is the one the natural list
// has between elements of the same kinds (row after row overlaps by its 1px border, a section
// heading keeps its margins), so rows and headings of different heights stack truthfully.
// Measured once (offsetTop ignores transforms), applied by transform, so nothing ever shifts.

const kind = (el: HTMLElement) => (el.classList.contains('sec') ? 'sec' : 'row');

export function stackOffsets(items: HTMLElement[], order: HTMLElement[]): Map<HTMLElement, number> {
  const gaps = new Map<string, number>();
  items.forEach((el, i) => {
    const next = items[i + 1];
    if (!next) return;
    const key = `${kind(el)}>${kind(next)}`;
    if (!gaps.has(key)) gaps.set(key, next.offsetTop - el.offsetTop - el.offsetHeight);
  });
  let y = Math.min(...items.map((el) => el.offsetTop));
  const out = new Map<HTMLElement, number>();
  order.forEach((el, i) => {
    out.set(el, y - el.offsetTop);
    const next = order[i + 1];
    const gap = next ? gaps.get(`${kind(el)}>${kind(next)}`) ?? 0 : 0;
    y += el.offsetHeight + gap;
  });
  return out;
}
