/* Read-only Project v1 dashboard. Persistence and authorization stay in local-projects.js/cloud-project-repository.js. */
(function (scope) {
  'use strict';
  const WORKFLOW = Object.freeze({
    discovery: {label: 'Find a property', detail: 'Property discovery is the saved workflow position.'},
    overview: {label: 'Planning overview', detail: 'The planning overview is the saved workflow position.'},
    development: {label: 'Choose a project', detail: 'Project selection is the saved workflow position.'},
    assessment: {label: 'Planning assessment', detail: 'Planning assessment is the saved workflow position.'}
  });
  const VERIFICATION = Object.freeze({
    not_checked: 'Not checked', previously_retrieved: 'Previously retrieved; recheck when opened',
    rechecking: 'Being rechecked', current_query_completed: 'Current query completed'
  });
  const DEVELOPMENT_LABELS = Object.freeze({
    granny: 'Secondary dwelling', dual: 'Dual occupancy', storey: 'Extension', pool: 'Swimming pool',
    shed: 'Shed or garage', carport: 'Carport', subdiv: 'Subdivision', home: 'Home business',
    'new-home': 'New home', apartments: 'Apartments', 'multi-dwelling': 'Multi-dwelling housing',
    'manor-house': 'Manor house', other: 'Other project'
  });
  const ROADMAP_FALLBACK = Object.freeze([
    'Receive enquiry', 'Check local controls', 'Define service scope', 'Prepare drawings',
    'Specialist evidence', 'Supporting package', 'Professional review', 'Application process',
    'Authority assessment', 'Outcome'
  ]);
  const SECTIONS = Object.freeze(['overview', 'roadmap', 'tasks', 'documents', 'assistant', 'specialists', 'activity']);
  let mountNumber = 0;
  const text = (value, limit = 320) => typeof value === 'string' || typeof value === 'number'
    ? String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit) : '';
  function el(tag, content, className) {
    const item = document.createElement(tag);
    if (content !== undefined && content !== null) item.textContent = String(content);
    if (className) item.className = className;
    return item;
  }
  function button(label, handler, className = '') {
    const item = el('button', label, 'pd-button' + (className ? ' ' + className : ''));
    item.type = 'button'; item.addEventListener('click', handler); return item;
  }
  function date(value) {
    const parsed = new Date(text(value, 80));
    if (!text(value, 80) || Number.isNaN(parsed.getTime())) return 'Not available';
    return new Intl.DateTimeFormat('en-AU', {day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'}).format(parsed);
  }
  function projectValue(project) {
    const developmentId = text(project?.developmentType, 100);
    const development = DEVELOPMENT_LABELS[developmentId] || developmentId;
    const workflow = WORKFLOW[text(project?.currentWorkflowStep, 30)] || {label: 'Workflow position not recorded', detail: 'The saved record does not include a supported workflow position.'};
    const verification = VERIFICATION[text(project?.dataVerificationStatus, 50)] || 'Verification status not recorded';
    const reference = project?.propertyReference && typeof project.propertyReference === 'object' ? project.propertyReference : null;
    return {
      id: text(project?.id, 100), name: text(project?.projectName, 120) || 'Untitled project',
      address: text(project?.selectedAddress, 300) || 'Property address not recorded',
      propertyId: text(reference?.propertyId, 100), lotLabels: Array.isArray(reference?.lotLabels) ? reference.lotLabels.map(item => text(item, 160)).filter(Boolean).slice(0, 100) : [],
      parcelId: text(project?.parcelId, 160), councilId: text(project?.councilId, 80), development: development || 'Development type not recorded',
      workflowKey: text(project?.currentWorkflowStep, 30), workflow, verification,
      created: date(project?.createdAt), updated: date(project?.updatedAt),
      planningRefs: Array.isArray(project?.planningDataReferences) ? project.planningDataReferences.length : 0,
      assessmentRefs: Array.isArray(project?.assessmentReferences) ? project.assessmentReferences.length : 0
    };
  }
  function init(root, callbacks = {}) {
    if (!root) throw new Error('A Project Dashboard container is required.');
    if (root._firstPrincipleProjectDashboard) return root._firstPrincipleProjectDashboard;
    root.classList.add('pd-dashboard'); root.hidden = true;
    const idPrefix = 'pd-' + (++mountNumber) + '-';
    let current = null, activeSection = 'overview', status = 'empty';
    const heading = el('h1', 'Project Dashboard', 'pd-title'); heading.tabIndex = -1; heading.id = idPrefix + 'title';
    root.setAttribute('aria-labelledby', heading.id);
    const message = el('p', '', 'pd-message'); message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite'); message.hidden = true;
    const header = el('header', null, 'pd-header');
    const headerCopy = el('div'); headerCopy.append(el('p', 'SAVED PROJECT', 'pd-kicker'), heading, el('p', 'A read-only view of the saved project information in your account.', 'pd-intro'));
    const actions = el('div', null, 'pd-header-actions');
    const continueButton = button('Continue Working', () => callbacks.onContinueWorking?.(current?.id), 'pd-button pd-primary');
    continueButton.disabled = true;
    actions.append(button('Back to My Projects', () => callbacks.onBack?.(), 'pd-button pd-secondary'), continueButton);
    header.append(headerCopy, actions);
    const summary = el('dl', null, 'pd-summary');
    const nav = el('nav', null, 'pd-nav'); nav.setAttribute('aria-label', 'Project Dashboard sections'); nav.setAttribute('role', 'tablist');
    const content = el('div', null, 'pd-sections');
    const sections = {};
    const sectionTitles = {overview: 'Overview', roadmap: 'Roadmap', tasks: 'Tasks', documents: 'Documents', assistant: 'AI Assistant', specialists: 'Specialists', activity: 'Activity History'};
    SECTIONS.forEach(key => {
      const tab = button(sectionTitles[key], () => showSection(key, false), 'pd-tab'); tab.dataset.dashboardSection = key; tab.id = idPrefix + 'tab-' + key; tab.setAttribute('aria-controls', idPrefix + 'panel-' + key); tab.setAttribute('role', 'tab');
      tab.addEventListener('keydown', event => {
        const index = SECTIONS.indexOf(key); let next = null;
        if (event.key === 'ArrowRight') next = SECTIONS[(index + 1) % SECTIONS.length];
        else if (event.key === 'ArrowLeft') next = SECTIONS[(index - 1 + SECTIONS.length) % SECTIONS.length];
        else if (event.key === 'Home') next = SECTIONS[0];
        else if (event.key === 'End') next = SECTIONS[SECTIONS.length - 1];
        if (!next) return;
        event.preventDefault(); showSection(next, false); sections[next].tab.focus({preventScroll: true});
      });
      const panel = el('section', null, 'pd-section'); panel.id = idPrefix + 'panel-' + key; panel.dataset.dashboardSection = key; panel.tabIndex = 0; panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', tab.id); panel.hidden = true;
      nav.append(tab); content.append(panel); sections[key] = {tab, panel};
    });
    const footer = el('p', 'This dashboard shows saved project information only. Local PDFs, briefs, synthetic readings, AI output and specialist drafts are not stored in this project record.', 'pd-boundary');
    root.append(header, message, summary, nav, content, footer);
    function setMessage(value, error = false) { message.textContent = text(value, 500); message.hidden = !message.textContent; message.classList.toggle('pd-error', error); }
    function field(label, value, status = '') { const item = el('div', null, 'pd-summary-item'); item.append(el('dt', label), el('dd', value)); if (status) item.append(el('small', status, 'pd-field-status')); return item; }
    function renderSummary(value) {
      summary.replaceChildren(field('Project name', value.name), field('Property address', value.address), field('Property reference', value.propertyId || value.parcelId || 'Not recorded', value.lotLabels.length ? 'Lot: ' + value.lotLabels.join(', ') : ''), field('Development type', value.development), field('Saved workflow stage', value.workflow.label, value.workflow.detail), field('Information requiring verification', value.verification), field('Created', value.created), field('Last updated', value.updated));
    }
    function list(items, className = 'pd-list') { const result = el('ul', null, className); items.forEach(item => result.append(el('li', item))); return result; }
    function renderSections(value, rawProject) {
      sections.overview.panel.replaceChildren(el('h2', 'Project overview'), el('p', 'These details are read from the saved project record. Planning information is rechecked when you continue working.'), summary.cloneNode(true));
      sections.roadmap.panel.replaceChildren(el('h2', 'Project roadmap'), el('p', 'The saved workflow position is shown separately from future preparation and external review.'), el('div', null, 'pd-roadmap-current'));
      const roadmap = sections.roadmap.panel.querySelector('.pd-roadmap-current'); roadmap.append(el('strong', 'Saved position: ' + value.workflow.label), el('p', value.workflow.detail));
      const progress = scope.FirstPrincipleProjectProgress?.deriveProgress?.({hasContext: true, route: null, supportedNSW: false});
      const stages = progress?.stages || ROADMAP_FALLBACK.map(label => ({label, statusLabel: 'Suggested', reason: 'This stage is not recorded as completed in the saved project.'}));
      const details = el('details', null, 'pd-roadmap-details'); details.append(el('summary', 'View the full 10-stage project journey'));
      const stageList = el('ol', null, 'pd-roadmap-list'); stageList.setAttribute('aria-label', 'Suggested ten-stage project journey');
      stages.slice(0, 10).forEach(stage => {
        const item = el('li', null, 'pd-roadmap-stage');
        const stageStatus = stage.status === 'not_connected' ? 'External step · not recorded' : 'Suggested · progress not recorded';
        item.append(el('strong', stage.label), el('span', stageStatus, 'pd-stage-status'), el('p', stage.reason || 'This stage remains a suggestion and requires the appropriate review.'));
        stageList.append(item);
      });
      details.append(stageList); roadmap.append(el('h3', 'Suggested future stages'), details);
      roadmap.append(el('p', 'Suggested stages are not saved task completions. Professional review, regulatory lodgement and authority outcomes remain external and unverified.', 'pd-note'));
      sections.tasks.panel.replaceChildren(el('h2', 'Suggested next actions'), el('p', 'These are read-only suggestions derived from the saved project information. No task record is created.'), list(value.workflowKey === 'assessment' ? ['Recheck the planning information before relying on it', 'Review unresolved evidence with the responsible professional'] : ['Continue the saved project workflow', 'Review the property information before progressing'], 'pd-task-list'));
      const labelFor = target => callbacks.getContinuationLabel?.(rawProject, target) || (target === 'drawings' ? 'Continue to drawing preparation' : 'Continue to specialist preparation');
      sections.documents.panel.replaceChildren(el('h2', 'Documents'), el('p', 'Documents are not yet saved to this project.'), el('p', 'Drawing review stays in this browser. Continue to the property assessment first when the current report is not available.', 'pd-note'), button(labelFor('drawings'), () => callbacks.onContinueWorking?.(value.id, 'drawings'), 'pd-button pd-primary'));
      sections.assistant.panel.replaceChildren(el('h2', 'AI Assistant'), el('p', 'No live AI Agent is connected to this dashboard.'), el('p', 'Deterministic guidance and source-backed preparation remain available in the project workflow. No agent action has run.', 'pd-note'));
      sections.specialists.panel.replaceChildren(el('h2', 'Specialists'), el('p', 'Specialist support has not yet been requested.'), el('p', 'No referral or engagement is stored. Continue to the property assessment first when the current report is not available.', 'pd-note'), button(labelFor('specialists'), () => callbacks.onContinueWorking?.(value.id, 'specialists'), 'pd-button pd-secondary'));
      sections.activity.panel.replaceChildren(el('h2', 'Activity history'), el('p', 'Only reliable saved timestamps and record metadata are shown.'), list(['Project created: ' + value.created, 'Project last updated: ' + value.updated], 'pd-activity-list'));
    }
    function showSection(key, focus = true) {
      activeSection = SECTIONS.includes(key) ? key : 'overview';
      SECTIONS.forEach(item => { const selected = item === activeSection; sections[item].tab.setAttribute('aria-selected', String(selected)); sections[item].tab.tabIndex = selected ? 0 : -1; sections[item].panel.hidden = !selected; });
      if (focus) {
        const title = sections[activeSection].panel.querySelector('h2');
        if (title) { title.tabIndex = -1; title.focus({preventScroll: true}); }
      }
    }
    function clearPanels() { Object.values(sections).forEach(({panel}) => panel.replaceChildren()); }
    function showLoading() { current = null; status = 'loading'; continueButton.disabled = true; root.hidden = false; setMessage('Loading this saved project...'); summary.replaceChildren(); clearPanels(); showSection('overview', false); }
    function showError(value) { current = null; status = 'error'; continueButton.disabled = true; root.hidden = false; setMessage(value || 'This project could not be loaded. It may have been deleted or is unavailable.', true); summary.replaceChildren(); clearPanels(); showSection('overview', false); }
    function show(project, options = {}) {
      if (!project || typeof project !== 'object' || !text(project.id, 100)) { clear(); setMessage('This project could not be loaded. It may have been deleted or is unavailable.', true); return false; }
      current = projectValue(project); status = 'ready'; continueButton.disabled = false; activeSection = options.section || 'overview'; root.hidden = false; setMessage(''); renderSummary(current); renderSections(current, project); showSection(activeSection, false); return true;
    }
    function clear() { current = null; status = 'empty'; continueButton.disabled = true; root.hidden = true; summary.replaceChildren(); clearPanels(); showSection('overview', false); }
    showSection('overview', false);
    const api = {show, showLoading, showError, clear, showPage(visible) { root.hidden = !visible; }, showSection, getState() { return {status, projectId: current?.id || null, activeSection}; }};
    root._firstPrincipleProjectDashboard = api; return api;
  }
  scope.FirstPrincipleProjectDashboard = Object.freeze({init, projectValue});
})(typeof window !== 'undefined' ? window : globalThis);
