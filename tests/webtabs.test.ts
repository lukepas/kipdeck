import test from 'node:test';
import assert from 'node:assert/strict';
import { WEB_TAB_SANDBOX, webTabUrl } from '../src/shared/webtabs.js';

// A terminal's web tabs only frame another site over https (see docs/security.md).

const OFFICE = 'https://office.example.com';

test('a web tab opens https pages on other sites', () => {
  const u = webTabUrl('  https://docs.example.org/guide  ', OFFICE);
  assert.ok(u instanceof URL);
  assert.equal(u.toString(), 'https://docs.example.org/guide');
  assert.ok(webTabUrl('https://office.example.com:8443/', OFFICE) instanceof URL, 'another port is another site');
});

test("a web tab never opens the office's own pages, http, or other schemes", () => {
  for (const raw of ['https://office.example.com/', 'https://office.example.com/api/whoami', 'https://OFFICE.example.com:443/lite']) assert.match(String(webTabUrl(raw, OFFICE)), /office's own pages/, raw);
  for (const raw of ['http://192.168.1.1/', 'http://example.org/', 'javascript:alert(1)', 'data:text/html,<script>1</script>', 'file:///etc/passwd', 'blob:https://x/y']) assert.match(String(webTabUrl(raw, OFFICE)), /Only https/, raw);
  assert.match(String(webTabUrl('https://u:p@example.org/', OFFICE)), /user name/);
  assert.match(String(webTabUrl('not a url', OFFICE)), /web address/);
});

test("a framed page can't escape its sandbox through a popup or take the office's tab", () => {
  assert.doesNotMatch(WEB_TAB_SANDBOX, /allow-popups-to-escape-sandbox|allow-top-navigation|allow-modals|allow-downloads/);
});
