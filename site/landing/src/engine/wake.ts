// The scene waker: runs a frame task only while its element is on screen (with a margin), so a
// section that is scrolled away costs nothing.
import { every, type Task } from './loop';

export function whileVisible(el: Element, task: Task, rootMargin = '0px'): () => void {
  let stop: (() => void) | null = null;
  const io = new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !stop) stop = every(task);
    else if (!e.isIntersecting && stop) {
      stop();
      stop = null;
    }
  }, { rootMargin });
  io.observe(el);
  return () => {
    io.disconnect();
    stop?.();
    stop = null;
  };
}
