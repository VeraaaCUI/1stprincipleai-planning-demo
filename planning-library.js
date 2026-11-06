/* Council reference navigation. No legal rules, topic bindings or network requests. */
(function (scope) {
  'use strict';
  const FAMILIES = Object.freeze([
    { id: 'local-planning', label: 'Local planning instruments', kind: 'LEP' },
    { id: 'council-controls', label: 'Council development controls', kind: 'DCP' },
    { id: 'state-planning', label: 'State planning instruments', kind: 'SEPP' },
    { id: 'property-maps', label: 'Property maps & supporting checks', kind: 'Property layers' },
    { id: 'building-standards', label: 'Building standards', kind: 'Building code' }
  ]);
  const GROUPS = Object.freeze([
    { id: 'land-use', label: 'Land use & dwelling options' },
    { id: 'built-form', label: 'Building form & site layout' },
    { id: 'constraints', label: 'Heritage & site constraints' },
    { id: 'other', label: 'Other controls & references' }
  ]);
  const TOPICS = Object.freeze([
    { id: 'zoning', label: 'Zoning', group: 'land-use', sources: ['LEP', 'Property layers', 'SEPP'] },
    { id: 'height', label: 'Height controls', group: 'built-form', sources: ['LEP', 'DCP', 'SEPP', 'Property layers'] },
    { id: 'setbacks', label: 'Setbacks', group: 'built-form', sources: ['DCP', 'SEPP', 'LEP'] },
    { id: 'heritage', label: 'Heritage', group: 'constraints', sources: ['LEP', 'Property layers', 'DCP'] },
    { id: 'parking', label: 'Parking', group: 'built-form', sources: ['DCP', 'SEPP', 'LEP'] },
    { id: 'flood', label: 'Flood', group: 'constraints', sources: ['Property layers', 'LEP', 'DCP'] },
    { id: 'bushfire', label: 'Bushfire', group: 'constraints', sources: ['Property layers', 'SEPP', 'DCP', 'LEP'] },
    { id: 'secondary-dwellings', label: 'Secondary dwellings', group: 'land-use', sources: ['SEPP', 'LEP', 'DCP', 'Property layers'] },
    { id: 'dual-occupancy', label: 'Dual occupancy', group: 'land-use', sources: ['LEP', 'DCP', 'SEPP', 'Property layers'] },
    { id: 'lot-size-fsr', label: 'Lot size & floor space ratio', group: 'built-form', sources: ['LEP', 'Property layers', 'SEPP', 'DCP'] },
    { id: 'other-controls', label: 'Other planning & building references', group: 'other', sources: ['LEP', 'DCP', 'SEPP', 'Property layers', 'Building code'] }
  ]);
  const text = (value, max = 500) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
  function url(value) {
    try { const item = new URL(value); return item.protocol === 'https:' && !item.username && !item.password ? item.href : ''; }
    catch (_) { return ''; }
  }
  function date(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
    const item = new Date(value + 'T00:00:00Z');
    return Number.isFinite(item.valueOf()) && item.toISOString().slice(0, 10) === value ? value : null;
  }
  function normalize(input = {}) {
    if (!input || typeof input !== 'object') input = {};
    const council = input.council || {}, project = input.project || {}, seen = new Set();
    const documents = (Array.isArray(council.documents) ? council.documents : []).slice(0, 60).map(item => ({
      title: text(item?.title, 300) || 'Reference name not supplied', kind: text(item?.kind, 60) || 'Reference',
      url: url(item?.url), status: text(item?.status, 60), checkedOn: date(item?.checkedOn),
      effectiveDate: date(item?.effectiveDate || item?.effective_date), version: text(item?.version, 160)
    })).filter(item => { const key = item.kind + '|' + item.title + '|' + item.url; if (seen.has(key)) return false; seen.add(key); return true; });
    const precision = typeof project.precision === 'string' ? text(project.precision, 150) : text(project.precision?.label, 150);
    return {
      council: { id: text(council.id, 100), name: text(council.name, 250), boundaryAvailable: council.boundaryAvailable !== false, coverage: text(council.coverageStatus, 80), coverageLabel: text(council.coverageLabel, 200), officialWebsite: url(council.officialWebsite), documents },
      project: { displayAddress: text(project.displayAddress, 300), councilNames: Array.isArray(project.councilNames) ? project.councilNames.map(item => text(item, 180)).filter(Boolean).slice(0, 5) : [], precision, councilId: text(project.councilId, 100), councilMatchStatus: text(project.councilMatchStatus, 80) || 'not_checked' },
      browsing: input.browsing === true || !text(project.displayAddress, 300) || Boolean(project.councilId && council.id && project.councilId !== council.id)
    };
  }
  function sourceStatus(item) {
    if (item.status === 'find_current_controls' || item.status === 'official_website_fallback') return 'Council website · current document still to locate';
    if (item.status === 'page_checked') return 'Official page checked · document content needs review';
    if (item.status === 'portal_checked') return 'Official portal checked · property information not evaluated';
    if (item.status === 'source_unavailable') return 'Source unavailable · content and applicability remain unverified';
    if (item.status === 'official_reference' || item.status === 'official_reference_checked') return 'Official reference identified · legal text not independently verified';
    return 'Reference metadata · professional content review pending';
  }
  function node(tag, copy, className) {
    const item = document.createElement(tag); if (copy !== undefined && copy !== null) item.textContent = copy; if (className) item.className = className; return item;
  }
  function button(copy, action, className = 'fpl-button') {
    const item = node('button', copy, className); item.type = 'button'; item.addEventListener('click', action); return item;
  }
  function external(copy, href) {
    const item = node('a', copy, 'fpl-source-link'); item.href = href; item.target = '_blank'; item.rel = 'noopener noreferrer';
    item.setAttribute('aria-label', copy + ' (official source, opens in a new tab)'); item.title = 'Opens the official source in a new tab'; return item;
  }
  function visible(item) { return item.isConnected && !item.closest('[hidden]') && item.getClientRects().length > 0; }

  function init(root, options = {}) {
    if (!root) return { update() {}, openTopic() { return false; }, getState() { return { ready: false, topicBindingsConnected: false }; } };
    if (root._firstPrinciplePlanningLibrary) return root._firstPrinciplePlanningLibrary;
    let state = normalize(), signature = '', activeTopic = null, directoryMode = 'topics', savedScroll = null;
    const shell = node('section', null, 'fpl-library'); shell.setAttribute('aria-label', 'Council and planning references');
    const summary = node('div', null, 'fpl-summary'), content = node('div', null, 'fpl-content');
    const live = node('p', '', 'fpl-sr-only'); live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite');
    shell.append(summary, content, live); root.append(shell);
    shell.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      const disclosure = event.target.closest('details[open]'); if (!disclosure || !shell.contains(disclosure)) return;
      disclosure.open = false; event.preventDefault(); event.stopPropagation();
      const trigger = disclosure.querySelector('summary'); if (trigger) headingFocus(trigger);
    });

    function announce(copy) { live.textContent = copy; }
    function headingFocus(item, preventScroll = true) { if (visible(item)) item.focus({ preventScroll }); }
    function referenceCard(item) {
      const card = node('article', null, 'fpl-reference'); card.dataset.sourceKind = item.kind; card.dataset.sourceStatus = item.status;
      card.append(node('p', item.kind + ' · General directory entry', 'fpl-reference-kind'));
      card.append(item.url ? external(item.title, item.url) : node('h5', item.title, 'fpl-reference-title'));
      card.append(node('p', sourceStatus(item), 'fpl-reference-status'));
      if (!item.url) card.append(node('p', 'Official source link not connected', 'fpl-warning'));
      const details = node('details', null, 'fpl-reference-meta'); details.append(node('summary', 'Dates, version & applicability'));
      const list = node('dl');
      [['Reference checked', item.checkedOn || 'Check date not recorded'], ['Effective date', item.effectiveDate || 'Not verified'], ['Applicable version', item.version || 'Not verified'], ['Property applicability', 'Not checked']].forEach(([label, value]) => { list.append(node('dt', label), node('dd', value)); });
      details.append(list, node('p', 'A reference check is not an effective-date or property-applicability check.', 'fpl-fine-print'));
      card.append(details);
      if (item.kind === 'Building code') card.append(node('p', 'Building-code checks and planning permission are separate requirements.', 'fpl-fine-print'));
      return card;
    }
    function directory() {
      const wrapper = node('div', null, 'fpl-source-directory');
      wrapper.append(node('p', 'These are general references supplied for this council. They have not been verified as relevant to the selected topic or property.', 'fpl-copy'));
      FAMILIES.forEach(family => {
        const records = state.council.documents.filter(item => item.kind === family.kind);
        const group = node('details', null, 'fpl-family'); group.dataset.sourceFamily = family.id;
        const label = node('summary'); label.append(node('span', family.label), node('small', records.length ? records.length + ' general ' + (records.length === 1 ? 'entry' : 'entries') : 'Not connected'));
        group.append(label);
        if (records.length) records.forEach(item => group.append(referenceCard(item)));
        else group.append(node('p', 'No reference in this source family is connected here. This does not mean there are no applicable requirements.', 'fpl-copy fpl-empty-family'));
        wrapper.append(group);
      });
      const other = state.council.documents.filter(item => !FAMILIES.some(family => family.kind === item.kind));
      if (other.length) { const group = node('details', null, 'fpl-family'); group.append(node('summary', 'Unclassified reference metadata')); other.forEach(item => group.append(referenceCard(item))); wrapper.append(group); }
      if (!state.council.documents.length) wrapper.append(node('p', 'No council references are connected yet. This does not mean there are no applicable planning requirements.', 'fpl-notice'));
      if (state.council.officialWebsite) wrapper.append(external('Open council website', state.council.officialWebsite));
      return wrapper;
    }
    function renderSummary() {
      summary.replaceChildren();
      summary.append(node('p', state.browsing ? 'BROWSING COUNCIL REFERENCES' : 'YOUR SELECTED PROPERTY', 'fpl-kicker'));
      const title = node('h3', state.council.name || 'Council & planning references', 'fpl-council-title'); title.tabIndex = -1; title.dataset.libraryHeading = 'true'; summary.append(title);
      if (state.project.displayAddress) summary.append(node('p', 'Selected property: ' + state.project.displayAddress, 'fpl-address'));
      if (state.browsing) {
        const copy = state.project.displayAddress ? 'You are browsing ' + (state.council.name || 'council references') + '. Your selected address and report have not changed.' : 'Browse NSW council references, or enter an address to start a property-specific check.';
        summary.append(node('p', copy, 'fpl-context-notice'));
      } else {
        const matched = ['unique_official_match', 'official_unique_match'].includes(state.project.councilMatchStatus) && state.project.councilId === state.council.id;
        summary.append(node('p', matched ? 'Council match: ' + state.council.name + '. Property-specific controls still need checking.' : 'Council match needs confirmation. Property-specific controls still need checking.', 'fpl-context-notice'));
      }
      if (state.project.precision) summary.append(node('p', 'Location precision: ' + state.project.precision.replace(/_/g, ' '), 'fpl-precision'));
      if (state.council.coverage === 'not_available') summary.append(node('p', (state.council.coverageLabel ? state.council.coverageLabel + '. ' : '') + 'Confirm the responsible authority and current local documents. NSW references are not applied to other jurisdictions.', 'fpl-warning'));
      if (!state.council.name) summary.append(node('p', 'Choose a NSW council to view its available reference directory. You can explore the topics below without choosing a property.', 'fpl-copy'));
      const count = state.council.documents.length;
      summary.append(node('p', '11 topics to explore · ' + count + ' general reference ' + (count === 1 ? 'entry' : 'entries'), 'fpl-count'));
      const actions = node('div', null, 'fpl-context-actions');
      if (state.browsing && state.project.displayAddress && state.project.councilNames.length && typeof options.onReturnToProperty === 'function') actions.append(button("Return to my property's council", () => options.onReturnToProperty(), 'fpl-text-button'));
      if (state.council.id && state.council.boundaryAvailable && typeof options.onBoundary === 'function') actions.append(button('View council boundary', () => options.onBoundary(), 'fpl-text-button'));
      if (actions.childElementCount) summary.append(actions);
    }
    function saveListScroll() {
      const parents = []; let parent = root;
      while (parent) { parents.push({ node: parent, top: parent.scrollTop, left: parent.scrollLeft }); parent = parent.parentElement; }
      savedScroll = { parents, x: scope.scrollX || 0, y: scope.scrollY || 0 };
    }
    function restoreListScroll() {
      if (!savedScroll) return false;
      savedScroll.parents.forEach(item => { item.node.scrollTop = item.top; item.node.scrollLeft = item.left; });
      if (typeof scope.scrollTo === 'function') scope.scrollTo({ left: savedScroll.x, top: savedScroll.y, behavior: 'instant' });
      return true;
    }
    function notifyNavigation() {
      if (typeof options.onNavigate === 'function') options.onNavigate({ councilId: state.council.id || null, topicId: activeTopic });
    }
    function renderCategories(restoreId) {
      content.replaceChildren();
      const modes = node('div', null, 'fpl-directory-modes'); modes.setAttribute('aria-label', 'Planning reference views');
      [['topics', 'Planning topics'], ['sources', 'By source family']].forEach(([id, label]) => {
        const action = button(label, () => {
          directoryMode = id; activeTopic = null; renderCategories();
          const target = content.querySelector('[data-library-mode="' + id + '"]'); if (target) headingFocus(target);
          announce(id === 'topics' ? 'Planning topics shown.' : 'General source directory shown.');
        }, 'fpl-mode-button');
        action.setAttribute('aria-pressed', String(directoryMode === id)); action.dataset.libraryMode = id; modes.append(action);
      });
      content.append(modes);
      if (directoryMode === 'sources') {
        content.append(node('h4', 'General reference directory', 'fpl-view-heading'), directory());
      } else {
        content.append(node('h4', 'Topics to explore', 'fpl-view-heading'), node('p', 'Topic-specific references and professionally reviewed details are not connected yet. A topic is a question to investigate, not a detected risk or permission.', 'fpl-copy'));
        GROUPS.forEach(group => {
          const section = node('section', null, 'fpl-topic-group'); section.dataset.topicGroup = group.id; section.append(node('h5', group.label));
          TOPICS.filter(item => item.group === group.id).forEach(topic => {
            const action = button(null, () => openTopic(topic.id, { userInitiated: true }), 'fpl-topic-button'); action.dataset.topicId = topic.id;
            const copy = node('span', null, 'fpl-topic-copy'); copy.append(node('strong', topic.label), node('small', 'Details not connected'));
            const arrow = node('span', '›', 'fpl-topic-arrow'); arrow.setAttribute('aria-hidden', 'true'); action.append(copy, arrow); section.append(action);
          }); content.append(section);
        });
      }
      content.append(node('p', 'These are references to check, not a decision that development is permitted.', 'fpl-boundary-note'));
      if (restoreId) {
        const restored = restoreListScroll();
        const target = content.querySelector('[data-topic-id="' + restoreId + '"]');
        if (target && visible(target)) target.focus({ preventScroll: restored });
      }
    }
    function renderDetail(topic, moveFocus) {
      content.replaceChildren();
      const back = button('← Back to planning topics', () => { activeTopic = null; directoryMode = 'topics'; renderCategories(topic.id); announce('Planning topics shown.'); notifyNavigation(); }, 'fpl-text-button'); back.dataset.libraryBack = 'true';
      const title = node('h4', topic.label, 'fpl-detail-heading'); title.tabIndex = -1;
      content.append(back, node('p', (state.council.name || 'Council references') + ' / ' + topic.label, 'fpl-breadcrumb'), title,
        node('span', 'Details not connected', 'fpl-state-badge'),
        node('p', "Detailed content for this topic is not connected yet. Browse the council's general references or open an available official source.", 'fpl-copy'),
        node('p', 'No topic-specific reference has been curated yet. A general directory entry does not establish a requirement for this property.', 'fpl-notice'));
      const sourceSection = node('section', null, 'fpl-topic-sources'); sourceSection.append(node('h5', 'Sources to check'));
      const kinds = node('ul', null, 'fpl-source-chips'); topic.sources.forEach(kind => kinds.append(node('li', FAMILIES.find(item => item.kind === kind)?.label || kind)));
      sourceSection.append(kinds, node('p', 'These are source families to investigate, not confirmed topic coverage or applicable rules.', 'fpl-fine-print')); content.append(sourceSection);
      const general = node('details', null, 'fpl-general-references'); general.dataset.generalReferences = 'true'; general.append(node('summary', 'Browse general council references'), directory()); content.append(general);
      const checks = node('dl', null, 'fpl-detail-checks'); [['Effective date', 'Not verified'], ['Property applicability', 'Not checked'], ['Professional content review', 'Not completed for this topic']].forEach(([key, value]) => checks.append(node('dt', key), node('dd', value))); content.append(checks);
      if (typeof options.onAsk === 'function') {
        const ask = button('Use this topic in my question', () => options.onAsk(topic.label), 'fpl-button fpl-primary'); ask.dataset.libraryAsk = topic.id; content.append(ask);
        const hint = node('p', questionContextCopy(), 'fpl-fine-print'); hint.dataset.libraryQuestionContext = 'true'; content.append(hint);
      }
      content.append(node('p', 'These are references to check, not a decision that development is permitted.', 'fpl-boundary-note'));
      if (moveFocus) headingFocus(title, false);
    }
    function questionContextCopy() { return state.project.displayAddress ? 'Questions apply to your selected property, even while you browse another council.' : 'Keep this topic and add a property address when you want a property-specific check.'; }
    function openTopic(topicId, settings = {}) {
      if (topicId === null) { activeTopic = null; directoryMode = 'topics'; savedScroll = null; renderCategories(); return true; }
      const topic = TOPICS.find(item => item.id === topicId); if (!topic) return false;
      if (!activeTopic && settings.userInitiated) saveListScroll();
      if (!settings.userInitiated) savedScroll = null;
      activeTopic = topic.id; renderDetail(topic, settings.userInitiated === true);
      if (settings.userInitiated) { announce(topic.label + ' selected. Topic-specific details are not connected.'); notifyNavigation(); }
      return true;
    }
    function update(input) {
      const next = normalize(input), nextSignature = JSON.stringify(next); if (nextSignature === signature) return api;
      const contextChanged = next.council.id !== state.council.id || next.council.name !== state.council.name;
      const referencesChanged = JSON.stringify(next.council) !== JSON.stringify(state.council);
      state = next; signature = nextSignature;
      if (contextChanged) { activeTopic = null; directoryMode = 'topics'; savedScroll = null; }
      renderSummary();
      if (contextChanged || referencesChanged || !content.childElementCount) {
        if (activeTopic) renderDetail(TOPICS.find(item => item.id === activeTopic), false); else renderCategories();
      } else {
        const hint = content.querySelector('[data-library-question-context]'); if (hint) hint.textContent = questionContextCopy();
      }
      return api;
    }
    function getState() {
      return { ready: Boolean(state.council.name), councilId: state.council.id || null, councilName: state.council.name || null,
        context: state.browsing ? 'browsing_council' : 'selected_project', browsing: state.browsing, projectAddress: state.project.displayAddress, councilMatchStatus: state.project.councilMatchStatus,
        view: activeTopic ? 'detail' : 'categories', topicId: activeTopic, directoryMode, topicCount: TOPICS.length, topicGroupCount: GROUPS.length, sourceFamilyCount: FAMILIES.length,
        generalReferenceCount: state.council.documents.length, curatedTopicReferenceCount: 0, reviewedTopicDetailCount: 0,
        topicBindingsConnected: false, professionalVerificationCompleted: false, canAuthorizeProgression: false };
    }
    const api = { update, openTopic, getState }; root._firstPrinciplePlanningLibrary = api; update({}); return api;
  }
  const api = Object.freeze({ init, TOPICS, GROUPS, FAMILIES, normalize });
  scope.FirstPrinciplePlanningLibrary = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
