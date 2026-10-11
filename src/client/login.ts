import { mountSigninArt } from './signin-art';
import { TAGLINE } from '../shared/copy';
import { openCommand } from '../shared/demo';
import { DECK_PATH, isDeckPath } from '../shared/deck';

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
/** Where to go once in: the Deck if that's where you were headed (see loginUrl in net.ts), else home. */
const NEXT = isDeckPath(new URLSearchParams(location.search).get('next') ?? '') ? DECK_PATH : '/';

/** Why the sign-in link didn't work (`why`, without the command) and the whole message (`error`). */
interface LinkRefusal {
  error: string;
  why?: string;
}

// A sign-in link from the office's terminal (/login#key=...): it works once, so take it out of the
// address bar and trade it for a session. The key is after the #, so it never reaches a server log.
// Resolves to why it didn't work, or to nothing when there was no link.
async function tryLink(): Promise<LinkRefusal | undefined> {
  const linkKey = new URLSearchParams(location.hash.slice(1)).get('key');
  if (!linkKey) return undefined;
  history.replaceState(null, '', location.pathname + location.search);
  try {
    const res = await fetch('/api/link', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: linkKey }) });
    if (res.ok) {
      location.replace(NEXT);
      // Signed in: the page is going away, so nothing below runs.
      return await new Promise<never>(() => {});
    }
    const body = (await res.json().catch(() => ({}))) as Partial<LinkRefusal>;
    return { error: body.error ?? 'Could not sign in', why: body.why };
  } catch {
    return { error: 'Server unreachable' };
  }
}

// On the computer the office runs on, with no password chosen for it: the way in is the terminal
// (`kipdeck open`), and the password form waits behind a link. That holds after a used or a bad
// sign-in link too: it says which, above the command that gets a new one.
const local = document.getElementById('local') as HTMLDivElement;
function showLocal(command: string | undefined, refused?: LinkRefusal) {
  local.hidden = false;
  form.hidden = true;
  sub.textContent = TAGLINE;
  const why = document.getElementById('local-why') as HTMLParagraphElement;
  why.hidden = !refused;
  why.textContent = refused ? (refused.why ?? refused.error) : '';
  // The office says how it can be typed here (node and its path, npx, or kipdeck once linked).
  const cmd = command ?? openCommand();
  // A break allowed only after a slash or a space, so a narrow screen wraps the path, never a file name.
  document.getElementById('open-cmd')!.replaceChildren(
    ...cmd.split(/(?<=[/ ])/).flatMap((part, i) => {
      const span = document.createElement('span');
      span.textContent = part;
      return i ? [document.createElement('wbr'), span] : [span];
    }),
  );
  const copy = document.getElementById('copy-cmd') as HTMLButtonElement;
  // The first Tab lands on the one thing to do here, not on the credit at the foot of the page.
  copy.focus({ preventScroll: true });
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
void tryLink()
  .then(async (refused) => {
    const opts = (await (await fetch('/api/login', { cache: 'no-store' })).json()) as { accounts: boolean; shared: boolean; local?: boolean; open?: string };
    return { refused, ...opts };
  })
  .then(({ refused, accounts, shared, local: here, open }) => {
    if (here) return showLocal(open, refused);
    if (refused) error.textContent = refused.error;
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
