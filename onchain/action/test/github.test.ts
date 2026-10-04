import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHub, GitHubError } from '../src/github.js';

/** A fetch that answers `routes` (by "METHOD path") and records every request. */
function fakeFetch(routes: Record<string, { status?: number; body: unknown }>, seen: { url: string; init: RequestInit }[] = []) {
  return (async (url: string, init: RequestInit) => {
    seen.push({ url, init });
    const path = new URL(url).pathname + new URL(url).search;
    const hit = routes[`${init.method} ${path}`];
    if (!hit) return new Response('{"message":"Not Found"}', { status: 404 });
    return new Response(JSON.stringify(hit.body), { status: hit.status ?? 200 });
  }) as unknown as typeof fetch;
}

test('calls go to the API with the token, and an error names the call but never the token', async () => {
  const seen: { url: string; init: RequestInit }[] = [];
  const gh = new GitHub({ token: 'ghs_SECRET', repo: 'acme/widgets', apiUrl: 'https://ghe.example.test/api/v3/', fetch: fakeFetch({ 'GET /api/v3/repos/acme/widgets/pulls/31': { body: { number: 31 } } }, seen) });
  assert.equal((await gh.pull(31)).number, 31);
  assert.equal(seen[0].url, 'https://ghe.example.test/api/v3/repos/acme/widgets/pulls/31');
  assert.equal((seen[0].init.headers as Record<string, string>).authorization, 'Bearer ghs_SECRET');
  await assert.rejects(gh.pull(32), (e: Error) => e instanceof GitHubError && e.status === 404 && /404 to GET \/repos\/acme\/widgets\/pulls\/32/.test(e.message) && !e.message.includes('SECRET'));
});

test("a merger's permission: maintain counts by its role name, a custom role by its base permission", async () => {
  const at = (body: unknown) => new GitHub({ token: 't', repo: 'acme/widgets', fetch: fakeFetch({ 'GET /repos/acme/widgets/collaborators/maint/permission': { body } }) });
  assert.equal(await at({ permission: 'write', role_name: 'maintain' }).permission('maint'), 'maintain');
  assert.equal(await at({ permission: 'admin', role_name: 'admin' }).permission('maint'), 'admin');
  assert.equal(await at({ permission: 'write', role_name: 'release-managers' }).permission('maint'), 'write');
  assert.equal(await at({ permission: 'read', role_name: 'triage' }).permission('maint'), 'triage');
  assert.equal(await at({ permission: 'weird' }).permission('maint'), 'none');
});

test('a file is read at a ref; a missing one is undefined, other failures are errors', async () => {
  const content = Buffer.from('{"a":"b"}').toString('base64');
  const gh = new GitHub({
    token: 't',
    repo: 'acme/widgets',
    fetch: fakeFetch({
      'GET /repos/acme/widgets/contents/.github/bounty-wallets.json?ref=abc': { body: { type: 'file', encoding: 'base64', content } },
      'GET /repos/acme/widgets/contents/dir?ref=abc': { body: [{ type: 'file' }] },
      'GET /repos/acme/widgets/contents/broken?ref=abc': { status: 500, body: {} },
    }),
  });
  assert.equal(await gh.file('.github/bounty-wallets.json', 'abc'), '{"a":"b"}');
  assert.equal(await gh.file('missing.json', 'abc'), undefined);
  assert.equal(await gh.file('dir', 'abc'), undefined);
  await assert.rejects(gh.file('broken', 'abc'), /500/);
});

test('a comment is posted to the issues endpoint of the pull request', async () => {
  const seen: { url: string; init: RequestInit }[] = [];
  const gh = new GitHub({ token: 't', repo: 'acme/widgets', fetch: fakeFetch({ 'POST /repos/acme/widgets/issues/31/comments': { status: 201, body: { id: 1 } } }, seen) });
  await gh.comment(31, 'hello');
  assert.deepEqual(JSON.parse(String(seen[0].init.body)), { body: 'hello' });
});
