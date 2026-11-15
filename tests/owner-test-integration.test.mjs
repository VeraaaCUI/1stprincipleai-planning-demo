import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const html = read('index.html');
const app = read('app.js');
const journey = read('owner-test.js');
const auth = read('auth-client.js');

test('existing website owns the controlled route and loads the synthetic adapter', () => {
  assert.match(html, /owner-test\.css/);
  assert.match(html, /owner-test-engine\.js/);
  assert.match(html, /owner-test\.js/);
  assert.match(html, /id="owner-test-home"/);
  assert.match(app, /owner-test/);
  assert.match(journey, /TEST MODE — SYNTHETIC ASSESSMENT/);
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
