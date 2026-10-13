// A small stand-in for the browser's DOM, enough for the window primitive (src/client/ui/dom.ts and
// ui/dialog.ts) to run under node:test: elements with attributes, classes and children, a few CSS
// selectors, focus, and a <dialog> with showModal() and close(). Events are Node's own EventTarget, so
// they don't bubble: a test dispatches on the element it means. No package to install for it.

class FakeNode extends EventTarget {
  parentNode: FakeElement | null = null;
  get nextSibling(): FakeNode | null {
    const p = this.parentNode;
    if (!p) return null;
    return p.childNodes[p.childNodes.indexOf(this) + 1] ?? null;
  }
  get isConnected(): boolean {
    let n: FakeNode | null = this;
    while (n.parentNode) n = n.parentNode;
    return n === fakeDocument.documentElement;
  }
  remove() {
    const p = this.parentNode;
    if (!p) return;
    p.childNodes.splice(p.childNodes.indexOf(this), 1);
    this.parentNode = null;
    if (fakeDocument.activeElement && !fakeDocument.activeElement.isConnected) fakeDocument.activeElement = fakeDocument.body;
  }
}

class FakeText extends FakeNode {
  constructor(public data: string) {
    super();
  }
}

/** One compound selector: `tag.class[attr="v"]:not([attr])`, maybe `:scope > ` first. */
interface Simple {
  child: boolean;
  tag?: string;
  classes: string[];
  attrs: { name: string; value?: string; not: boolean }[];
}

