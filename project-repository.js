/* Shared Project v1 validation plus a one-time cleanup for the retired local store. */
(function (scope) {
  'use strict';
  const SCHEMA_VERSION = 1;
  const DB_NAME = 'firstprincipleai-local-projects';
  const ACTIVE_KEY = 'firstprinciple.active-project.v1';
  const CLEANUP_KEY = 'firstprinciple.legacy-local-projects-cleanup.v1';
  const MAX_PROJECTS = 1000;
  const STEPS = ['discovery', 'overview', 'development', 'assessment'];
  const VERIFICATION = ['not_checked', 'previously_retrieved', 'rechecking', 'current_query_completed'];
  const FIELDS = ['id', 'schemaVersion', 'projectName', 'propertyReference', 'selectedAddress', 'parcelId', 'councilId', 'developmentType', 'currentWorkflowStep', 'planningDataReferences', 'assessmentReferences', 'dataVerificationStatus', 'createdAt', 'updatedAt', 'lastOpenedAt', 'syncStatus', 'workflowContext'];
  const MUTABLE = FIELDS.filter(key => !['id', 'schemaVersion', 'createdAt', 'updatedAt', 'syncStatus'].includes(key));
  const CONTEXT_FIELDS = ['version', 'selection', 'chosenCandidateId', 'confirmedKey', 'confirmedPropertyId', 'overviewVisited', 'assessmentVisited', 'projectId', 'projectChosen', 'question', 'search', 'browsingCouncilId', 'map', 'visibleLayers', 'locationExpanded'];
  const LOCATION_FIELDS = ['kind', 'name', 'center', 'state', 'precision', 'coverage', 'source', 'sourceUrl', 'origin', 'provider', 'propertyId', 'sourceCenter', 'sourceWkid', 'mapCoordinateStatus', 'mapCRS', 'unitNumber', 'exact', 'council_ids', 'methods'];
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  function invalid(message) { throw new Error('Invalid project data: ' + message); }
  function plain(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid(label + ' must be an object.');
    return value;
  }
  function keys(value, allowed, label) {
    plain(value, label);
    if (Object.keys(value).some(key => !allowed.includes(key))) invalid(label + ' contains an unsupported field.');
  }
  function inspect(value) {
    const seen = new WeakSet(); let count = 0;
    function walk(item, depth) {
      if (++count > 50000 || depth > 16) invalid('The file is too complex.');
      if (item === null || ['string', 'boolean'].includes(typeof item)) return;
      if (typeof item === 'number') { if (!Number.isFinite(item)) invalid('Numbers must be finite.'); return; }
      if (typeof item !== 'object') invalid('Only JSON values are supported.');
      if (seen.has(item)) invalid('Circular or shared object references are unsupported.');
      seen.add(item);
      if (!Array.isArray(item)) plain(item, 'Value');
      for (const key of Object.keys(item)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) invalid('Unsafe object keys are not allowed.');
        walk(item[key], depth + 1);
      }
    }
    walk(value, 0);
  }
  function string(value, label, max, empty = true) {
    if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) invalid(label + ' must be ' + (empty ? 'text' : 'non-empty text') + ' of at most ' + max + ' characters.');
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) invalid(label + ' contains unsupported control characters.');
    return value;
  }
  function nullableString(value, label, max) { return value === null ? null : string(value, label, max, false); }
  function id(value, label) {
    if (value === null) return null;
    if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) value = String(value);
    return string(value, label, 100, false);
  }
  function date(value, label) {
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) invalid(label + ' must be a UTC ISO timestamp.');
    return value;
  }
  function bool(value, label) { if (typeof value !== 'boolean') invalid(label + ' must be true or false.'); return value; }
  function enumeration(value, choices, label) { if (!choices.includes(value)) invalid(label + ' is unsupported.'); return value; }
  function array(value, label, limit, convert) {
    if (!Array.isArray(value) || value.length > limit) invalid(label + ' must be a list of at most ' + limit + ' items.');
    return value.map(convert);
  }
  function url(value, label) {
    const text = string(value, label, 2000, false); let parsed;
    try { parsed = new URL(text); } catch (_) { invalid(label + ' must be a valid HTTPS URL.'); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) invalid(label + ' must be a public HTTPS reference.');
    for (const key of parsed.searchParams.keys()) if (/^(access[_-]?token|api[_-]?key|secret|password|token|key)$/i.test(key)) invalid(label + ' must not contain credentials.');
    return text;
  }
  function point(value, label) {
    if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite) || value[0] < 100 || value[0] > 170 || value[1] < -57 || value[1] > -3) invalid(label + ' must be an Australian longitude/latitude point.');
    return [...value];
  }
  function location(value) {
    if (value === null) return null;
    keys(value, LOCATION_FIELDS, 'Selected location');
    const result = {};
    for (const key of Object.keys(value)) {
      const item = value[key];
      if (key === 'kind') result[key] = enumeration(item, ['address', 'street', 'place', 'postcode', 'locality'], key);
      else if (['center', 'sourceCenter'].includes(key)) result[key] = point(item, key);
      else if (key === 'state') result[key] = enumeration(item, ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT', ''], key);
      else if (key === 'sourceWkid') result[key] = enumeration(item, [4283, 4326], key);
      else if (key === 'propertyId') result[key] = id(item, key);
      else if (key === 'exact') result[key] = bool(item, key);
      else if (key === 'sourceUrl') result[key] = url(item, key);
      else if (key === 'council_ids') result[key] = array(item, key, 150, item => string(item, 'Council ID', 80, false));
      else if (key === 'methods') result[key] = array(item, key, 40, item => string(item, 'Location method', 600));
      else result[key] = string(item, key, key === 'name' ? 300 : 240);
    }
    if (!result.kind || !result.name) invalid('Selected location needs a kind and name.');
    if (result.kind === 'address' && (!result.center || !result.state)) invalid('An address needs a point and state.');
    return result;
  }
  function context(value) {
    if (value === null) return null;
    keys(value, CONTEXT_FIELDS, 'Workflow context');
    if (value.version !== 1) invalid('Workflow context version is unsupported.');
    const result = {version: 1};
    for (const key of Object.keys(value)) {
      const item = value[key];
      if (key === 'version') continue;
      if (key === 'selection') result[key] = location(item);
      else if (['locationExpanded', 'overviewVisited', 'assessmentVisited', 'projectChosen'].includes(key)) result[key] = bool(item, key);
      else if (['chosenCandidateId', 'confirmedPropertyId'].includes(key)) result[key] = id(item, key);
      else if (['confirmedKey', 'browsingCouncilId'].includes(key)) result[key] = nullableString(item, key, key === 'confirmedKey' ? 650 : 80);
      else if (key === 'question') result[key] = string(item, key, 600);
      else if (key === 'search') result[key] = string(item, key, 180);
      else if (key === 'projectId') result[key] = string(item, key, 100);
      else if (key === 'visibleLayers') {
        keys(item, ['property', 'lots', 'zoning'], key);
        result[key] = {property: bool(item.property, 'property layer'), lots: bool(item.lots, 'lots layer'), zoning: bool(item.zoning, 'zoning layer')};
      } else if (key === 'map') {
        if (item === null) result[key] = null;
        else {
          keys(item, ['center', 'zoom'], key);
          if (!Number.isFinite(item.zoom) || item.zoom < 3 || item.zoom > 19) invalid('Map zoom must be between 3 and 19.');
          result[key] = {center: point(item.center, 'Map centre'), zoom: item.zoom};
        }
      }
    }
    return result;
  }
  function planningReference(value) {
    keys(value, ['sourceId', 'url', 'retrievedAt', 'status'], 'Planning reference');
    return {sourceId: string(value.sourceId, 'Source ID', 100, false), url: url(value.url, 'Planning source URL'), retrievedAt: value.retrievedAt === null ? null : date(value.retrievedAt, 'Retrieval time'), status: string(value.status, 'Source status', 80, false)};
  }
  function assessmentReference(value) {
    keys(value, ['id', 'type', 'sourceUrl', 'retrievedAt', 'status'], 'Assessment reference');
    return {id: string(value.id, 'Assessment reference ID', 160, false), type: string(value.type, 'Reference type', 80, false), sourceUrl: value.sourceUrl === null ? null : url(value.sourceUrl, 'Assessment source URL'), retrievedAt: value.retrievedAt === null ? null : date(value.retrievedAt, 'Retrieval time'), status: string(value.status, 'Assessment status', 80, false)};
  }
  function sanitizeProject(value) {
    inspect(value); keys(value, FIELDS, 'Project');
    if (FIELDS.some(key => !own(value, key))) invalid('The project record is incomplete.');
    if (typeof value.id !== 'string' || !UUID.test(value.id)) invalid('Project ID must be a UUID v4.');
    if (value.schemaVersion !== SCHEMA_VERSION) invalid('Project schema version is unsupported.');
    let propertyReference = null;
    if (value.propertyReference !== null) {
      keys(value.propertyReference, ['propertyId', 'lotLabels'], 'Property reference');
      propertyReference = {propertyId: id(value.propertyReference.propertyId, 'Property ID'), lotLabels: array(value.propertyReference.lotLabels, 'Lot labels', 100, item => string(item, 'Lot label', 160, false))};
    }
    return {
      id: value.id, schemaVersion: SCHEMA_VERSION,
      projectName: string(value.projectName, 'Project name', 120, false).trim(),
      propertyReference,
      selectedAddress: string(value.selectedAddress, 'Selected address', 300),
      parcelId: nullableString(value.parcelId, 'Parcel ID', 160),
      councilId: nullableString(value.councilId, 'Council ID', 80),
      developmentType: nullableString(value.developmentType, 'Development type', 100),
      currentWorkflowStep: enumeration(value.currentWorkflowStep, STEPS, 'Workflow step'),
      planningDataReferences: array(value.planningDataReferences, 'Planning references', 80, planningReference),
      assessmentReferences: array(value.assessmentReferences, 'Assessment references', 80, assessmentReference),
      dataVerificationStatus: enumeration(value.dataVerificationStatus, VERIFICATION, 'Verification status'),
      createdAt: date(value.createdAt, 'Created time'), updatedAt: date(value.updatedAt, 'Updated time'),
      lastOpenedAt: date(value.lastOpenedAt, 'Last opened time'),
      syncStatus: enumeration(value.syncStatus, ['local_only'], 'Sync status'),
      workflowContext: context(value.workflowContext)
    };
  }
  function newId() {
    if (typeof scope.crypto?.randomUUID === 'function') return scope.crypto.randomUUID();
    if (typeof scope.crypto?.getRandomValues !== 'function') throw new Error('Secure project ID generation is unavailable in this browser.');
    const bytes = scope.crypto.getRandomValues(new Uint8Array(16)); bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
  }
  function defaults() {
    const now = new Date().toISOString();
    return {id: newId(), schemaVersion: SCHEMA_VERSION, projectName: 'Untitled project', propertyReference: null, selectedAddress: '', parcelId: null, councilId: null, developmentType: null, currentWorkflowStep: 'discovery', planningDataReferences: [], assessmentReferences: [], dataVerificationStatus: 'not_checked', createdAt: now, updatedAt: now, lastOpenedAt: now, syncStatus: 'local_only', workflowContext: null};
  }
  // Shared pure Project v1 builder. Cloud transport can reuse validation without
  // creating a second model or making a temporary IndexedDB write.
  function prepareProject(input = {}) {
    inspect(input); keys(input, MUTABLE, 'New project');
    const candidate = defaults();
    for (const key of Object.keys(input)) candidate[key] = input[key];
    return sanitizeProject(candidate);
  }
  function clearLegacyLocalProjectsOnce(host = scope) {
    let storage, factory;
    try {
      storage = host.localStorage;
      if (storage.getItem(CLEANUP_KEY)) return Promise.resolve({status: 'already-attempted'});
      storage.setItem(CLEANUP_KEY, 'started');
      factory = host.indexedDB;
    } catch (_) { return Promise.resolve({status: 'storage-unavailable'}); }
    const finish = (status, clearPointer = false) => {
      try {
        if (clearPointer) {
          const pointer = storage.getItem(ACTIVE_KEY);
          let accountPointer = false;
          try { accountPointer = JSON.parse(pointer)?.source === 'account'; } catch (_) {}
          if (pointer && !accountPointer) storage.removeItem(ACTIVE_KEY);
        }
        storage.setItem(CLEANUP_KEY, status);
      } catch (_) { status = 'cleanup-incomplete'; }
      return {status};
    };
    if (!factory?.open) return Promise.resolve(finish('indexeddb-unavailable'));
    return new Promise(resolve => {
      let created = false, settled = false;
      const done = result => { if (!settled) { settled = true; resolve(result); } };
      let request;
      try { request = factory.open(DB_NAME); }
      catch (_) { done(finish('open-failed')); return; }
      request.onupgradeneeded = () => {
        created = true;
        try { request.transaction?.abort(); } catch (_) {}
      };
      request.onerror = () => {
        if (!created) { done(finish('open-failed')); return; }
        let deletion;
        try { deletion = factory.deleteDatabase(DB_NAME); }
        catch (_) { done(finish('cleanup-incomplete')); return; }
        deletion.onsuccess = () => done(finish('completed', true));
        deletion.onerror = deletion.onblocked = () => done(finish('cleanup-incomplete'));
      };
      request.onblocked = () => done(finish('blocked'));
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('projects')) { db.close(); done(finish('completed', true)); return; }
        try {
          const transaction = db.transaction('projects', 'readwrite');
          transaction.objectStore('projects').clear();
          transaction.oncomplete = () => { db.close(); done(finish('completed', true)); };
          transaction.onerror = transaction.onabort = () => { db.close(); done(finish('cleanup-incomplete')); };
        } catch (_) { db.close(); done(finish('cleanup-incomplete')); }
      };
    });
  }
  const api = Object.freeze({prepareProject, sanitizeProject, clearLegacyLocalProjectsOnce, schemaVersion: SCHEMA_VERSION, limits: Object.freeze({maxProjects: MAX_PROJECTS})});
  scope.FirstPrincipleProjectStorage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
