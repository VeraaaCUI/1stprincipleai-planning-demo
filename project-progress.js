/* Preparation progress only. External reviews, lodgement and outcomes are not connected. */
(function (scope) {
  'use strict';
  const STATUS_LABELS = Object.freeze({
    available: 'Available',
    in_progress: 'In preparation',
    needs_review: 'Needs review',
    not_started: 'Not started',
    not_connected: 'Not connected'
  });
  const ROUTES = Object.freeze(['drawings', 'brief', 'review']);
  const MATERIAL_IDS = Object.freeze(['proposal', 'site', 'controls', 'plans', 'risk', 'statement', 'consent', 'review']);
  const ACTION_LABELS = Object.freeze({
    drawings: 'Open drawings', brief: 'Prepare the project brief', application: 'Review preparation checklist',
    experts: 'Plan specialist review', cost: 'Review cost assumptions', email: 'Prepare an expert email'
  });
  const clip = (value, limit = 500) => typeof value === 'string' ? value.slice(0, limit) : '';
  const clone = value => JSON.parse(JSON.stringify(value));

  function deriveProgress(input = {}) {
    const hasContext = input.hasContext === true;
    const supportedNSW = input.supportedNSW === true;
    const route = ROUTES.includes(input.route) ? input.route : null;
    const pdf = input.pdf && typeof input.pdf === 'object' ? input.pdf : {};
    const document = pdf.document && typeof pdf.document === 'object' ? pdf.document : {};
    const pdfState = clip(pdf.status, 40);
    const unreadableCount = Number(pdf.unreadablePageCount);
    const unreadablePageCount = Number.isFinite(unreadableCount) && unreadableCount > 0 ? Math.min(10000, Math.ceil(unreadableCount)) : 0;
    const remainingOCR = pdf.needsOCR === true || unreadablePageCount > 0;
    const validExtraction = hasContext && ['review', 'ready'].includes(pdfState) && Number(document.pages || pdf.pageCount) > 0;
    const facts = Array.isArray(pdf.facts) ? pdf.facts.filter(fact => fact && typeof fact === 'object') : [];
    const confirmedFacts = validExtraction ? facts.filter(fact => fact.status === 'confirmed').length : 0;
    const drawingNotesChecked = validExtraction && !remainingOCR && facts.length > 0 && confirmedFacts === facts.length && pdf.needsReview !== true && pdf.reviewComplete !== false;
    const illustrative = Boolean(pdf.illustrative || pdf.demo || document.illustrative || document.demo);
    const materials = Object.fromEntries(MATERIAL_IDS.map(id => [id, hasContext && ['draft', 'review'].includes(input.materialStatus?.[id]) ? input.materialStatus[id] : 'not_started']));
    const materialDraftCount = MATERIAL_IDS.filter(id => materials[id] !== 'not_started').length;
    const materialReviewCount = MATERIAL_IDS.filter(id => materials[id] === 'review').length;
    const briefPrepared = hasContext && input.briefPrepared === true;
    const emailPrepared = hasContext && input.email?.draftPrepared === true;
    const validBudget = Number(input.budget?.entered) > 0 && (!Array.isArray(input.budget?.errors) || input.budget.errors.length === 0);
    const pdfBusy = pdfState === 'extracting';
    const pdfBlocked = ['needs_ocr', 'error'].includes(pdfState) || remainingOCR;
    const localDrawingComplete = hasContext && drawingNotesChecked;
    const stage = (id, label, status, reason, owner, actionTarget, extra = {}) => ({
      id, label, status, statusLabel: STATUS_LABELS[status], reason, owner, actionTarget,
      localComplete: false, professionalVerificationCompleted: false, ...extra
    });
    const labels = supportedNSW ? {
      enquiry: 'Receive enquiry', planning: 'Check permissibility', scope: 'Scope and quote', drawings: 'Prepare drawings',
      specialists: 'Specialist reports', package: 'Planning statement and package', review: 'Review and approvals',
      lodgement: 'Lodge in portal', assessment: 'Assessment and RFI', determination: 'Determination'
    } : {
      enquiry: 'Receive enquiry', planning: 'Check local controls', scope: 'Define service scope', drawings: 'Prepare drawings',
      specialists: 'Specialist evidence', package: 'Supporting package', review: 'Professional review',
      lodgement: 'Application process', assessment: 'Authority assessment', determination: 'Outcome'
    };
    let drawingStatus = 'not_started';
    let drawingReason = route === 'brief' ? 'Start with the proposal brief, then agree which survey and concept drawings are needed.' : 'Add a PDF to extract its text and check the page-cited notes.';
    if (hasContext && pdfBusy) {
      drawingStatus = 'in_progress'; drawingReason = 'The PDF is being read locally. Extraction is not a planning or building-code check.';
    } else if (hasContext && pdfBlocked) {
      drawingStatus = 'needs_review';
      drawingReason = pdfState === 'error' ? 'The drawing could not be read. Replace it or arrange a manual review before using extracted notes.'
        : pdfState === 'needs_ocr' ? 'Searchable text was not found. Arrange OCR or manual review; drawing facts have not been verified.'
          : (unreadablePageCount ? unreadablePageCount + (unreadablePageCount === 1 ? ' page still needs' : ' pages still need') : 'Some pages still need') + ' OCR or manual review. Checked notes from readable pages do not complete the drawing review.';
    } else if (validExtraction) {
      drawingStatus = 'needs_review';
      drawingReason = localDrawingComplete
        ? (illustrative ? 'Illustrative demo drawing notes were checked locally. They are not actual project facts; a professional must review the real drawings.' : 'The page-cited notes were checked by the user. A professional still needs to review the drawing content, dimensions and suitability.')
        : 'Text extraction is available. Check each candidate note against its PDF page; unconfirmed notes do not become project facts.';
    } else if (hasContext && materials.plans !== 'not_started') {
      drawingStatus = 'needs_review'; drawingReason = 'Drawings are listed as available in the checklist. Their content and version have not been independently checked.';
    } else if (hasContext && route === 'drawings') {
      drawingStatus = 'in_progress';
    }
    const stages = [
      stage('enquiry', labels.enquiry, hasContext ? 'available' : 'not_started', hasContext ? 'The selected location, question and preliminary report have reached this workspace. The report remains an initial preview.' : 'Locate a property and prepare a preliminary report before starting this workspace.', 'Client', 'brief', { localComplete: hasContext }),
      stage('planning', labels.planning, hasContext ? 'needs_review' : 'not_started', supportedNSW ? 'Current controls, property constraints and the DA or CDC pathway still need a planner or certifier to check them. PDF extraction cannot resolve this step.' : 'Confirm the responsible local authority and applicable state and local controls. NSW rules are not applied to other jurisdictions.', 'Planner / certifier', 'experts'),
      stage('scope', labels.scope, briefPrepared ? 'needs_review' : hasContext && route ? 'in_progress' : 'not_started', briefPrepared ? 'A local service brief is prepared. The professional scope, fee and engagement have not been agreed.' : 'Choose the starting route, record priorities and prepare a service brief. Any entered budget is a working assumption.', 'Client + service coordinator', 'brief', { localComplete: briefPrepared }),
      stage('drawings', labels.drawings, drawingStatus, drawingReason, 'Client + designer / surveyor', 'drawings', { localComplete: localDrawingComplete, illustrative }),
      stage('specialists', labels.specialists, hasContext && materials.risk !== 'not_started' ? 'needs_review' : hasContext ? 'available' : 'not_started', materials.risk !== 'not_started' ? 'Specialist evidence is listed in the preparation checklist. Its scope, currency and conclusions require responsible professional review.' : 'Use the location, proposal and unresolved risk questions to discuss which specialist reports are needed. No expert has been engaged here.', 'Planner + relevant specialists', 'experts'),
      stage('package', labels.package, hasContext && materialDraftCount > 0 ? 'in_progress' : 'not_started', hasContext && materialDraftCount > 0 ? materialDraftCount + ' of ' + MATERIAL_IDS.length + ' material categories have a draft or review-request status. These are preparation entries, not a completeness or compliance pass.' : 'Organise drawings, site records, statements and supporting reports for the professionally confirmed process.', 'Client + planner', 'application'),
      stage('review', labels.review, 'not_connected', 'A named professional and any required client or owner approvals are needed. This demo cannot complete a professional sign-off.', 'Responsible professional + client / owner', 'email'),
      stage('lodgement', labels.lodgement, 'not_connected', supportedNSW ? 'Portal submission, completeness checks and council invoicing are external steps. Nothing has been lodged from this workspace.' : 'Confirm the correct application channel with the responsible authority. No application service is connected.', 'Applicant + relevant authority', 'application'),
      stage('assessment', labels.assessment, 'not_connected', supportedNSW ? 'Council assessment, submissions and requests for information are external. An RFI may return the project to package preparation.' : 'Authority review and any further information requests remain external to this demo.', 'Relevant authority + project team', 'application'),
      stage('determination', labels.determination, 'not_connected', 'No approval or refusal has been received through this workspace. Record a real determination only after the responsible authority issues it.', 'Relevant authority', 'experts')
    ];

    const preparationMilestone = route === 'drawings'
      ? { id: 'preparation', label: illustrative ? 'Demo drawing notes checked' : 'Drawing notes checked', complete: localDrawingComplete, detail: 'User review of extracted notes only; professional verification is still required.' }
      : route === 'review'
        ? { id: 'preparation', label: 'Available materials indexed', complete: hasContext && materialDraftCount > 0, detail: 'Checklist entries identify what is available; they do not validate the documents.' }
        : { id: 'preparation', label: 'Working assumptions entered', complete: hasContext && route === 'brief' && validBudget, detail: 'Optional user-entered budget assumptions; no market estimate is inferred.' };
    const milestones = [
      { id: 'context', label: 'Report context carried over', complete: hasContext, detail: 'The same location and question are available in this workspace.' },
      { id: 'route', label: 'Starting route selected', complete: hasContext && Boolean(route), detail: 'The client has chosen how to start preparing the project.' },
      preparationMilestone,
      { id: 'handover', label: 'Service handover prepared', complete: briefPrepared || emailPrepared, detail: 'A local brief or email draft exists. It has not been sent or accepted by an expert.' }
    ];
    let currentStageId = 'enquiry';
    if (hasContext) {
      if (!route) currentStageId = 'scope';
      else if (route === 'drawings' && !localDrawingComplete) currentStageId = 'drawings';
      else if (!briefPrepared && route !== 'review') currentStageId = 'scope';
      else if (route === 'review' && materialDraftCount === 0) currentStageId = 'package';
      else currentStageId = 'review';
    }
    const nextTasks = [];
    const addTask = (id, label, detail, actionTarget) => nextTasks.push({ id, label, detail, actionTarget });
    if (!hasContext) addTask('context', 'Return to the property report', 'An address, question and preliminary report are needed first.', 'brief');
    else if (!route) addTask('route', 'Choose where to start', 'Use your existing drawings, start a brief, or organise material for review.', 'brief');
    else {
      if (route === 'drawings' && !localDrawingComplete) {
        addTask('drawings', pdfBlocked ? 'Resolve the drawing intake' : validExtraction ? 'Check the extracted drawing notes' : 'Add your drawing PDF', drawingReason, 'drawings');
      }
      if (route === 'review' && materialDraftCount === 0) addTask('materials', 'Index your available material', 'Record the documents you already have before preparing a focused review request.', 'application');
      if (route === 'brief' && materials.proposal === 'not_started') addTask('proposal', 'Describe the proposed works', 'Record the intended use, scope, priorities and known gaps.', 'brief');
      if (!briefPrepared) addTask('brief', 'Prepare the service handover', 'Keep the question, assumptions, document gaps and requested support together.', 'brief');
      addTask('professional', 'Arrange the right professional review', 'Confirm the applicable controls, drawing content and any required specialist work.', 'experts');
      if (!emailPrepared) addTask('email', 'Draft an expert enquiry', 'Prepare a review request for a recipient you choose. Delivery is not connected.', 'email');
    }
    return {
      schemaVersion: 'project-preparation-progress-0.1', hasContext, supportedNSW, route,
      title: 'Your project, end to end',
      scopeNote: supportedNSW ? 'NSW consultant workflow shown for orientation. Current DA / CDC eligibility and professional sign-off remain unresolved.' : 'General preparation roadmap only. Confirm the local authority process; NSW planning requirements are not applied to this location.',
      stages, milestones, localPreparedCount: milestones.filter(item => item.complete).length,
      localMilestoneTotal: milestones.length, materialDraftCount, materialReviewCount,
      confirmedDrawingNoteCount: confirmedFacts, drawingNoteCount: validExtraction ? facts.length : 0,
      unreadableDrawingPageCount: unreadablePageCount, needsDrawingOCR: remainingOCR || pdfState === 'needs_ocr',
      drawingReviewComplete: localDrawingComplete, illustrativeDocuments: illustrative,
      currentStageId, nextTasks: nextTasks.slice(0, 4),
      loopNotes: supportedNSW ? ['If council returns a lodged package, the project returns to preparation.', 'An assessment request for information may require revised drawings, reports or supporting material.'] : ['Further information requests may require revised preparation and another professional review.'],
      externalProcessConnected: false, professionalReviewCompleted: false,
      emailSent: false, applicationSubmitted: false, approvalGranted: false,
      boundaries: 'Local preparation milestones are not regulatory progress, professional verification, or an approval probability.'
    };
  }

  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined && text !== null) element.textContent = String(text);
    if (className) element.className = className;
    return element;
  }

  function mount(root, options = {}) {
    if (!root) return { update() {}, reset() {}, getState() { return deriveProgress(); } };
    if (root._firstPrincipleProjectProgress) return root._firstPrincipleProjectProgress;
    let state = deriveProgress(), selectedStageId = 'enquiry';
    const shell = node('section', null, 'fpp-progress'); shell.setAttribute('aria-label', 'End-to-end project preparation progress');
    const header = node('div', null, 'fpp-progress-header');
    const titleCopy = node('div'); titleCopy.append(node('p', 'Project roadmap', 'fpp-label'), node('h3', 'Your project, end to end'));
    const count = node('p', null, 'fpp-local-count'); count.setAttribute('role', 'status');
    header.append(titleCopy, count);
    const scopeNote = node('p', '', 'fpp-scope-note');
    const milestoneList = node('ul', null, 'fpp-milestones'); milestoneList.setAttribute('aria-label', 'Local preparation milestones');
    const roadmapHint = node('p', 'Scroll to browse all 10 stages. Select a stage for details.', 'fpp-mobile-roadmap-hint');
    const roadmap = node('ol', null, 'fpp-roadmap'); roadmap.setAttribute('aria-label', 'Project stages. Select a stage to see its status.');
    const detail = node('div', null, 'fpp-stage-detail'); detail.setAttribute('role', 'region'); detail.setAttribute('aria-label', 'Selected project stage');
    const next = node('div', null, 'fpp-next-tasks');
    const loops = node('details', null, 'fpp-external-loops'); const loopList = node('ul');
    loops.append(node('summary', 'External return and information-request loops'), loopList);
    shell.append(header, scopeNote, milestoneList, roadmapHint, roadmap, detail, next, loops, node('p', 'Local checkmarks show preparation activity only. They do not record approval, professional sign-off, email delivery or portal submission.', 'fpp-boundary-note'));
    root.append(shell);

    function action(label, target) {
      const button = node('button', label, 'fpp-action'); button.type = 'button'; button.dataset.actionTarget = target;
      button.addEventListener('click', () => { if (typeof options.onStep === 'function') options.onStep(target); });
      return button;
    }
    function renderDetail() {
      const selected = state.stages.find(stage => stage.id === selectedStageId) || state.stages[0];
      detail.replaceChildren();
      const heading = node('div', null, 'fpp-detail-heading');
      heading.append(node('h4', selected.label), node('span', selected.statusLabel, 'fpp-status fpp-status-' + selected.status));
      detail.append(heading, node('p', selected.reason), node('small', 'Responsible role: ' + selected.owner));
      if (selected.localComplete) detail.append(node('p', selected.illustrative ? 'Local demo preparation recorded; actual project evidence remains unverified.' : 'A local preparation activity is recorded. This is not a professional or authority completion.', 'fpp-local-note'));
      if (selected.actionTarget && state.hasContext) detail.append(action(ACTION_LABELS[selected.actionTarget] || 'Review this step', selected.actionTarget));
    }
    function chooseStage(id) {
      if (!state.stages.some(stage => stage.id === id)) return;
      selectedStageId = id;
      roadmap.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.stageId === id)));
      renderDetail();
      if (typeof options.onChange === 'function') options.onChange(getState());
    }
    function render() {
      count.replaceChildren(node('strong', state.localPreparedCount + ' / ' + state.localMilestoneTotal), node('span', 'Local preparation checkpoints'));
      scopeNote.textContent = state.scopeNote;
      milestoneList.replaceChildren();
      state.milestones.forEach(item => {
        const li = node('li', null, item.complete ? 'is-recorded' : '');
        const mark = node('span', item.complete ? '✓' : '○', 'fpp-milestone-mark'); mark.setAttribute('aria-hidden', 'true');
        li.append(mark, node('span', item.label), node('small', item.complete ? 'Recorded locally' : 'To prepare'));
        li.title = item.detail; milestoneList.append(li);
      });
      const savedScroll = roadmap.scrollLeft;
      roadmap.replaceChildren();
      state.stages.forEach((stage, index) => {
        const li = node('li');
        const button = node('button', null, 'fpp-stage-button'); button.type = 'button'; button.dataset.stageId = stage.id; button.dataset.status = stage.status;
        button.setAttribute('aria-pressed', String(selectedStageId === stage.id));
        if (stage.id === state.currentStageId) button.setAttribute('aria-current', 'step');
        button.append(node('span', String(index + 1).padStart(2, '0'), 'fpp-stage-number'), node('strong', stage.label), node('small', stage.statusLabel));
        button.addEventListener('click', () => chooseStage(stage.id)); li.append(button); roadmap.append(li);
      });
      roadmap.scrollLeft = savedScroll;
      renderDetail();
      next.replaceChildren(node('h4', 'Useful next actions'));
      const nextList = node('ul');
      const taskItem = task => {
        const item = node('li'); item.append(node('strong', task.label), node('p', task.detail));
        if (state.hasContext) item.append(action(ACTION_LABELS[task.actionTarget] || 'Open this task', task.actionTarget));
        return item;
      };
      state.nextTasks.slice(0, 2).forEach(task => nextList.append(taskItem(task)));
      next.append(nextList);
      if (state.nextTasks.length > 2) {
        const moreTasks = node('details', null, 'fpp-more-tasks'); const moreList = node('ul');
        moreTasks.append(node('summary', 'More preparation tasks'));
        state.nextTasks.slice(2).forEach(task => moreList.append(taskItem(task)));
        moreTasks.append(moreList); next.append(moreTasks);
      }
      loopList.replaceChildren(); state.loopNotes.forEach(note => loopList.append(node('li', note)));
      loops.hidden = !state.hasContext;
      root.dataset.localPreparedCount = String(state.localPreparedCount);
      root.dataset.externalConnected = 'false';
      root.dataset.route = state.route || '';
    }
    function update(input) {
      const previousHasContext = state.hasContext;
      state = deriveProgress(input);
      if (!previousHasContext && state.hasContext) selectedStageId = state.currentStageId;
      if (!state.stages.some(stage => stage.id === selectedStageId)) selectedStageId = state.currentStageId;
      render();
      if (!previousHasContext && state.hasContext && typeof scope.requestAnimationFrame === 'function') {
        scope.requestAnimationFrame(() => {
          const selected = roadmap.querySelector('[data-stage-id="' + selectedStageId + '"]');
          if (selected && roadmap.scrollWidth > roadmap.clientWidth && roadmap.clientWidth > 0) {
            roadmap.scrollLeft += selected.getBoundingClientRect().left - roadmap.getBoundingClientRect().left - 4;
          }
        });
      }
      return getState();
    }
    function getState() { return clone({ ...state, selectedStageId }); }
    function reset() { state = deriveProgress(); selectedStageId = 'enquiry'; render(); }
    const api = { update, getState, reset };
    root._firstPrincipleProjectProgress = api; render();
    return api;
  }
  const api = Object.freeze({ deriveProgress, mount, STATUS_LABELS, ACTION_LABELS });
  scope.FirstPrincipleProjectProgress = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
