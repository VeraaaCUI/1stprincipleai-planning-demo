import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const services = fs.readFileSync(path.join(root, 'advanced-services.js'), 'utf8');
const expertContact = fs.readFileSync(path.join(root, 'expert-contact.js'), 'utf8');

test('service workspace exposes direct entry actions alongside optional route cards', () => {
  assert.match(services, /Project Workspace/);
  assert.match(services, /Choose a drawing PDF/);
  assert.match(services, /Choose a drawing PDF/);
  assert.match(services, /Start without drawings/);
  assert.match(services, /Plan specialist support/);
  assert.match(services, /el\('div',null,'fps-direct-actions'\)/);
  assert.match(services, /el\('details',null,'fps-route-options'\)/);
  assert.match(services, /function chooseRoute/);
});

test('direct entry actions activate routes without resetting local PDF state', () => {
  const start = services.indexOf('function startWithDrawingPDF');
  const end = services.indexOf('function chooseRoute');
  assert.ok(start >= 0 && end > start, 'direct entry handlers should be present');
  const handlers = services.slice(start, end);
  assert.match(handlers, /activateRoute\('drawings',false\)/);
  assert.match(handlers, /activateRoute\('brief',false\)/);
  assert.match(handlers, /activateRoute\('review',false\)/);
  assert.match(handlers, /syncProject\(\)/);
  assert.match(handlers, /focusSpecialistPanel\(\)/);
  assert.doesNotMatch(handlers, /pdfApi\?\.setContext/);
  assert.doesNotMatch(handlers, /pdfState\s*=/);
  assert.doesNotMatch(handlers, /briefPrepared\s*=\s*false/);
});

test('workspace keeps service selection optional and opens the picker only from an explicit action', () => {
  assert.match(services, /let selected = new Set\(\)/);
  assert.match(services, /check\.checked = false/);
  assert.match(services, /pdfApi\?\.selectFile\(\)/);
  assert.match(services, /function replaceDrawingPDF/);
  assert.match(services, /function updateDrawingSummary/);
  assert.doesNotMatch(services, /startWithDrawingPDF\(\)[\s\S]*?fileInput\.click\(\)/);
});

test('workspace presents one primary drawing intake before roadmap and suggested tasks', () => {
  assert.match(services, /const drawingIntake=el\('section',null,'fps-primary-drawing-intake'\)/);
  assert.match(services, /drawingIntake\.append\([^;]*drawingIntakeTitle/);
  assert.match(services, /pdfRoot\.className='fps-primary-pdf-intake';drawingIntake\.append\(pdfRoot\)/);
  assert.match(services, /fps-primary-pdf-intake/);
  assert.match(services, /toolsArea\.append\(tabList,\.\.\.TOOLS\.map\(item=>panels\[item\.id\]\),routeTasks,briefSection,scopeSection\)/);
  assert.match(services, /choice\.track==='drawings'\)focusDrawingReview\(\)/);
  assert.match(services, /if\(target==='drawings'\|\|target==='documents'\)\{openDrawingReview\(\);return;\}/);
  assert.doesNotMatch(services, /drawingIntake\.append\(pdfRoot\)[\s\S]*fileInput\.click\(\)/);
});

test('brief-to-specialist transition targets the Experts panel and carries edited local content', () => {
  const start = services.indexOf('function continueToSpecialistSupport');
  const end = services.indexOf('function openTarget');
  const transition = services.slice(start, end);
  assert.match(transition, /activateRoute\('review',false\)/);
  assert.match(transition, /setTrack\('experts'\)/);
  assert.match(transition, /focusSpecialistPanel\(\)/);
  assert.match(services, /panels\.experts\.scrollIntoView\(\{block:'start',behavior:'instant'\}\)/);
  assert.match(services, /expertsHeading\.focus\(\{preventScroll:true\}\)/);
  assert.match(services, /reviewedBriefText:clip\(briefEditor\.value,30000\)/);
  assert.match(services, /briefEditor\.addEventListener\('input'/);
  assert.match(expertContact, /reviewedBriefText: clip\(project\.reviewedBriefText, 6000\)/);
  assert.match(expertContact, /CURRENT USER-REVIEWED BRIEF/);
  assert.match(expertContact, /reviewedBriefText: project\.reviewedBriefText/);
  assert.match(services, /No specialist contact or service has started/);
  assert.doesNotMatch(transition, /emailApi|fetch\(|URL\.createObjectURL|expertContacted\s*=\s*true/);
});

test('dashboard continuation targets expose local drawing and specialist entries without external actions', () => {
  assert.match(services, /function openTarget\(target\)/);
  assert.match(services, /if\(target==='drawings'\)\{openDrawingReview\(\);return true;\}/);
  assert.match(services, /if\(target==='specialists'\)\{startSpecialistSupport\(\);return true;\}/);
  assert.match(services, /openTarget/);
  assert.match(services, /no service or contact has started/i);
});
