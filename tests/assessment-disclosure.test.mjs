import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = await readFile(path.join(root, 'planning-assessment.css'), 'utf8');

test('property and project disclosure uses a light, aligned shell', () => {
  assert.match(css, /\.fpa-context\{margin-top:20px;padding:0;border:0;background:transparent;border-radius:0\}/);
  assert.match(css, /\.fpa-context>summary\{display:list-item;border-block:1px solid var\(--fpa-line\)\}/);
  assert.match(css, /\.fpa-context>summary::marker\{color:var\(--fpa-green\)\}/);
  assert.match(css, /\.fpa-context-body\{padding:16px 4px 4px\}/);
  assert.match(css, /focus-visible\{outline:3px solid var\(--fpa-accent\);outline-offset:3px\}/);
});
