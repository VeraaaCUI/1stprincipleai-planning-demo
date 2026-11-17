import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');

test('service workspace identity includes property and mapped-context fields', () => {
  const source = read('advanced-services.js');
  assert.match(source, /function propertyIdentity\(value\)/);
  assert.match(source, /property\.propertyId\|\|spatial\.propertyId/);
  assert.match(source, /property\.lotLabels/);
  assert.match(source, /property\.status\|\|spatial\.status/);
  assert.match(source, /propertyIdentity\(context\)===propertyIdentity\(next\)/);
  assert.match(source, /report: \{ summary, spatialEvidence, propertyContext/);
});
test('PDF intake context key resets when property identity changes', () => {
  const source = read('pdf-intake.js');
  assert.match(source, /function contextIdentity\(context\)/);
  assert.match(source, /property\.propertyId\|\|spatial\.propertyId/);
  assert.match(source, /property\.lotLabels/);
  assert.match(source, /property\.status\|\|spatial\.status/);
  assert.match(source, /JSON\.stringify\(previous\.identity\)===JSON\.stringify\(next\.identity\)/);
  assert.match(source, /if\(!sameProperty\)reset\(\)/);
});
