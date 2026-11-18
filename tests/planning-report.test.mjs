import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const report = require('../planning-report.js');
globalThis.LynnCouncilGuidance = {
  buildGuidance() {
    return {
      steps: ['Confirm the proposal.', 'Check current planning controls.'],
      missing: ['Current planning controls remain unresolved.'],
      sources: [{title: 'General NSW guidance', url: 'https://www.planning.nsw.gov.au/', note: 'General guidance only.'}],
      scopeNote: 'General guidance only.'
    };
  },
  isPilot() { return true; },
  isOutsideCoverage() { return false; }
};

const byId = {Hawkesbury: {properties: {council_name: 'Hawkesbury City Council'}}};
const caseSelection = {
  kind: 'address', name: report.CASE.address, center: [...report.CASE.center], council_ids: ['Hawkesbury'],
  state: 'NSW', precision: 'address_point', exact: true
};
const otherSelection = {
  kind: 'address', name: '12 Example Street, Richmond NSW 2755', center: [150.75, -33.59],
  council_ids: ['Hawkesbury'], state: 'NSW', precision: 'address_point', exact: true, propertyId: '12345'
};
const secondSelection = {
  kind: 'address', name: '4 Other Road, Windsor NSW 2756', center: [150.82, -33.61],
  council_ids: ['Hawkesbury'], state: 'NSW', precision: 'address_point', exact: true, propertyId: '98765'
};
const spatialFor = (selection, id, zone) => ({
  status: 'ready', address: selection.name, retrievedAt: '2026-11-17T00:00:00.000Z',
  property: {id, lotLabels: ['1/DP' + id], sourceUrl: 'https://spatial.example/property/' + id},
  layers: {zoning: {status: 'ready', sourceUrl: 'https://spatial.example/zoning/' + id, features: [{properties: {SYM_CODE: zone}}]}}
});
test('CASE-0001 historical facts are limited to the exact example address', () => {
  const example = report.buildReport('Prepare a granny flat', caseSelection, byId);
  const other = report.buildReport('Prepare a granny flat', otherSelection, byId, spatialFor(otherSelection, '12345', 'R2'));

  assert.equal(example.caseId, 'CASE-0001');
  assert.equal(other.caseId, null);
  assert.match(example.evidenceNote, /exact CASE-0001 example address/);
  assert.doesNotMatch(other.summary, /Historical CASE-0001/);
  assert.doesNotMatch(other.evidenceNote, /CASE-0001/);
  assert.match(other.summary, /General NSW guidance/);
});

test('associated spatial attributes are carried into the selected property report', () => {
  const result = report.buildReport('Prepare a granny flat', otherSelection, byId, spatialFor(otherSelection, '12345', 'R2'));

  assert.deepEqual(result.propertyContext, {
    status: 'mapped_attributes_available', propertyId: '12345', lotLabels: ['1/DP12345'], zones: ['R2'],
    queriedAt: '2026-11-17T00:00:00.000Z', sourceUrl: 'https://spatial.example/property/12345'
  });
  assert.equal(result.preparedOn, null);
  assert.equal(result.preparedLabel, 'Prepared during this session');
  assert.match(result.evidenceNote, /General planning guidance is not a finding/);
});

test('switching addresses cannot carry the prior property context', () => {
  const first = report.buildReport('Prepare a granny flat', otherSelection, byId, spatialFor(otherSelection, '12345', 'R2'));
  const second = report.buildReport('Prepare a granny flat', secondSelection, byId, spatialFor(secondSelection, '98765', 'R3'));

  assert.equal(first.propertyContext.propertyId, '12345');
  assert.deepEqual(first.propertyContext.zones, ['R2']);
  assert.equal(second.propertyContext.propertyId, '98765');
  assert.deepEqual(second.propertyContext.zones, ['R3']);
  assert.doesNotMatch(second.evidenceNote, /12345|R2/);
});

test('unknown or unavailable mapped data remains unresolved', () => {
  const result = report.buildReport('Prepare a granny flat', otherSelection, byId, {status: 'empty', address: otherSelection.name, property: null, layers: {}});

  assert.equal(result.propertyContext.status, 'unresolved');
  assert.equal(result.propertyContext.propertyId, null);
  assert.match(result.evidenceNote, /mapped property context/);
  assert.doesNotMatch(result.summary, /Historical CASE-0001/);
});
