import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assessmentCss = await readFile(path.join(root, 'planning-assessment.css'), 'utf8');
const servicesCss = await readFile(path.join(root, 'advanced-services.css'), 'utf8');

test('contextual assessment transition stays readable on narrow screens', () => {
  assert.match(assessmentCss, /\.fpa-next \.fpa-button\{width:100%;max-width:34rem;justify-content:flex-start;text-align:left/);
  assert.match(assessmentCss, /@media\(max-width:559px\)[^}]*\.fpa-next \.fpa-button\{max-width:none\}/);
});

test('specialist support cards expose a visible keyboard focus state', () => {
  assert.match(servicesCss, /\.fps-scope-card:focus-within,\.fps-workspace \.fps-expert-card:focus-within\{outline:3px solid #b78059;outline-offset:3px\}/);
  assert.match(servicesCss, /\.fps-agent-card\{overflow-wrap:anywhere\}/);
  assert.match(servicesCss, /@media\(max-width:700px\)[^}]*\.fps-route-cards\{grid-template-columns:1fr/);
});
