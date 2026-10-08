// KIPDECK_* settings, with the MERGELINE_* names from before the rename read as a quiet fallback.
import test from 'node:test';
import assert from 'node:assert/strict';
import { brandEnv, brandEnvNames, isBrandEnv } from '../src/server/brandenv.js';
import { telemetryForbidden } from '../src/server/telemetry.js';

test('KIPDECK_<name> is read first, MERGELINE_<name> when it is not set', () => {
  assert.equal(brandEnv('DEMO', { KIPDECK_DEMO: '1', MERGELINE_DEMO: 'read-only' }), '1');
  assert.equal(brandEnv('DEMO', { MERGELINE_DEMO: 'read-only' }), 'read-only');
  assert.equal(brandEnv('DEMO', {}), undefined);
  assert.equal(brandEnv('DEMO_PACE', { KIPDECK_DEMO_PACE: '', MERGELINE_DEMO_PACE: '6' }), '', 'an empty new one still wins');
  assert.deepEqual(brandEnvNames('TELEMETRY'), ['KIPDECK_TELEMETRY', 'MERGELINE_TELEMETRY']);
});

test('the old name never prints a warning', (t) => {
  const warn = t.mock.method(console, 'warn');
  const error = t.mock.method(console, 'error');
  brandEnv('TELEMETRY_URL', { MERGELINE_TELEMETRY_URL: 'https://t.example/' });
  assert.equal(warn.mock.callCount() + error.mock.callCount(), 0);
});

test('MERGELINE_TELEMETRY=0 still keeps telemetry off, as KIPDECK_TELEMETRY=0 does', () => {
  assert.match(telemetryForbidden({ MERGELINE_TELEMETRY: '0' }, []) ?? '', /MERGELINE_TELEMETRY=0/);
  assert.match(telemetryForbidden({ KIPDECK_TELEMETRY: '0' }, []) ?? '', /KIPDECK_TELEMETRY=0/);
  assert.match(telemetryForbidden({ KIPDECK_TELEMETRY: '1', MERGELINE_TELEMETRY: '0' }, []) ?? '', /MERGELINE_TELEMETRY=0/, 'either opt-out wins');
  assert.equal(telemetryForbidden({}, []), undefined);
});

test('tests clear both prefixes', () => {
  assert.ok(isBrandEnv('KIPDECK_DEMO'));
  assert.ok(isBrandEnv('MERGELINE_DEMO_PACE'));
  assert.ok(!isBrandEnv('AGENT_OFFICE_HOME'));
});
