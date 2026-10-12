import test from 'node:test';
import assert from 'node:assert/strict';
import { agentLink, agentPath, homePath, isDeepHomePath, parseHomePath, signInUrlFor } from '../src/shared/deeplink.js';
import { nextAfterSignIn } from '../src/shared/signin-next.js';

// The inbox's addresses: an agent, a project, or everything; what they parse to, what a sign-in on the
// way comes back to, and that neither can be bent into a link off the office.

test('an agent, a project and home parse back to what built them', () => {
  for (const r of [{ kind: 'home' }, { kind: 'project', project: 'acme-shop' }, { kind: 'agent', project: 'acme-shop', agent: 'e22a2c956b6b' }, { kind: 'agent', project: 'a b', agent: 'w:1', tab: 'changes' }, { kind: 'agent', project: 'p', agent: 'w', tab: 'log' }] as const) {
    const path = homePath(r);
    const [p, q] = path.split('?');
    assert.deepEqual(parseHomePath(p, q ? `?${q}` : ''), r, path);
  }
  assert.equal(agentPath('acme-shop', 'w1'), '/a/acme-shop/w1');
  assert.equal(agentPath('acme-shop', 'w1', 'changes'), '/a/acme-shop/w1?tab=changes');
  // The terminal is the default tab, so it isn't written out.
  assert.equal(agentPath('acme-shop', 'w1', 'terminal'), '/a/acme-shop/w1');
});

test('anything else is not one of the inbox addresses', () => {
  for (const p of ['/deck', '/a', '/a/', '/a/x', '/a/x/y/z', '/p', '/p/', '/p/x/y', '/a//y', '/a/x/%2F', '/a/x/%E0%A4%A', '/q/x', 'a/x/y', '/a/%2E%2E/y', '/p/.', `/p/${'x'.repeat(200)}`]) {
    assert.equal(parseHomePath(p), undefined, p);
    assert.equal(isDeepHomePath(p), false, p);
  }
  assert.deepEqual(parseHomePath('/p/acme/'), { kind: 'project', project: 'acme' });
  assert.equal(isDeepHomePath('/'), false);
  assert.equal(isDeepHomePath('/a/x/y'), true);
  // An unknown tab is the default one.
  assert.deepEqual(parseHomePath('/a/x/y', '?tab=nope'), { kind: 'agent', project: 'x', agent: 'y' });
});

test('signing in comes back to the agent, the project or the Deck, and never leaves the office', () => {
  assert.equal(signInUrlFor('/a/acme/w1', '?tab=changes'), '/login?next=%2Fa%2Facme%2Fw1%3Ftab%3Dchanges');
  assert.equal(signInUrlFor('/p/acme'), '/login?next=%2Fp%2Facme');
  assert.equal(signInUrlFor('/deck'), '/login?next=/deck');
  assert.equal(signInUrlFor('/bridge'), '/login?next=/deck');
  assert.equal(signInUrlFor('/'), '/login');
  assert.equal(signInUrlFor('/something/else'), '/login');

  assert.equal(nextAfterSignIn('/a/acme/w1?tab=changes'), '/a/acme/w1?tab=changes');
  assert.equal(nextAfterSignIn('/p/acme'), '/p/acme');
  assert.equal(nextAfterSignIn('/deck'), '/deck');
  assert.equal(nextAfterSignIn(null), '/');
  for (const evil of ['//evil.example/a/x/y', 'https://evil.example/a/x/y', '/\\evil.example', 'javascript:alert(1)', '/login', '/api/logout', '%2F%2Fevil.example']) {
    assert.equal(nextAfterSignIn(evil), '/', evil);
  }
});

test('a link sent out of the office opens the agent at the office address', () => {
  assert.equal(agentLink('https://office.example.com/', 'acme', 'w1'), 'https://office.example.com/a/acme/w1');
  assert.equal(agentLink('https://office.tail1234.ts.net', 'a b', 'w1'), 'https://office.tail1234.ts.net/a/a%20b/w1');
});
