// The office's own settings are KIPDECK_* environment variables.
import test from 'node:test';
import assert from 'node:assert/strict';
import { brandEnv, brandEnvNames, isBrandEnv } from '../src/server/brandenv.js';
import { telemetryForbidden } from '../src/server/telemetry.js';

test('KIPDECK_<name> is the one name a setting is read under', () => {
  assert.equal(brandEnv('DEMO', { KIPDECK_DEMO: '1' }), '1');
  assert.equal(brandEnv('DEMO', {}), undefined);
  assert.equal(brandEnv('DEMO_PACE', { KIPDECK_DEMO_PACE: '' }), '', 'an empty value is still a value');
  assert.deepEqual(brandEnvNames('TELEMETRY'), ['KIPDECK_TELEMETRY']);
});

test('KIPDECK_TELEMETRY=0 keeps telemetry off', () => {
  assert.match(telemetryForbidden({ KIPDECK_TELEMETRY: '0' }, []) ?? '', /KIPDECK_TELEMETRY=0/);
  assert.equal(telemetryForbidden({}, []), undefined);
});

test('tests clear the KIPDECK_ prefix', () => {
  assert.ok(isBrandEnv('KIPDECK_DEMO'));
  assert.ok(!isBrandEnv('AGENT_OFFICE_HOME'));
});
