import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const services = fs.readFileSync(path.join(root, 'advanced-services.js'), 'utf8');

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
  assert.match(handlers, /expertsHeading\.focus\(\)/);
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
