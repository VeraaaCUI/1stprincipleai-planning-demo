import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const projectStorage = require('../project-repository.js');
const source = fs.readFileSync(new URL('../local-projects.js', import.meta.url), 'utf8');
const OWNER_A = '11111111-1111-4111-8111-111111111111';
const OWNER_B = '22222222-2222-4222-8222-222222222222';
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const PROJECT_ID = '44444444-4444-4444-8444-444444444444';
const clone = value => JSON.parse(JSON.stringify(value));

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

function createHarness(initialAuth = {status: 'anonymous', user: null}) {
  let authState = clone(initialAuth), authListener;
  let workflow = {
    version: 1,
    selection: {
      kind: 'address', name: '12 Example Street, Richmond NSW', center: [151.2, -33.6],
      state: 'NSW', precision: 'address_point', provider: 'nsw_spatial', propertyId: '12345',
      council_ids: ['Hawkesbury']
    },
    confirmedKey: 'confirmed-address-key', confirmedPropertyId: '12345', chosenCandidateId: '12345',
    overviewVisited: true, assessmentVisited: true, projectId: 'granny', projectChosen: true,
    question: 'Prepare a Granny Flat enquiry', search: '12 Example Street',
    browsingCouncilId: null, map: null,
    visibleLayers: {property: true, lots: true, zoning: false}, locationExpanded: true
  };
  const localStorage = memoryStorage(), sessionStorage = memoryStorage(), listeners = new Map();
  const calls = {create: [], update: [], list: 0};
  const resetCalls = [];
  const auth = {
    ready: Promise.resolve(),
    getState: () => clone(authState),
    subscribe(listener) { authListener = listener; listener(clone(authState)); return () => { authListener = null; }; }
  };
  const mapApi = {
    exportProjectContext: () => clone(workflow),
    getState: () => ({flowPage: 'assessment', projectChosen: true, projectId: 'granny'}),
    getSpatialData: () => ({status: 'ready', property: {id: '12345', lotLabels: ['1/DP12345']}, provenance: []}),
    restoreProjectContext(value) { workflow = clone(value); resetCalls.push('restore'); },
    resetProject() {
      workflow = {version: 1, selection: null};
      resetCalls.push('reset');
    }
  };
  const repository = {
    async listProjects() { calls.list++; return []; },
    async getProject() { return null; },
    async createProject(draft, options = {}) {
      calls.create.push({draft: clone(draft), requestId: options.requestId});
      return {...clone(draft), id: PROJECT_ID};
    },
    async updateProject(id, patch) {
      calls.update.push({id, patch: clone(patch)});
      return {...clone(patch), id};
    },
    async deleteProject() { return true; }
  };
  const scope = {
    crypto: {randomUUID: () => REQUEST_ID}, localStorage, sessionStorage,
    FirstPrincipleProjectStorage: {clearLegacyLocalProjectsOnce: async () => ({status: 'already-attempted'})},
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type) { listeners.delete(type); }
  };
  vm.runInNewContext(source, {window: scope});
  let accountRequest = null;
  const controller = scope.FirstPrincipleMyProjects.init({
    root: {}, mapApi, navigate() {}, cloudRepository: repository, auth,
    onAccountRequired(value) { accountRequest = value; }
  });
  return {
    controller, repository, calls, localStorage, sessionStorage, mapApi, resetCalls,
    get accountRequest() { return accountRequest; },
    setAuth(next) { authState = clone(next); authListener?.(clone(authState)); },
    getWorkflow() { return clone(workflow); }
  };
}

const signedIn = id => ({status: 'authenticated', user: {id, email: `${id}@example.test`}});
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('assessment exploration and no-save exit make no cloud project writes', async () => {
  const app = createHarness(signedIn(OWNER_A));
  await app.controller.ready;
  await tick();

  assert.ok(app.calls.list > 0);
  assert.equal(app.calls.create.length, 0);
  assert.equal(app.calls.update.length, 0);
  assert.equal(app.controller.getState().currentDraft.selectedAddress, '12 Example Street, Richmond NSW');
});

test('authenticated explicit save sends a stable idempotency request ID', async () => {
  const app = createHarness(signedIn(OWNER_A));
  await app.controller.ready;

  await app.controller.save({projectName: '12 Example Street'});

  assert.equal(app.calls.create.length, 1);
  assert.equal(app.calls.create[0].requestId, REQUEST_ID);
  assert.equal(app.controller.getState().status, 'saved');
  assert.equal(app.sessionStorage.getItem('firstprinciple.pending-account-save.v1'), null);
});

