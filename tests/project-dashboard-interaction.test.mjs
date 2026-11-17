import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const rootPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(rootPath, 'project-dashboard-view.js'), 'utf8');

class FakeElement {
  constructor(tag, document) {
    this.tagName = tag.toUpperCase(); this.ownerDocument = document; this.children = []; this.attributes = {};
    this.listeners = {}; this.dataset = {}; this.hidden = false; this.disabled = false; this.tabIndex = 0;
    this.id = ''; this.className = ''; this._text = '';
    const classes = new Set();
    this.classList = {
      add: value => classes.add(value),
      toggle: (value, force) => force === undefined ? (classes.has(value) ? classes.delete(value) : classes.add(value)) : (force ? classes.add(value) : classes.delete(value)),
      contains: value => classes.has(value)
    };
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child); } }
  replaceChildren(...children) { this.children = []; this._text = ''; this.append(...children); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  focus() { this.ownerDocument.activeElement = this; }
  click() { if (!this.disabled) for (const callback of this.listeners.click || []) callback({target: this}); }
  dispatch(name, event = {}) {
    event.preventDefault ||= () => { event.defaultPrevented = true; };
    for (const callback of this.listeners[name] || []) callback(event);
    return event;
  }
  matches(selector) {
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector.startsWith('.')) return this.className.split(/\s+/).includes(selector.slice(1));
    const parts = selector.match(/^[a-z][a-z0-9-]*|\[[^\]]+\]/gi) || [];
    return parts.every(part => {
      if (!part.startsWith('[')) return this.tagName.toLowerCase() === part.toLowerCase();
      const [rawName, rawValue] = part.slice(1, -1).split('=');
      const name = rawName.trim(), expected = rawValue?.replace(/^['"]|['"]$/g, '');
      const dataKey = name.startsWith('data-') ? name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()) : null;
      const value = dataKey ? this.dataset[dataKey] : this.getAttribute(name);
      return expected === undefined ? value !== undefined && value !== null : String(value) === expected;
    });
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const result = [];
    const visit = item => { for (const child of item.children) { if (child.matches(selector)) result.push(child); visit(child); } };
    visit(this); return result;
  }
  cloneNode(deep = false) {
    const copy = new FakeElement(this.tagName.toLowerCase(), this.ownerDocument);
    copy._text = this._text; copy.className = this.className; copy.hidden = this.hidden;
    copy.id = this.id; copy.tabIndex = this.tabIndex; copy.attributes = {...this.attributes}; copy.dataset = {...this.dataset};
    if (deep) copy.append(...this.children.map(child => child.cloneNode(true)));
    return copy;
  }
}

function fixture() {
  const document = {activeElement: null, createElement(tag) { return new FakeElement(tag, document); }};
  const scope = {FirstPrincipleProjectProgress: {deriveProgress: () => ({stages: Array.from({length: 10}, (_, index) => ({
    id: 'stage-' + index, label: 'Stage ' + index, status: index === 7 ? 'not_connected' : 'available',
    statusLabel: index === 7 ? 'Not connected' : 'Available', reason: 'Stage detail ' + index
  }))})}};
  vm.runInNewContext(source, {window: scope, document, Intl, Date});
  return {document, scope, root: new FakeElement('section', document)};
}

function project(id = 'project-one') {
  return {
    id, projectName: 'House project', selectedAddress: '1 Main Street', propertyReference: {propertyId: '123', lotLabels: ['Lot 4']},
    developmentType: 'granny', currentWorkflowStep: 'assessment', dataVerificationStatus: 'not_checked',
    createdAt: '2026-01-02T03:04:05.000Z', updatedAt: '2026-02-03T04:05:06.000Z', lastOpenedAt: '2026-03-04T05:06:07.000Z',
    planningDataReferences: [], assessmentReferences: [], workflowContext: {version: 1}
  };
}

