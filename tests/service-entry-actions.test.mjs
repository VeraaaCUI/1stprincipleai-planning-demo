import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const services = fs.readFileSync(path.join(root, 'advanced-services.js'), 'utf8');
const expertContact = fs.readFileSync(path.join(root, 'expert-contact.js'), 'utf8');

test('service workspace exposes one compact set of alternative entry actions', () => {
  assert.match(services, /Project Workspace/);
  assert.match(services, /Choose a drawing PDF/);
  assert.match(services, /Review drawings/);
  assert.match(services, /Prepare project brief/);
  assert.match(services, /Prepare specialist support/);
  assert.match(services, /I have PDF drawings/);
  assert.match(services, /Start a Project Brief without drawings/);
  assert.match(services, /I need specialist advice/);
  assert.match(services, /Local project preparation stages/);
  assert.match(services, /Gather project information/);
  assert.match(services, /Prepare project brief/);
  assert.match(services, /Prepare specialist handover/);
  assert.match(services, /Expert Handover Draft/);
  assert.match(expertContact, /Expert Handover Draft preparation/);
  assert.match(expertContact, /Prepare expert handover draft/);
  assert.match(services, /el\('div',null,'fps-direct-actions'\)/);
  assert.match(services, /Object\.entries\(taskActions\)/);
  assert.doesNotMatch(services, /fps-route-options|fps-route-cards|routeButtons/);
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
  const drawingStart = handlers.slice(0, handlers.indexOf('function startWithoutDrawings'));
  assert.doesNotMatch(drawingStart, /pdfApi\?\.selectFile\(\)/);
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
  assert.match(services, /const briefTaskContent=el\('section',null,'fps-task-content fps-task-brief'\)/);
  assert.match(services, /const specialistTaskContent=el\('section',null,'fps-task-content fps-task-specialist'\)/);
  assert.match(services, /const secondaryTools=el\('details',null,'fps-secondary-tools'\)/);
  assert.match(services, /toolsArea\.append\(briefTaskContent,specialistTaskContent,routeTasks,secondaryTools\)/);
  assert.match(services, /choice\.track==='drawings'\)focusDrawingReview\(\)/);
  assert.match(services, /if\(target==='drawings'\|\|target==='documents'\)\{openDrawingReview\(\);return;\}/);
  assert.doesNotMatch(services, /drawingIntake\.append\(pdfRoot\)[\s\S]*fileInput\.click\(\)/);
});

test('workspace exposes one active task at a time and keeps roadmap secondary', () => {
  assert.match(services, /function renderTaskView\(\)/);
  assert.match(services, /drawingIntake\.hidden=active!=='drawings'/);
  assert.match(services, /briefTaskContent\.hidden=active!=='brief'/);
  assert.match(services, /specialistTaskContent\.hidden=active!=='review'/);
  assert.match(services, /roadmapDetails\.hidden=!hasContext/);
  assert.match(services, /Object\.entries\(taskActions\)/);
  assert.match(services, /const roadmapDetails=el\('details',null,'fps-workspace-roadmap'\)/);
  assert.match(services, /roadmapDetails\.append\(el\('summary','View project roadmap'\),progressRoot\)/);
  assert.match(services, /localStatus\.textContent='Local Project Preparation · '\+status/);
  assert.doesNotMatch(services, /function chooseRoute\(id,focus=true\)\{if\(activateRoute\(id,focus\)\)markChanged\(\);\}/);
});

test('secondary preparation tools follow the active route and suggested actions do not duplicate PDF selection', () => {
  assert.match(services, /function visibleToolIds\(\)/);
  assert.match(services, /if\(route==='brief'\)return \['cost','application'\]/);
  assert.match(services, /if\(route==='review'\)return \['experts','email'\]/);
  assert.match(services, /if\(route==='drawings'\)return \[\]/);
  assert.match(services, /tabs\[item\.id\]\.hidden=!visible/);
  assert.match(services, /secondaryTools\.hidden=!hasContext\|\|!active\|\|visibleToolIds\(\)\.length===0/);
  assert.match(services, /Suggested Next Actions · local only/);
  assert.match(services, /Object\.entries\(journeyItems\)/);
  assert.match(services, /item\.removeAttribute\('aria-current'\)/);
  assert.doesNotMatch(services, /Choose a drawing PDF and extract its pages/);
  assert.match(services, /activateRoute\(targetRoute,false\)/);
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

test('specialist task exposes the current prepared brief and a route-aware return action', () => {
  assert.match(services, /const specialistBrief=el\('section',null,'fps-specialist-brief'\)/);
  assert.match(services, /const specialistBriefText=el\('pre',null,'fps-specialist-brief-text'\)/);
  assert.match(services, /specialistBriefText\.textContent=reviewed\|\|'The prepared brief has no text yet\.'/);
  assert.match(services, /This is the current user-reviewed text used for local handover preparation/);
  assert.match(services, /const returnToBrief=button\('Return to project brief',returnToBriefPreparation/);
  assert.match(services, /function returnToBriefPreparation\(\)/);
  assert.match(services, /activateRoute\('brief',false\);syncProject\(\);briefSection\.scrollIntoView/);
  assert.match(services, /\(briefPrepared\?briefEditor:aimInput\)\.focus\(\)/);
});

test('dashboard continuation targets expose local drawing and specialist entries without external actions', () => {
  assert.match(services, /function openTarget\(target\)/);
  assert.match(services, /if\(target==='drawings'\)\{openDrawingReview\(\);return true;\}/);
  assert.match(services, /if\(target==='specialists'\)\{startSpecialistSupport\(\);return true;\}/);
  assert.match(services, /openTarget/);
  assert.match(services, /no service or contact has started/i);
});