test('cancelled unauthenticated save remains temporary and does not resume after login', async () => {
  const app = createHarness();
  await app.controller.ready;

  const result = await app.controller.save({projectName: '12 Example Street'});
  assert.equal(result.status, 'authentication_required');
  assert.equal(app.calls.create.length, 0);
  assert.ok(app.sessionStorage.getItem('firstprinciple.pending-account-save.v1'));
  assert.equal(app.accountRequest.requestId, REQUEST_ID);

  app.controller.cancelPendingSave();
  assert.equal(app.sessionStorage.getItem('firstprinciple.pending-account-save.v1'), null);
  app.setAuth(signedIn(OWNER_A));
  await tick();
  assert.equal(app.calls.create.length, 0);
  assert.equal(app.controller.getState().status, 'draft');
  assert.equal(app.getWorkflow().selection.name, '12 Example Street, Richmond NSW');
});

test('explicit save survives login once and Project v1 excludes synthetic assessment fields', async () => {
  const app = createHarness();
  await app.controller.ready;
  const authRequired = await app.controller.save({projectName: '12 Example Street'});
  assert.equal(authRequired.status, 'authentication_required');

  let releaseCreate;
  const createGate = new Promise(resolve => { releaseCreate = resolve; });
  app.repository.createProject = async (draft, options = {}) => {
    app.calls.create.push({draft: clone(draft), requestId: options.requestId});
    await createGate;
    return {...clone(draft), id: PROJECT_ID};
  };
  app.setAuth(signedIn(OWNER_A));
  await tick();
  const firstResume = app.controller.resumePendingSave();
  const secondResume = app.controller.resumePendingSave();
  releaseCreate();
  await Promise.all([firstResume, secondResume]);

  assert.equal(app.calls.create.length, 1);
  assert.equal(app.calls.create[0].requestId, REQUEST_ID);
  assert.equal(app.controller.getState().status, 'saved');
  assert.equal(app.sessionStorage.getItem('firstprinciple.pending-account-save.v1'), null);

  const payload = clone(app.calls.create[0].draft);
  const project = projectStorage.prepareProject(payload);
  assert.equal(project.selectedAddress, '12 Example Street, Richmond NSW');
  for (const key of ['answers', 'confidence', 'pdfSnapshot', 'syntheticReading']) {
    assert.equal(Object.hasOwn(payload, key), false);
    assert.throws(() => projectStorage.prepareProject({...payload, [key]: []}), /unsupported field/i);
  }
});

test('failed explicit save returns a failure and keeps the enquiry open', async () => {
  const app = createHarness(signedIn(OWNER_A));
  await app.controller.ready;
  app.repository.createProject = async () => { throw new Error('synthetic network failure'); };

  await assert.rejects(app.controller.save(), /synthetic network failure/);
  const state = app.controller.getState();
  assert.equal(state.status, 'failed');
  assert.match(state.message, /Save failed/);
  assert.equal(state.currentDraft.selectedAddress, '12 Example Street, Richmond NSW');
});

test('account change clears an in-flight prior-owner enquiry and its pending save', async () => {
  const app = createHarness(signedIn(OWNER_A));
  await app.controller.ready;
  let releaseCreate;
  const createGate = new Promise(resolve => { releaseCreate = resolve; });
  app.repository.createProject = async (draft, options = {}) => {
    app.calls.create.push({draft: clone(draft), requestId: options.requestId});
    await createGate;
    return {...clone(draft), id: PROJECT_ID};
  };
  const saving = app.controller.save();
  await tick();
  assert.equal(app.calls.create.length, 1);

  app.setAuth(signedIn(OWNER_B));
  assert.equal(app.getWorkflow().selection, null);
  assert.equal(app.sessionStorage.getItem('firstprinciple.pending-account-save.v1'), null);
  releaseCreate();
  await assert.rejects(saving, /account changed/i);
  await tick();

  assert.equal(app.controller.getState().activeId, null);
  assert.equal(app.controller.getState().authentication.canSaveToAccount, true);
  assert.deepEqual(app.resetCalls, ['reset']);
});
