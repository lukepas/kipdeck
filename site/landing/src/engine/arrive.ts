// One shot when an element arrives where the reader is looking: any part of it has risen above the
// line `at` of the way down the viewport (three quarters by default). Unlike an
// IntersectionObserver threshold this works for an element taller than the window: a threshold of
// 0.3 on a 1,500 px table can never be met in a 375 px landscape window, so a reveal gated on it
// would never play. Scenes use it to start decoration; nothing readable may wait on it.

export function onArrive(el: Element, fn: () => void, at = 0.75): () => void {
  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      fn();
    },
    { rootMargin: `0px 0px -${Math.round((1 - at) * 100)}% 0px` },
  );
  io.observe(el);
  return () => io.disconnect();
}
