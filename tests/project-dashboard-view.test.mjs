import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'project-dashboard-view.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'project-dashboard.css'), 'utf8');

test('Project Dashboard renders the supported Project v1 sections', () => {
  for (const section of ['Overview', 'Roadmap', 'Tasks', 'Documents', 'AI Assistant', 'Specialists', 'Activity History']) assert.match(source, new RegExp(section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(source, /FirstPrincipleProjectDashboard/);
  assert.match(source, /onContinueWorking/);
  assert.match(source, /No project documents are saved/);
  assert.match(source, /No live AI Agent is connected/);
  assert.match(source, /Specialist engagement has not started/);
});

test('Dashboard excludes unsupported local-only fields and has responsive focusable controls', () => {
  assert.doesNotMatch(source, /pdfState|briefPrepared|syntheticReading|confidence|agentRun/);
  assert.match(source, /projectValue\(project\)/);
  assert.match(source, /propertyReference/);
  assert.match(source, /dataVerificationStatus/);
  assert.match(source, /Continue Working/);
  assert.match(styles, /@media\(max-width:600px\)/);
  assert.match(styles, /focus-visible/);
  assert.match(styles, /min-height:44px/);
});
