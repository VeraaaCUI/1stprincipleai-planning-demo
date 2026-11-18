import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const html = read('index.html');
const app = read('app.js');
const journey = read('owner-test.js');
const auth = read('auth-client.js');
const engine = read('owner-test-engine.js');

test('existing website loads one assessment journey with the synthetic adapter', () => {
  assert.match(html, /owner-test\.css/);
  assert.match(html, /owner-test-engine\.js/);
  assert.match(html, /owner-test\.js/);
  assert.doesNotMatch(html, /owner-test-home|owner-test-root/);
  assert.match(app, /configureSyntheticJourney/);
  assert.match(read('council-map.js'), /propertyProjectId==='granny'/);
  assert.match(read('council-map.js'), /assessmentContent\.append\(assessmentRoot,syntheticRoot/);
  assert.doesNotMatch(app, /ownerTestApi|owner-test-home/);
  assert.match(journey, /TEST MODE — SYNTHETIC ASSESSMENT/);
});

test('legacy owner route redirects into the existing property journey and has no nav entry', () => {
  assert.match(app, /if\(route==='owner-test'\)route='property'/);
  assert.doesNotMatch(read('site-navigation.js'), /Owner test|owner-test/);
});

test('owner access is derived from server-managed Auth metadata', () => {
  assert.match(auth, /getUser\(\)/);
  assert.match(auth, /appMetadata\.owner_test === true/);
  assert.match(auth, /appMetadata\.roles\.includes\('owner_test'\)/);
  assert.doesNotMatch(journey, /localStorage.*owner_test|searchParams.*owner_test|location\.search.*owner_test/);
});

test('synthetic journey does not import private Runner or Blind Test package material', () => {
  assert.doesNotMatch(journey, /hawkesbury-35-29|runner\.mjs|decision-trees|answer-key|scoring-workbook|Blind Test/i);
  assert.doesNotMatch(html, /hawkesbury-35-29|decision-trees|answer-key|scoring-workbook/i);
});

test('PDF intake remains local and explicitly unverified', () => {
  assert.match(journey, /FirstPrinciplePDFIntake/);
  assert.match(journey, /does not upload, OCR, measure or verify/);
  assert.match(read('pdf-intake.js'), /No file upload or AI model request/);
});

test('embedded journey is explicit opt-in and owner-scoped cloud writes remain explicit', () => {
  assert.match(journey, /options\.embedded === true/);
  assert.match(journey, /The existing Save Project action remains optional/);
  assert.doesNotMatch(journey, /createProject|updateProject|upsertProject|cloudRepository/);
  const projects = read('local-projects.js');
  assert.match(projects, /async function save\(input=\{\}\)/);
  assert.match(projects, /const token=capture\(\)/);
  assert.match(projects, /assertCurrent\(token\)/);
  assert.match(projects, /token\.repository\.createProject/);
  assert.match(projects, /token\.repository\.updateProject/);
});

test('owner changes clear and redact in-memory document state', () => {
  assert.match(journey, /function resetPdfState\(\)/);
  assert.match(journey, /was !== nextOwnerId/);
  assert.match(journey, /authorized \? \{\.\.\.pdfSnapshot\} : \{status: 'empty'/);
});

test('synthetic adapter cannot be converted to a real property by caller fields', () => {
  assert.match(engine, /next\.property = \{kind: 'synthetic'/);
  assert.doesNotMatch(engine, /lot: 'Lot 1 \/ DP-SYNTHETIC', \.\.\.property/);
});

test('ordinary journey keeps cloud writes explicit and report/PDF data outside Project v1', () => {
  const projects = read('project-repository.js');
  assert.match(projects, /const CONTEXT_FIELDS/);
  assert.doesNotMatch(projects, /answers|confidence|pdfSnapshot|syntheticReading/);
  assert.match(journey, /answers, this synthetic Reading and PDF details remain temporary/);
});