function parse(selector: string): Simple[] {
  return selector.split(',').map((part) => {
    let s = part.trim();
    const child = s.startsWith(':scope >');
    if (child) s = s.slice(':scope >'.length).trim();
    const out: Simple = { child, classes: [], attrs: [] };
    const tag = /^[a-z][a-z0-9-]*/i.exec(s);
    if (tag) out.tag = tag[0].toLowerCase();
    for (const m of s.matchAll(/(:not\()?\[([a-z-]+)(?:="([^"]*)")?\]\)?/g)) out.attrs.push({ name: m[2], value: m[3], not: !!m[1] });
    for (const m of s.replace(/\[[^\]]*\]/g, '').matchAll(/\.([\w-]+)/g)) out.classes.push(m[1]);
    return out;
  });
}

function matches(el: FakeElement, s: Simple): boolean {
  if (s.tag && el.localName !== s.tag) return false;
  if (s.classes.some((c) => !el.classList.contains(c))) return false;
  return s.attrs.every((a) => {
    const v = el.getAttribute(a.name);
    const hit = v !== null && (a.value === undefined || v === a.value);
    return a.not ? !hit : hit;
  });
}

class FakeClassList {
  constructor(private el: FakeElement) {}
  private get list() {
    return (this.el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
  }
  contains(c: string) {
    return this.list.includes(c);
  }
  add(...cs: string[]) {
    this.el.setAttribute('class', [...new Set([...this.list, ...cs])].join(' '));
  }
  remove(...cs: string[]) {
    this.el.setAttribute('class', this.list.filter((c) => !cs.includes(c)).join(' '));
  }
  toggle(c: string, force?: boolean) {
    const on = force ?? !this.contains(c);
    if (on) this.add(c);
    else this.remove(c);
    return on;
  }
}

export class FakeElement extends FakeNode {
  childNodes: FakeNode[] = [];
  attributes = new Map<string, string>();
  style: Record<string, string> = {};
  classList = new FakeClassList(this);
  /** Set by a test for an element the browser wouldn't focus (hidden, in an inert page). */
  unfocusable = false;
  open = false;
  constructor(public localName: string) {
    super();
  }
  get tagName() {
    return this.localName.toUpperCase();
  }
  get id() {
    return this.getAttribute('id') ?? '';
  }
  set id(v: string) {
    this.setAttribute('id', v);
  }
  get className() {
    return this.getAttribute('class') ?? '';
  }
  set className(v: string) {
    this.setAttribute('class', v);
  }
  get children(): FakeElement[] {
    return this.childNodes.filter((n): n is FakeElement => n instanceof FakeElement);
  }
  get firstElementChild() {
    return this.children[0] ?? null;
  }
  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, String(value));
  }
  hasAttribute(name: string) {
    return this.attributes.has(name);
  }
  removeAttribute(name: string) {
    this.attributes.delete(name);
  }
  append(...nodes: (FakeNode | string)[]) {
    for (const n of nodes) this.insertBefore(typeof n === 'string' ? new FakeText(n) : n, null);
  }
  insertBefore(node: FakeNode, ref: FakeNode | null) {
    node.remove();
    node.parentNode = this;
    const i = ref ? this.childNodes.indexOf(ref) : -1;
    if (i < 0) this.childNodes.push(node);
    else this.childNodes.splice(i, 0, node);
    return node;
  }
  replaceChildren(...nodes: FakeNode[]) {
    for (const n of [...this.childNodes]) n.remove();
    this.append(...nodes);
  }
  contains(other: FakeNode | null): boolean {
    for (let n = other; n; n = n.parentNode) if (n === this) return true;
    return false;
  }
  /** Every element under this one, in document order. */
  descendants(): FakeElement[] {
    return this.children.flatMap((c) => [c, ...c.descendants()]);
  }
  querySelectorAll(selector: string): FakeElement[] {
    const parts = parse(selector);
    return this.descendants().filter((el) => parts.some((s) => (!s.child || el.parentNode === this) && matches(el, s)));
  }
  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  /** This element or its nearest ancestor that matches. */
  closest(selector: string): FakeElement | null {
    const parts = parse(selector);
    for (let n: FakeNode | null = this; n instanceof FakeElement; n = n.parentNode) if (parts.some((s) => matches(n as FakeElement, s))) return n;
    return null;
  }
  focus() {
    if (this.unfocusable || !this.isConnected) return;
    fakeDocument.activeElement = this;
  }
  blur() {
    if (fakeDocument.activeElement === this) fakeDocument.activeElement = fakeDocument.body;
  }
  /** Whether it's showing: not under an element with the hidden attribute or class. */
  checkVisibility() {
    for (let n: FakeNode | null = this; n instanceof FakeElement; n = n.parentNode) if (n.hasAttribute('hidden') || n.classList.contains('hidden')) return false;
    return true;
  }
  getBoundingClientRect() {
    return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }
  showModal() {
    this.open = true;
    this.setAttribute('open', '');
  }
  close() {
    if (!this.open) return;
    this.open = false;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  }
}

/** A <template>: what's set as its innerHTML comes back as one element (an icon's <svg>). */
class FakeTemplate extends FakeElement {
  content = new FakeElement('#fragment');
  set innerHTML(html: string) {
    const tag = /^<([a-z]+)/i.exec(html)?.[1] ?? 'span';
    this.content.replaceChildren(new FakeElement(tag));
  }
}

const documentElement = new FakeElement('html');
const body = new FakeElement('body');
documentElement.append(body);

export const fakeDocument = {
  documentElement,
  body,
  activeElement: body as FakeElement | null,
  pointerLockElement: null as FakeElement | null,
  createElement(tag: string) {
    return tag === 'template' ? new FakeTemplate(tag) : new FakeElement(tag);
  },
  /** An SVG element (the pairing QR code): the namespace is not kept. */
  createElementNS(_ns: string, tag: string) {
    return new FakeElement(tag);
  },
  getElementById(id: string) {
    return documentElement.descendants().find((el) => el.id === id) ?? null;
  },
  querySelector(selector: string) {
    return documentElement.querySelector(selector);
  },
};

/** Puts the stand-in up as `document`, `window` and `Node`, with an empty #modal-root and #toasts in the body. */
export function installFakeDom() {
  const g = globalThis as Record<string, unknown>;
  g.document = fakeDocument;
  g.window = new EventTarget();
  g.Node = FakeNode;
  body.replaceChildren();
  const toasts = new FakeElement('div');
  toasts.id = 'toasts';
  const root = new FakeElement('div');
  root.id = 'modal-root';
  body.append(toasts, root);
  fakeDocument.activeElement = body;
  fakeDocument.pointerLockElement = null;
}

/** A key press, as the window hears it. Returns the event, to ask whether it was cancelled. */
export function press(key: string): Event {
  const e = new Event('keydown', { cancelable: true });
  Object.defineProperty(e, 'key', { value: key });
  (globalThis as unknown as { window: EventTarget }).window.dispatchEvent(e);
  return e;
}
