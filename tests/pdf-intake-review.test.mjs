import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('PDF review exposes a clear status summary and project brief transition', () => {
  const intake = read('pdf-intake.js');
  assert.match(intake, /PDF review summary/);
  assert.match(intake, /confirmed transcription/);
  assert.match(intake, /unresolved note/);
  assert.match(intake, /unreadable page/);
  assert.match(intake, /Continue to project brief/);
  assert.match(intake, /onContinueToBrief/);
  assert.match(intake, /does not verify dimensions, design, legal compliance, approvals or site conditions/);
});
test('PDF review keeps the existing explicit brief action and local-only boundaries', () => {
  const intake = read('pdf-intake.js');
  const services = read('advanced-services.js');
  assert.match(intake, /No file upload or AI model request is being made/);
  assert.match(intake, /Unresolved and unreadable items remain unverified/);
  assert.match(services, /onContinueToBrief/);
  assert.match(services, /activateRoute\('brief',false\)/);
  assert.match(services, /function activateRoute/);
  assert.match(services, /Prepare service brief/);
  assert.match(services, /Continue to specialist support/);
  assert.match(services, /specialistSupport\.hidden = false/);
  assert.match(services, /specialistSupport\.hidden = true/);
  assert.match(services, /function continueToSpecialistSupport/);
  assert.match(services, /activateRoute\('review',false\)/);
  assert.match(services, /specialistSupport\.hidden = false/);
  assert.match(services, /specialistSupport\.hidden = true/);
  assert.match(services, /Your edited brief remains current locally; no service or contact has started/);
  assert.match(services, /focusSpecialistPanel\(\)/);
  assert.match(services, /Nothing is sent to an expert, booked, paid or lodged/);

  const routeBlock = services.slice(services.indexOf('function activateRoute'), services.indexOf('function chooseRoute'));
  assert.doesNotMatch(routeBlock, /markChanged\(\)/);
});
