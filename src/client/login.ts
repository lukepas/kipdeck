import { mountSigninArt } from './signin-art';

mountSigninArt();

const form = document.getElementById('form') as HTMLFormElement;
const nameRow = document.getElementById('name-row') as HTMLLabelElement;
const nameInput = document.getElementById('name') as HTMLInputElement;
const nameNote = document.getElementById('name-note') as HTMLParagraphElement;
const sub = document.getElementById('sub') as HTMLParagraphElement;
const input = document.getElementById('password') as HTMLInputElement;
const error = document.getElementById('error') as HTMLParagraphElement;
const submit = document.getElementById('submit') as HTMLButtonElement;

const NAME_KEY = 'agent-office.login-name';
/** Where to go once in: the Bridge view if that's where you were headed (see loginUrl in net.ts), else home. */
const NEXT = new URLSearchParams(location.search).get('next') === '/bridge' ? '/bridge' : '/';

// A sign-in link from the office's terminal (/login#key=...): it works once, so take it out of the
// address bar and trade it for a session. The key is after the #, so it never reaches a server log.
const linkKey = new URLSearchParams(location.hash.slice(1)).get('key');
if (linkKey) {
  history.replaceState(null, '', location.pathname + location.search);
  void fetch('/api/link', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: linkKey }) })
    .then(async (res) => {
      if (res.ok) return location.replace(NEXT);
      error.textContent = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Could not sign in';
    })
    .catch(() => void (error.textContent = 'Server unreachable'));
}

// On the computer the office runs on, with no password chosen for it: the way in is the terminal
// (`kipdeck open`), and the password form waits behind a link.
const local = document.getElementById('local') as HTMLDivElement;
function showLocal() {
  local.hidden = false;
  form.hidden = true;
  sub.textContent = 'The inbox for your AI coding agents.';
  const cmd = document.getElementById('open-cmd')!.textContent ?? '';
  const copy = document.getElementById('copy-cmd') as HTMLButtonElement;
  copy.addEventListener('click', () => {
    void navigator.clipboard?.writeText(cmd).then(
      () => (copy.textContent = 'Copied'),
      () => {},
    );
  });
  document.getElementById('use-password')!.addEventListener('click', () => {
    local.hidden = true;
    form.hidden = false;
    input.focus();
  });
}

// Ask for a name once people have accounts; it's optional while the shared password still works.
void fetch('/api/login', { cache: 'no-store' })
  .then((r) => r.json())
  .then(({ accounts, shared, local: here }: { accounts: boolean; shared: boolean; local?: boolean }) => {
    if (here && !linkKey) return showLocal();
    if (!accounts && shared) return;
    nameRow.hidden = false;
    nameInput.required = !shared;
    nameNote.hidden = !shared;
    sub.textContent = shared ? 'Sign in with your account, or the shared password.' : 'Sign in with your own account.';
    try {
      nameInput.value = localStorage.getItem(NAME_KEY) ?? '';
    } catch {
      // storage blocked
    }
    (nameInput.value ? input : nameInput).focus();
  })
  .catch(() => {});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  error.textContent = '';
  submit.disabled = true;
  const name = nameRow.hidden ? '' : nameInput.value.trim();
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, password: input.value }),
    });
    if (res.ok) {
      try {
        localStorage.setItem(NAME_KEY, name);
      } catch {
        // storage blocked
      }
      location.href = NEXT;
      return;
    }
    const body = await res.json().catch(() => ({}));
    error.textContent = body.error ?? 'Could not sign in';
    input.select();
  } catch {
    error.textContent = 'Server unreachable';
  } finally {
    submit.disabled = false;
  }
});
