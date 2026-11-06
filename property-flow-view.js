/* Progressive property-flow presentation. No requests, stored facts or legal inference. */
(function (scope) {
  'use strict';
  const PAGES = ['discovery', 'overview', 'development', 'assessment'];
  // User-facing descriptions, not statutory development definitions.
  const PROJECT_NOTES = Object.freeze({
    granny: 'Add a smaller home alongside the main dwelling.',
    dual: 'Explore two dwellings on the property.',
    storey: 'Add space or another storey to an existing home.',
    pool: 'Plan a pool and its associated works.',
    shed: 'Add storage, a workshop or enclosed parking.',
    carport: 'Add covered parking.',
    subdiv: 'Explore dividing the property into separate lots.',
    home: 'Explore using part of your home for business.',
    'new-home': 'Plan a new house.',
    apartments: 'Explore a building with multiple homes.',
    'multi-dwelling': 'Explore a group of homes on the property.',
    'manor-house': 'Explore a small building with multiple homes.',
    other: 'Start with a project that does not fit these options.'
  });
  const copy = (value, limit = 350) => value === null || value === undefined ? '' : String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit);
  const list = value => Array.isArray(value) ? value : [];
  function element(tag, text, className) {
    const item = document.createElement(tag);
    if (text !== undefined && text !== null) item.textContent = text;
    if (className) item.className = className;
    return item;
  }
  function action(label, name, handler, primary = false) {
    const item = element('button', label, 'pf-button' + (primary ? ' pf-primary' : ''));
    item.type = 'button'; item.dataset.propertyFlowAction = name;
    item.addEventListener('click', handler); return item;
  }
  function init(root, callbacks = {}) {
    if (!root) return { update() {}, getState() { return { page: 'discovery' }; }, slots: {}, pages: {} };
    if (root._firstPrinciplePropertyFlow) return root._firstPrinciplePropertyFlow;
    root.classList.add('pf-flow');
    let state = { page: 'discovery' }, signature = '', previewSignature = '', projectSignature = '';
    const invoke = (name, ...args) => { if (typeof callbacks[name] === 'function') callbacks[name](...args); };
    const discoveryPreview = element('section', null, 'pf-preview');
    discoveryPreview.setAttribute('aria-label', 'Location and property preview');
    const previewHeader = element('div', null, 'pf-progressive-header');
    const previewKicker = element('p', 'PROPERTY PREVIEW', 'pf-kicker');
    previewKicker.setAttribute('role', 'status'); previewKicker.setAttribute('aria-live', 'polite'); previewKicker.tabIndex = -1;
    const previewToggle = action('Review property', 'preview-toggle', () => {});
    const previewSummary = element('div', null, 'pf-compact-summary'); previewSummary.dataset.propertyConfirmationSummary = 'true';
    const previewDetails = element('div', null, 'pf-preview-details'); previewDetails.id = 'pf-property-confirmation-details';
    const previewWarning = element('p', 'Address only — the official parcel boundary and parcel-linked planning controls are not verified. Continuing does not confirm ownership, zoning or development permission.', 'pf-limited-warning');
    previewWarning.dataset.propertyConfirmationMode = 'address_only'; previewWarning.hidden = true;
    const previewActions = element('div', null, 'pf-preview-actions');
    const previewNext = action('Continue to Planning Overview →', 'continue-overview', () => invoke('onOverview'), true);
    previewNext.dataset.propertyNext = 'overview'; previewNext.setAttribute('aria-describedby', 'pf-property-confirmation-status');
    previewActions.append(previewNext); previewHeader.append(previewKicker, previewToggle);
    discoveryPreview.append(previewHeader, previewSummary, previewWarning, previewDetails, previewActions);
    const previewCard = scope.FirstPrincipleProgressiveCards?.create({ root: discoveryPreview, toggle: previewToggle, content: previewDetails, summary: previewSummary, focusTarget: () => previewNext, onChange: card => { previewToggle.textContent = card.expanded ? 'Collapse details' : 'Review property'; } });
    const pages = {}, headings = {}, addresses = {};
    [['overview', 'PROPERTY PLANNING OVERVIEW', 'Your property, at a glance'], ['development', 'DEVELOPMENT TYPE', 'What do you want to build?'], ['assessment', 'PLANNING ASSESSMENT', 'Your project assessment']].forEach(([id, kicker, title]) => {
      const page = element('section', null, 'pf-page pf-page-' + id);
      page.dataset.flowPage = id; page.hidden = true;
      const heading = element('h2', title, 'pf-title'); heading.id = 'pf-' + id + '-title'; heading.tabIndex = -1;
      page.setAttribute('aria-labelledby', heading.id);
      const address = element('p', '', 'pf-address');
      page.append(element('p', kicker, 'pf-kicker'), heading, address); root.append(page);
      pages[id] = page; headings[id] = heading; addresses[id] = address;
    });
    const limitedWarnings = {};
    ['overview', 'assessment'].forEach(id => {
      const warning = element('aside', null, 'pf-limited-warning pf-page-limited');
      warning.dataset.propertyLimited = id; warning.setAttribute('aria-label', 'Limited planning information'); warning.hidden = true;
      warning.append(element('strong', 'Address confirmed only'), element('p', 'Official parcel identity, boundary and parcel-linked planning controls are not verified. You can continue with limited information; development permission remains unverified.'));
      pages[id].append(warning); limitedWarnings[id] = warning;
    });
    const overviewControls = element('div', null, 'pf-overview-controls');
    const overviewActions = element('div', null, 'pf-actions');
    const overviewBack = action('Back to Property', 'discovery', () => invoke('onDiscover'));
    const chooseProject = action('Continue to Choose a Project →', 'development', () => invoke('onDevelopment'), true);
    chooseProject.dataset.propertyNext = 'development';
    overviewActions.append(overviewBack, chooseProject);
    const coverage = element('div', null, 'pf-unchecked');
    coverage.append(element('h3', 'Not checked'), element('p', 'Bushfire and flooding · Not checked'), element('p', 'Survey, title and easements · Not checked'), element('p', 'These sources are not connected. Missing data does not mean no restriction or risk.', 'pf-fine'));
    pages.overview.append(overviewControls, coverage, overviewActions);
    const developmentIntro = element('p', 'Choose your project. These descriptions are not legal definitions or permission decisions.', 'pf-copy');
    const projects = element('div', null, 'pf-project-grid'); projects.setAttribute('aria-label', 'Development types');
    const projectStatus = element('p', 'Choose a project to continue.', 'pf-project-status');
    projectStatus.id = 'pf-project-selection-status'; projectStatus.setAttribute('role', 'status');
    const developmentActions = element('div', null, 'pf-actions pf-development-actions');
    const developmentBack = action('Back to Planning Overview', 'overview', () => invoke('onOverview'));
    const viewAssessment = action('View Planning Assessment →', 'assessment', () => invoke('onAssessment'), true);
    viewAssessment.dataset.propertyNext = 'assessment'; viewAssessment.setAttribute('aria-describedby', projectStatus.id);
    developmentActions.append(developmentBack, viewAssessment);
    const projectBrief=element('aside',null,'pf-project-brief');
    const projectSummary=element('div',null,'pf-compact-summary');projectSummary.dataset.projectSelectionSummary='true';
    const projectToggle=action('Edit project type','project-toggle',()=>{});
    projectBrief.append(element('h3','Your project intent'),developmentIntro,projectStatus,projectSummary,projectToggle);
    const projectWorkspace=element('div',null,'pf-project-workspace');
    projects.id='pf-project-selection-details';
    projectWorkspace.append(projectBrief,projects);
    pages.development.append(projectWorkspace,developmentActions);
    const projectCard=scope.FirstPrincipleProgressiveCards?.create({root:projectWorkspace,toggle:projectToggle,content:projects,summary:projectSummary,focusTarget:()=>viewAssessment,onChange:card=>{projectToggle.textContent=card.expanded?'Collapse options':'Edit project type';developmentIntro.hidden=card.complete&&!card.expanded;}});
    const assessmentSummary = element('div', null, 'pf-assessment-summary');
    const assessmentProject = element('p', '', 'pf-project-name');
    const assessmentHeading=element('div',null,'pf-assessment-heading');
    assessmentHeading.append(assessmentProject,element('span','Further Assessment Required','pf-review-status'));
    assessmentSummary.dataset.assessmentSummary='true';
    assessmentSummary.append(addresses.assessment,assessmentHeading,element('p','Available planning data does not yet establish development permission.','pf-fine'));
    const assessmentActions = element('div', null, 'pf-actions pf-assessment-actions');
    assessmentActions.append(action('Change Project', 'change-project', () => invoke('onDevelopment')), action('Start a New Search', 'new-search', () => invoke('onStartNewSearch')));
    const assessmentContent = element('div', null, 'pf-assessment-content');
    pages.assessment.append(assessmentSummary, assessmentActions, assessmentContent);

    function normalize(input = {}) {
      const selection = input.selection && typeof input.selection === 'object' ? input.selection : null;
      const raw = input.spatial && typeof input.spatial === 'object' ? input.spatial : null;
      const associated = Boolean(selection && raw && raw.address === selection.name && (!selection.propertyId || !raw.property || String(selection.propertyId) === String(raw.property.id)));
      const spatial = associated ? raw : null;
      const browsing = input.browsingCouncil?.properties || input.browsingCouncil || null;
      const available = spatial?.mapLayers || {};
      return {
        page: PAGES.includes(input.page) ? input.page : 'discovery',
        address: copy(selection?.name), kind: copy(selection?.kind, 40), state: copy(selection?.state, 12), precision: copy(selection?.precision, 50),
        selectionPropertyId: copy(selection?.propertyId, 100),
        councilName: copy(input.councilName || browsing?.council_name || browsing?.councilName || browsing?.name), councilId: copy(browsing?.id, 100),
        confirmed: input.confirmed === true, canConfirm: input.canConfirm === true,
        confirmationMode: ['parcel', 'address_only'].includes(input.confirmationMode) ? input.confirmationMode : '',
        confirmationIssue: ['ambiguous', 'identity_conflict'].includes(input.confirmationIssue) ? input.confirmationIssue : '',
        projectChosen: input.projectChosen === true,
        projectId: copy(input.projectId, 60), querying: input.querying === true || spatial?.status === 'loading',
        spatialStatus: copy(spatial?.status || (selection ? 'idle' : ''), 40),
        propertyId: copy(spatial?.property?.id, 100), matchStatus: copy(spatial?.match?.status, 80),
        lots: list(spatial?.property?.lotLabels).map(value => copy(value, 180)).filter(Boolean),
        candidates: list(spatial?.propertyCandidates).slice(0, 50).map(item => ({ id: copy(item?.id, 100), label: copy(item?.label, 250) })).filter(item => item.id),
        mapLayers: { property: available.property === true, lots: available.lots === true, zoning: available.zoning === true },
        visibleLayers: { property: input.visibleLayers?.property !== false, lots: input.visibleLayers?.lots !== false, zoning: input.visibleLayers?.zoning === true }
      };
    }
    function renderPreview() {
      const current = document.activeElement;
      const focusKey = discoveryPreview.contains(current) ? current.dataset.propertyFlowAction || (current.dataset.spatialLayer ? 'layer:' + current.dataset.spatialLayer : current.dataset.propertyCandidate ? 'candidate:' + current.dataset.propertyCandidate : '') : '';
      previewDetails.replaceChildren(); previewSummary.replaceChildren();
      const isProperty = state.kind === 'address';
      discoveryPreview.dataset.discoveryKind = isProperty ? 'property' : state.councilId ? 'council' : 'empty';
      previewKicker.textContent = isProperty ? state.confirmed ? state.confirmationMode === 'address_only' ? 'Address confirmed ✓' : 'Property confirmed ✓' : 'PROPERTY PREVIEW' : 'LOCATION SUMMARY';
      previewToggle.hidden = !state.confirmed || !previewCard;
      previewWarning.hidden = !isProperty || state.confirmationMode !== 'address_only' || Boolean(state.confirmationIssue);
      previewActions.hidden = !isProperty;
      previewNext.disabled = !state.confirmed || typeof callbacks.onOverview !== 'function';
      if (isProperty) {
        [previewDetails, previewSummary].forEach(container => {
          container.append(element('h3', state.address));
          if (state.councilName) container.append(element('p', 'Council: ' + state.councilName, 'pf-copy'));
          if (state.lots.length) container.append(element('p', 'Lot / plan: ' + state.lots.join(' · '), 'pf-fine'));
        });
        previewDetails.append(element('p', state.propertyId ? 'NSW Property ID ' + state.propertyId : state.state === 'NSW' ? 'Official parcel identity is not verified.' : 'Property-level planning data is unavailable outside NSW.', 'pf-copy'));
        let progressText = state.confirmed ? 'Property confirmed. Continue to its planning overview.' : state.canConfirm ? 'Review the address and map, then confirm this is your intended property.' : 'Search for a complete street-number address to continue.';
        if (state.confirmationMode === 'address_only') progressText = state.confirmed ? 'Address confirmed. You can continue with limited planning information.' : 'Confirm this address to continue with limited planning information.';
        if (state.querying && !state.confirmed) progressText = 'Checking official property data… You can confirm the located address while the parcel lookup continues.';
        if (state.confirmationIssue === 'ambiguous') progressText = 'More than one property may match. Choose the intended candidate below, or search a more specific address.';
        if (state.confirmationIssue === 'identity_conflict') progressText = 'The returned parcel does not match the selected address. Retry the lookup or search another address before continuing.';
        const progress = element('p', progressText, 'pf-preview-status');
        progress.id = 'pf-property-confirmation-status'; progress.setAttribute('role', 'status'); previewDetails.append(progress);
        if (state.candidates.length && !state.propertyId) {
          const fieldset = element('fieldset', null, 'pf-candidates'); fieldset.append(element('legend', 'Choose a property candidate'));
          state.candidates.forEach(candidate => {
            const item = action(candidate.label || 'Property ' + candidate.id, 'candidate:' + candidate.id, () => invoke('onCandidate', candidate.id));
            item.dataset.propertyCandidate = candidate.id; item.disabled = state.querying || typeof callbacks.onCandidate !== 'function'; fieldset.append(item);
          }); previewDetails.append(fieldset);
        }
        if (!state.confirmed) {
          const confirm = action(state.confirmationMode === 'address_only' ? 'Confirm this address' : 'Confirm this property', 'confirm', () => invoke('onConfirm'));
          confirm.dataset.propertyConfirm = 'true'; confirm.disabled = !state.canConfirm || typeof callbacks.onConfirm !== 'function';
          confirm.setAttribute('aria-describedby', progress.id); previewDetails.append(confirm);
        }
        const recoveryActions = element('div', null, 'pf-preview-recovery');
        if (state.state === 'NSW' && typeof callbacks.onQuery === 'function') {
          const query = action(state.querying ? 'Checking property…' : state.propertyId ? 'Refresh property match' : 'Retry property lookup', 'query', () => invoke('onQuery'));
          query.dataset.spatialQuery = 'true'; query.disabled = state.querying; recoveryActions.append(query);
        }
        if (typeof callbacks.onDiscover === 'function') recoveryActions.append(action('Search another address', 'find-address', () => invoke('onDiscover')));
        if (recoveryActions.childElementCount) previewDetails.append(recoveryActions);
      } else if (state.councilId) {
        previewDetails.append(element('h3', state.councilName || 'Selected council'), element('p', 'Explore this area, then search for a street-number address to select a property.', 'pf-copy'), element('p', 'Selecting a council does not select a parcel or assess a development.', 'pf-fine'));
      } else if (state.address) {
        previewDetails.append(element('h3', state.address), element('p', 'This is an area or street reference. Enter a complete street-number address to choose a property.', 'pf-copy'));
      } else {
        previewDetails.append(element('h3', 'Find your property'), element('p', 'Search by address, or choose a council to explore an area first.', 'pf-copy'));
      }
      const available = [['property', 'Property boundary'], ['lots', 'Lot boundaries'], ['zoning', 'Queried zoning features']].filter(([id]) => state.mapLayers[id]);
      if (available.length && typeof callbacks.onLayer === 'function') {
        const fieldset = element('fieldset', null, 'pf-map-layers'); fieldset.append(element('legend', 'Map layers'));
        available.forEach(([id, label]) => {
          const row = element('label', null, 'pf-layer-toggle'), checkbox = element('input');
          checkbox.type = 'checkbox'; checkbox.checked = state.visibleLayers[id]; checkbox.dataset.spatialLayer = id;
          checkbox.addEventListener('change', () => invoke('onLayer', id, checkbox.checked));
          row.append(checkbox, element('span', label)); fieldset.append(row);
        }); previewDetails.append(fieldset);
      }
      previewCard?.update({ key: [state.address, state.propertyId || state.selectionPropertyId || state.kind].join('|'), status: state.confirmed ? 'completed' : state.confirmationIssue ? 'error' : state.querying ? 'loading' : isProperty ? 'active' : 'idle', complete: state.confirmed, canCollapse: state.confirmed });
      if (!previewCard) previewSummary.hidden = true;
      if (focusKey) {
        const nextFocusKey = focusKey === 'confirm' && state.confirmed ? 'continue-overview' : focusKey;
        const replacement = [...discoveryPreview.querySelectorAll('button,input')].find(item => (item.dataset.propertyFlowAction || (item.dataset.spatialLayer ? 'layer:' + item.dataset.spatialLayer : '')) === nextFocusKey);
        const focusTarget=replacement&&!replacement.disabled&&!replacement.closest('[hidden]')?replacement:!previewToggle.hidden?previewToggle:previewKicker;
        focusTarget.focus({ preventScroll: true });
      }
    }
    function renderProjects() {
      const entries = list(scope.FirstPrincipleAssessmentModel?.PROJECTS);
      const nextSignature = JSON.stringify([state.confirmed, state.projectChosen, state.projectId, entries]);
      if (projectSignature === nextSignature) return;
      projectSignature = nextSignature; const current = document.activeElement?.dataset.developmentType;
      projects.replaceChildren();
      if (!entries.length) {
        const message = element('p', 'Development types could not load. Refresh to try again.', 'pf-unavailable');
        message.setAttribute('role', 'status'); projects.append(message); return;
      }
      entries.forEach(project => {
        const item = action('', 'project:' + copy(project.id, 60), () => invoke('onProject', project.id));
        const label=element('strong',copy(project.label,150),'pf-project-label');
        const note=element('span',PROJECT_NOTES[project.id]||'Describe the works you want to explore.','pf-project-description');
        const arrow=element('span',state.projectChosen && project.id === state.projectId ? '✓' : '○','pf-project-arrow');arrow.setAttribute('aria-hidden','true');
        item.append(label,note,arrow);
        item.dataset.developmentType = copy(project.id, 60); item.setAttribute('aria-pressed', String(state.projectChosen && project.id === state.projectId));
        item.disabled = !state.confirmed || typeof callbacks.onProject !== 'function'; projects.append(item);
      });
      if (current) [...projects.querySelectorAll('button')].find(item => item.dataset.developmentType === current)?.focus({ preventScroll: true });
    }
    function update(input = {}) {
      const next = normalize(input), nextSignature = JSON.stringify(next);
      if (signature === nextSignature) return api;
      signature = nextSignature; state = next;
      root.dataset.propertyFlowPage = state.page;
      Object.entries(pages).forEach(([id, page]) => { page.hidden = id !== state.page; });
      root.hidden = state.page === 'discovery';
      Object.values(addresses).forEach(item => { item.textContent = state.address || 'No property selected'; });
      Object.values(limitedWarnings).forEach(item => { item.hidden = !state.confirmed || state.confirmationMode !== 'address_only'; });
      chooseProject.disabled = !state.confirmed || typeof callbacks.onDevelopment !== 'function';
      const project = list(scope.FirstPrincipleAssessmentModel?.PROJECTS).find(item => item.id === state.projectId);
      viewAssessment.disabled = !state.confirmed || !state.projectChosen || !project || typeof callbacks.onAssessment !== 'function';
      projectStatus.textContent = !state.confirmed ? 'Confirm a property before choosing a project.' : state.projectChosen && project ? 'Selection confirmed. Continue to view its planning assessment.' : 'Choose a project to enable View Planning Assessment.';
      projectSummary.textContent = state.projectChosen && project ? project.label : '';
      projectToggle.hidden = !state.projectChosen || !project || !projectCard;
      assessmentProject.textContent = state.projectChosen && project ? project.label : 'Development type not selected';
      const nextPreviewSignature = JSON.stringify({ ...state, page: '', projectId: '', projectChosen: false });
      if (previewSignature !== nextPreviewSignature) { previewSignature = nextPreviewSignature; renderPreview(); }
      renderProjects();
      projectCard?.update({key:[state.address,state.propertyId||state.selectionPropertyId,state.projectChosen?state.projectId:''].join('|'),status:state.projectChosen&&project?'completed':state.confirmed?'active':'idle',complete:Boolean(state.confirmed&&state.projectChosen&&project),canCollapse:Boolean(state.confirmed&&state.projectChosen&&project)});
      if (!projectCard) projectSummary.hidden = true;
      return api;
    }
    function getState() { return { page: state.page, confirmed: state.confirmed, canConfirm: state.canConfirm, confirmationMode: state.confirmationMode, confirmationIssue: state.confirmationIssue, address: state.address, propertyId: state.propertyId, councilId: state.councilId, projectId: state.projectId, projectChosen: state.projectChosen, progressiveCards: { preview: previewCard?.getState() || null, projectSelection: projectCard?.getState() || null }, legalApplicabilityAssessed: false }; }
    const api = { update, getState, slots: { discoveryPreview, overviewControls, assessmentContent }, pages, headings };
    root._firstPrinciplePropertyFlow = api; update(); return api;
  }
  const api = Object.freeze({ init, PAGES: Object.freeze(PAGES) }); scope.FirstPrinciplePropertyFlowView = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
