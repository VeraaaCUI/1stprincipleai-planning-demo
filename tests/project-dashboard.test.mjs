import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const dashboard = read('project-dashboard-view.js');

test('Project Dashboard exposes the supported Project v1 sections', () => {
  assert.match(dashboard, /FirstPrincipleProjectDashboard/);
  for (const section of ['overview', 'roadmap', 'tasks', 'documents', 'assistant', 'specialists', 'activity']) {
    assert.match(dashboard, new RegExp("['\\\"]" + section + "['\\\"]"));
  }
  for (const label of ['Project Dashboard', 'Continue Working', 'Back to My Projects', 'Information requiring verification', 'Saved workflow stage', 'Activity History']) {
    assert.match(dashboard, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('Dashboard serialization reads Project v1 context and excludes transient workspace data', () => {
  const start = dashboard.indexOf('function projectValue');
  const end = dashboard.indexOf('function init');
  assert.ok(start >= 0 && end > start, 'Project v1 projection should be explicit');
  const projection = dashboard.slice(start, end);
  for (const field of ['id', 'projectName', 'selectedAddress', 'propertyReference', 'parcelId', 'councilId', 'developmentType', 'currentWorkflowStep', 'dataVerificationStatus', 'createdAt', 'updatedAt']) {
    assert.match(projection, new RegExp('project\\?\\.' + field));
  }
  for (const transient of ['pdfState', 'pdfSnapshot', 'briefEditor', 'syntheticReading', 'confidence', 'answers', 'emailPreparation']) {
    assert.doesNotMatch(projection, new RegExp(transient));
  }
});

test('Dashboard is read-only and cannot create cloud writes or uploads', () => {
  for (const forbidden of ['fetch\\s*\\(', 'supabase', 'createProject', 'updateProject', 'deleteProject', 'localStorage', 'sessionStorage', 'fileInput', 'FormData']) {
    assert.doesNotMatch(dashboard, new RegExp(forbidden, 'i'));
  }
  assert.match(dashboard, /read-only/i);
  assert.match(dashboard, /not stored/i);
  assert.match(dashboard, /No live AI Agent is connected/i);
});

test('Dashboard controls use semantic tabs and visible continuation actions', () => {
  assert.match(dashboard, /role', 'tab'/);
  assert.match(dashboard, /role', 'tablist'/);
  assert.match(dashboard, /role', 'tabpanel'/);
  assert.match(dashboard, /aria-selected/);
  assert.match(dashboard, /ArrowRight/);
  assert.match(dashboard, /ArrowLeft/);
  assert.match(dashboard, /event\.key === 'Home'/);
  assert.match(dashboard, /event\.key === 'End'/);
  assert.match(dashboard, /onContinue/);
  assert.match(dashboard, /onBack/);
  assert.match(dashboard, /may have been deleted or is unavailable/);
});

test('Project navigation uses a project-specific Dashboard route and keeps Continue Working separate', () => {
  const app = read('app.js');
  const projects = read('local-projects.js');
  assert.match(app, /my-projects/);
  assert.match(app, /dashboard|ProjectDashboard|project-dashboard/i);
  assert.match(projects, /onDashboardOpen/);
  assert.match(projects, /Continue Working|continueWorking/);
  assert.match(projects, /showProject|show\(/);
  assert.match(app, /status==='authenticated'.*ui\.view==='dashboard'.*dashboardLoadedId!==dashboardProjectId\(ui\.route\)/s);
});

test('Opening a saved project presents the Dashboard before restoring the workflow', () => {
  const projects = read('local-projects.js');
  const openStart = projects.indexOf('function open(id)');
  const renameStart = projects.indexOf('function rename', openStart);
  assert.ok(openStart >= 0 && renameStart > openStart);
  const openBlock = projects.slice(openStart, renameStart);
  assert.match(openBlock, /getProject\(id\)/);
  assert.match(openBlock, /assertCurrent\(token\)/);
  assert.match(openBlock, /onDashboardOpen\(project\)/);
  assert.match(openBlock, /onDashboardOpen\(project\)/);
  assert.match(projects, /function continueWorking\(project=active\)/);
  assert.match(projects, /restoreProject\(project\)/);
});

test('Dashboard loading and account transitions keep the visible state isolated', () => {
  const app = read('app.js');
  assert.match(app, /dashboardLoadingId/);
  assert.match(app, /status==='authenticated'/);
  assert.match(app, /status==='anonymous'.*navigate\('my-projects'/s);
  assert.match(app, /dashboardApi\?\.clear/);
  assert.match(app, /dashboardProjectId\(ui\.route\)/);
  assert.match(app, /dashboardOwnerId=authApi\?\.getState\?\.\(\)\.user\?\.id/);
  assert.match(dashboard, /function clearPanels/);
  assert.match(dashboard, /showLoading\(\).*clearPanels/s);
  assert.match(dashboard, /showError\(value\).*clearPanels/s);
});

test('Dashboard preparation targets are truthful and preserve local-only boundaries', () => {
  const app = read('app.js');
  assert.match(app, /function dashboardTargetAvailable/);
  assert.match(app, /function dashboardTargetLabel/);
  assert.match(app, /Return to property assessment/);
  assert.match(app, /if\(savedId!==currentId&&\(savedId\|\|currentId\)\)return false/);
  assert.match(app, /servicesApi\?\.openTarget/);
  assert.match(app, /target!=='drawings'&&target!=='specialists'/);
  assert.match(app, /if\(target\)navigate\('property\/assessment'\)/);
  assert.match(dashboard, /getContinuationLabel/);
  assert.match(dashboard, /Documents are not yet saved/);
  assert.match(dashboard, /Specialist support has not yet been requested/);
});

test('Activity history uses only the supported Project v1 timestamp fields', () => {
  const repository = read('project-repository.js');
  assert.match(repository, /'createdAt', 'updatedAt', 'lastOpenedAt'/);
  assert.match(dashboard, /project\?\.createdAt/);
  assert.match(dashboard, /project\?\.updatedAt/);
  assert.doesNotMatch(dashboard, /lastOpenedAt|Project last opened/);
  assert.match(dashboard, /Project created: '\s*\+ value\.created/);
  assert.match(dashboard, /Project last updated: '\s*\+ value\.updated/);
  assert.doesNotMatch(dashboard, /auditEvent|browserLocal|Date\.now\(\)/i);
});

test('Dashboard continuation is disabled until a record is ready', () => {
  assert.match(dashboard, /continueButton\.disabled = true/);
  assert.match(dashboard, /function showLoading\(\).*continueButton\.disabled = true/s);
  assert.match(dashboard, /function showError\(value\).*continueButton\.disabled = true/s);
  assert.match(dashboard, /status = 'ready'; continueButton\.disabled = false/);
});