test('dashboard tabs expose linked unique ids and implement arrow, Home and End navigation', () => {
  const first = fixture(), secondRoot = new FakeElement('section', first.document);
  const firstApi = first.scope.FirstPrincipleProjectDashboard.init(first.root);
  const secondApi = first.scope.FirstPrincipleProjectDashboard.init(secondRoot);
  firstApi.show(project()); secondApi.show(project('project-two'));
  const tabs = first.root.querySelectorAll('[role="tab"]');
  const panels = first.root.querySelectorAll('[role="tabpanel"]');
  assert.equal(tabs.length, 7);
  assert.equal(panels.length, 7);
  assert.equal(new Set([...first.root.querySelectorAll('button')].filter(item => item.getAttribute('role') === 'tab').map(item => item.id)).size, 7);
  assert.notEqual(first.root.querySelector('h1').id, secondRoot.querySelector('h1').id);
  for (const tab of tabs.filter(item => item.getAttribute('role') === 'tab')) {
    const panel = panels.find(item => item.id === tab.getAttribute('aria-controls'));
    assert.ok(panel);
    assert.equal(panel.getAttribute('aria-labelledby'), tab.id);
    assert.equal(panel.tabIndex, 0);
  }
  const overview = tabs.find(item => item.dataset.dashboardSection === 'overview');
  const roadmap = tabs.find(item => item.dataset.dashboardSection === 'roadmap');
  overview.dispatch('keydown', {key: 'ArrowRight'});
  assert.equal(roadmap.getAttribute('aria-selected'), 'true');
  assert.equal(first.document.activeElement, roadmap);
  assert.equal(overview.tabIndex, -1);
  roadmap.dispatch('keydown', {key: 'End'});
  assert.equal(tabs.at(-1).getAttribute('aria-selected'), 'true');
  tabs.at(-1).dispatch('keydown', {key: 'Home'});
  assert.equal(overview.getAttribute('aria-selected'), 'true');
  overview.dispatch('keydown', {key: 'ArrowLeft'});
  assert.equal(tabs.at(-1).getAttribute('aria-selected'), 'true');
  assert.equal(panels.find(item => item.getAttribute('aria-labelledby') === overview.id).hidden, true);
  assert.equal(panels.find(item => item.getAttribute('aria-labelledby') === tabs.at(-1).id).hidden, false);
});

test('dashboard actions are disabled while unavailable and invoke only requested local continuation targets', () => {
  const state = fixture(), calls = [];
  const api = state.scope.FirstPrincipleProjectDashboard.init(state.root, {
    onContinueWorking: (...args) => calls.push(args),
    getContinuationLabel: (_project, target) => target === 'drawings' ? 'Continue to drawing preparation' : 'Continue to specialist preparation'
  });
  const continueButton = state.root.querySelectorAll('button').find(item => item.textContent === 'Continue Working');
  api.showLoading(); continueButton.click(); assert.deepEqual(calls, []);
  api.showError('Could not load'); continueButton.click(); assert.deepEqual(calls, []);
  assert.equal(continueButton.disabled, true);
  api.show(project()); assert.equal(continueButton.disabled, false);
  continueButton.click(); assert.deepEqual(calls, [['project-one']]);
  const docs = state.root.querySelectorAll('[role="tabpanel"]').find(item => item.dataset.dashboardSection === 'documents');
  docs.querySelector('button').click();
  const specialists = state.root.querySelectorAll('[role="tabpanel"]').find(item => item.dataset.dashboardSection === 'specialists');
  specialists.querySelector('button').click();
  assert.deepEqual(calls.slice(1), [['project-one', 'drawings'], ['project-one', 'specialists']]);
  assert.equal(state.scope.FirstPrincipleProjectDashboard.projectValue(project()).development, 'Secondary dwelling');
});

test('roadmap and activity history do not claim saved stage completion or an unsupported open event', () => {
  const state = fixture(), api = state.scope.FirstPrincipleProjectDashboard.init(state.root);
  api.show(project());
  api.showSection('roadmap', false);
  const roadmap = state.root.querySelectorAll('[role="tabpanel"]').find(item => item.getAttribute('aria-labelledby') === 'pd-1-tab-roadmap');
  assert.ok(roadmap);
  const stages = roadmap.querySelectorAll('.pd-roadmap-stage');
  assert.equal(stages.length, 10);
  assert.equal(stages[0].querySelector('.pd-stage-status').textContent, 'Suggested · progress not recorded');
  assert.equal(stages[7].querySelector('.pd-stage-status').textContent, 'External step · not recorded');
  assert.doesNotMatch(stages.map(item => item.textContent).join(' '), /completed|approved/i);
  api.showSection('activity', false);
  const activity = state.root.querySelector('.pd-activity-list');
  assert.match(activity.children[0].textContent, /^Project created: /);
  assert.match(activity.children[1].textContent, /^Project last updated: /);
  assert.equal(activity.children.length, 2);
  assert.doesNotMatch(activity.textContent, /last opened/i);
});
