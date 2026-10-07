// The team tier waitlist: one email field. Until the build names an endpoint it checks the address
// and says plainly that nothing was sent; with one, it sends exactly { email, source } and nothing else.

export function waitlist() {
  const form = document.getElementById('waitlist-form') as HTMLFormElement | null;
  if (!form) return;
  const status = document.getElementById('status')!;
  const email = document.getElementById('email') as HTMLInputElement;
  const say = (text: string, kind: 'warn' | 'ok') => {
    status.textContent = text;
    status.className = `status ${kind}`;
  };
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const value = email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      say('Please enter a valid email address.', 'warn');
      email.focus();
      return;
    }
    const endpoint = form.getAttribute('data-endpoint');
    if (!endpoint) {
      say('Thanks. The waitlist is not open yet, so nothing was sent. Please check back soon.', 'warn');
      return;
    }
    fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: value, source: 'landing' }), credentials: 'omit', referrerPolicy: 'no-referrer' })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        form.reset();
        say("Thanks, you're on the list. We'll write once, when the team tier opens.", 'ok');
        document.querySelector('.seats li:not(.filled)')?.classList.add('filled');
      })
      .catch(() => say('That did not go through. Please try again later.', 'warn'));
  });
}
