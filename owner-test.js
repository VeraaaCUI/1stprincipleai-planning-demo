/* Owner-only synthetic customer journey. The adapter is deliberately isolated
 * from real property data and from the private engineering Runner.
 */
(function (scope) {
  'use strict';
  const E = () => scope.FirstPrincipleOwnerTestEngine;
  const MAX_DRAFT_BYTES = 180000;
  let mountCount = 0;
  const text = (value, limit = 500) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit);
  function el(tag, content, className) { const item = document.createElement(tag); if (content !== undefined && content !== null) item.textContent = String(content); if (className) item.className = className; return item; }
  function button(label, handler, className = '') { const item = el('button', label, 'ot-button' + (className ? ' ' + className : '')); item.type = 'button'; item.addEventListener('click', handler); return item; }
  function add(parent, ...children) { children.filter(Boolean).forEach(child => parent.append(child)); return parent; }
  function labelValue(label, value, state = '') { const item = el('div', null, 'ot-fact'); add(item, el('dt', label), el('dd', value), state ? el('span', state, 'ot-fact-state') : null); return item; }
  function uid() { try { return scope.crypto.randomUUID(); } catch (_) { return 'owner-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2); } }

  function init(root, options = {}) {
    if (!root) throw new Error('An owner test container is required.');
    if (root._firstPrincipleOwnerTest) return root._firstPrincipleOwnerTest;
    const id = 'owner-test-' + (++mountCount), auth = options.auth;
    let authState = auth?.getState?.() || {status: 'unavailable', user: null};
    let ownerId = authState.status === 'authenticated' && authState.user?.ownerTest ? authState.user.id : null;
    let state = E()?.initialState('clear-pathway') || null;
    let pdfApi = null, pdfSnapshot = {status: 'empty', document: null, facts: [], warnings: []};
    let notice = '', diagnostics = false, scenarioNotice = '';
    const shell = el('section', null, 'ot-shell'); shell.id = id; shell.setAttribute('aria-labelledby', id + '-title');
    const banner = el('div', 'TEST MODE — SYNTHETIC ASSESSMENT', 'ot-banner'); banner.setAttribute('role', 'status');
    const header = el('header', null, 'ot-header');
    const title = el('h1', 'Owner customer journey test', 'ot-title'); title.id = id + '-title';
    const lead = el('p', 'Walk through a deterministic Granny Flat screening experience using synthetic facts. No real address or private Runner is evaluated.', 'ot-lead');
    const access = el('p', '', 'ot-access');
    add(header, el('p', 'CONTROLLED WEBSITE TEST', 'ot-kicker'), title, lead, access);
    const progress = el('nav', null, 'ot-progress'); progress.setAttribute('aria-label', 'Synthetic assessment progress');
    const body = el('div', null, 'ot-body');
    const live = el('p', '', 'ot-live'); live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite');
    shell.append(banner, header, progress, live, body); root.replaceChildren(shell);

    function storageKey() { return ownerId ? 'firstprinciple.owner-test.' + ownerId + '.v1' : ''; }
    function hasAccess() { return Boolean(ownerId && authState.status === 'authenticated' && authState.user?.ownerTest === true); }
    function resetPdfState() { pdfApi?.reset?.(); pdfApi = null; pdfSnapshot = {status: 'empty', document: null, facts: [], warnings: []}; }
    function announce(message) { live.textContent = text(message, 400); }
    function saveDraft() {
      if (!hasAccess()) { notice = 'The owner authorization is no longer valid. This draft remains in memory only.'; render(); return false; }
      try {
        const next = {...E().toJSON(state), savedAt: new Date().toISOString(), ownerId};
        const serialized = JSON.stringify(next); if (serialized.length > MAX_DRAFT_BYTES) throw new Error('Draft is too large.');
        scope.localStorage.setItem(storageKey(), serialized); state = next; notice = 'Synthetic journey saved locally for this owner account. It is not a cloud project.'; announce('Synthetic journey saved locally.'); render(); return true;
      } catch (_) { notice = 'This browser could not save the local synthetic draft. Keep the tab open to resume.'; render(); return false; }
    }
    function loadDraft() {
      if (!hasAccess()) return false;
      try {
        const raw = scope.localStorage.getItem(storageKey()); if (!raw) return false;
        const value = JSON.parse(raw); if (!value || value.ownerId !== ownerId || value.version !== 1 || !E().SCENARIOS.some(item => item.id === value.scenarioId)) return false;
        state = value; notice = 'Restored the last synthetic journey for this owner account. Check the stage before continuing.'; return true;
      } catch (_) { return false; }
    }
    function clearDraft() { try { if (storageKey()) scope.localStorage.removeItem(storageKey()); } catch (_) {} state = E().initialState('clear-pathway'); resetPdfState(); notice = 'The synthetic draft was cleared.'; render(); }
    function setState(next, message) { state = next; if (message) notice = message; saveDraft(); }
    function chooseScenario(id) {
      if (!E().SCENARIOS.some(item => item.id === id)) { scenarioNotice = 'That synthetic scenario is not available. The clear pathway remains selected.'; id = 'clear-pathway'; }
      state = E().initialState(id); state.sessionId = uid(); state = E().setProperty(state, {scenarioId: id}); state.scenarioId = id; notice = ''; scenarioNotice = ''; announce('Synthetic property selected.'); render();
    }
    function beginQuestions() { const next = E().beginQuestions(state); state = next; notice = ''; announce('Question sequence started.'); render(); }
    function answer(value) {
      try { state = E().applyAnswer(state, value); notice = ''; announce(state.result ? 'Preliminary reading ready.' : 'Answer recorded.'); render(); }
      catch (error) { notice = error.message; render(); }
    }
    function editQuestion(questionId) { try { state = E().editQuestion(state, questionId); notice = 'Earlier answer reopened. Later answers were cleared.'; render(); } catch (error) { notice = error.message; render(); } }
    function pause() { state = E().pause(state); notice = 'Assessment paused. Save the draft to restore it later.'; render(); }
    function resume() { state = E().resume(state); notice = 'Assessment resumed from the saved state.'; announce('Assessment resumed.'); render(); }
    function step(stage) {
      if (!state.property) { notice = 'Choose the synthetic property first.'; render(); return; }
      if (stage === 'questions' && state.stage === 'enquiry') return beginQuestions();
      if (stage === 'evidence') { state = {...state, stage: 'evidence', paused: false}; render(); return; }
      if (stage === 'result' && state.result) { state = {...state, stage: 'result', paused: false}; render(); return; }
      if (stage === 'enquiry') { state = {...state, stage: 'enquiry', paused: false}; render(); }
    }
    function renderAccessDenied() {
      body.replaceChildren(); progress.replaceChildren(); access.textContent = authState.status === 'authenticated' ? 'This signed-in account does not have the server-managed owner test claim.' : authState.status === 'loading' ? 'Checking the signed-in account before opening the controlled test…' : 'Sign in with the owner test account to open this controlled route.';
      add(body, el('h2', 'Owner authorization required'), el('p', 'This route fails closed unless Supabase getUser() returns app_metadata.owner_test=true or the owner_test role. URL parameters, browser storage and client-side email checks cannot grant access.'), el('p', 'The public website and ordinary property exploration remain available.'), options.onLogin ? button('Open account sign-in', () => options.onLogin(), 'ot-primary') : null, options.navigate ? button('Return to property search', () => options.navigate('property'), 'ot-secondary') : null);
    }
    function renderProgress() {
      progress.replaceChildren();
      const stages = [['property', '1', 'Property'], ['enquiry', '2', 'Enquiry'], ['questions', '3', 'Questions'], ['evidence', '4', 'Evidence'], ['result', '5', 'Reading']];
      stages.forEach(([key, number, label]) => { const current = state.stage === key || (key === 'questions' && state.stage === 'paused'); const item = el('span', number + ' ' + label, current ? 'ot-progress-current' : ''); if (current) item.setAttribute('aria-current', 'step'); progress.append(item); });
    }
    function scenarioPicker() {
      const wrap = el('div', null, 'ot-scenarios');
      E().SCENARIOS.forEach(item => { const selected = item.id === state.scenarioId; const control = button('', () => chooseScenario(item.id), 'ot-scenario' + (selected ? ' is-selected' : '')); control.setAttribute('aria-pressed', String(selected)); add(control, el('strong', item.title), el('span', item.summary), el('small', selected ? 'Selected synthetic scenario' : 'Select scenario')); wrap.append(control); });
      return wrap;
    }
    function propertyView() {
      const section = el('section', null, 'ot-panel');
      add(section, el('p', 'STEP 1 · FIND THE PROPERTY', 'ot-kicker'), el('h2', 'Choose a property context'), el('p', 'Use the existing address search for a real property only as a navigation exercise. The screening adapter accepts synthetic property facts only.'), el('div', 'Synthetic property selected', 'ot-safe-tag'), el('dl', null, 'ot-facts'), labelValue('Property', 'Synthetic owner test property'), labelValue('Address', 'Synthetic property · Hawkesbury (no real address)', 'Synthetic only'), labelValue('Lot reference', 'Lot 1 / DP-SYNTHETIC', 'Synthetic only'));
      add(section, el('h3', 'Available test scenarios'), scenarioPicker());
      if (scenarioNotice) add(section, el('p', scenarioNotice, 'ot-error'));
      const actions = el('div', null, 'ot-actions'); add(actions, options.navigate ? button('Open existing address search', () => options.navigate('property'), 'ot-secondary') : null, button('Continue to Granny Flat enquiry', () => { state = {...state, stage: 'enquiry'}; render(); }, 'ot-primary')); section.append(actions);
      add(section, el('p', 'The selected property is a synthetic context. It is not a council result, title record or planning conclusion.', 'ot-disclaimer')); return section;
    }
    function enquiryView() {
      const section = el('section', null, 'ot-panel');
      add(section, el('p', 'STEP 2 · GRANNY FLAT ENQUIRY', 'ot-kicker'), el('h2', 'Review the available information'), el('p', 'This card separates supplied synthetic facts from items that remain unverified.'), el('div', 'Granny Flat / Secondary Dwelling', 'ot-project-pill'));
      const facts = el('dl', null, 'ot-facts'); add(facts, labelValue('Project', 'Detached secondary dwelling for family use', 'Synthetic enquiry'), labelValue('Known', 'Scenario-specific lot and pathway facts', 'Synthetic only'), labelValue('Not checked', 'Title restrictions, live zoning, measured setbacks, hazards and approvals', 'Not checked'), labelValue('Evidence', 'No real property documents are attached', 'Not provided')); section.append(facts);
      const actions = el('div', null, 'ot-actions'); add(actions, button('Back to property', () => step('property'), 'ot-secondary'), button('Start required questions', beginQuestions, 'ot-primary')); section.append(actions); add(section, el('p', 'Screening may continue while independent rules are evaluated. Unchecked facts are not treated as clear.', 'ot-disclaimer')); return section;
    }
    function optionLabel(value) { return ({yes: 'Yes', no: 'No', not_sure: 'Not sure', not_that_i_know: 'Not that I know', residential: 'Residential zone', prohibited: 'Prohibited zone', clear_option: 'One clear option', tie: 'Two options tie', all_out: 'All tested options out'}[value] || value); }
    function questionsView() {
      const section = el('section', null, 'ot-panel');
      add(section, el('p', 'STEP 3 · CUSTOMER QUESTIONS', 'ot-kicker'), el('h2', 'Answer one question at a time'), el('p', 'The next question is calculated from your answer. B0 is deferred until after B3; early exits cancel later questions.'), el('div', 'Scenario: ' + E().scenario(state).title, 'ot-project-pill'));
      if (state.paused || state.stage === 'paused') { add(section, el('h3', 'Assessment paused'), el('p', 'Your answers remain in the local draft. Resume when you are ready.'), button('Resume assessment', resume, 'ot-primary')); }
      else {
        const question = E().questionFor(state);
        if (question) {
          const card = el('div', null, 'ot-question'); add(card, el('p', question.node, 'ot-question-node'), el('h3', question.wording), el('p', question.help, 'ot-help'));
          if (question.type === 'choice') { const choices = el('div', null, 'ot-choice-grid'); question.options.forEach(value => choices.append(button(optionLabel(value), () => answer(value), 'ot-choice'))); card.append(choices); }
          else { const form = document.createElement('form'); const input = document.createElement('textarea'); input.required = true; input.minLength = 3; input.maxLength = 400; input.rows = 3; input.placeholder = 'Synthetic note or unresolved detail'; const submit = button('Continue', () => { if (form.reportValidity()) answer(input.value); }, 'ot-primary'); form.add(input, submit); card.append(form); }
          section.append(card);
        } else if (state.result) { add(section, el('h3', 'Questions complete'), el('p', 'The deterministic scenario has produced a preliminary synthetic Reading. Review the optional evidence step or open the Reading.')); }
        const history = el('ol', null, 'ot-history'); state.history.forEach(item => { const row = el('li'); add(row, el('span', item.node + ' · ' + optionLabel(item.answer)), button('Edit', () => editQuestion(item.questionId), 'ot-link')); history.append(row); }); if (history.children.length) { add(section, el('h3', 'Answer history'), history); }
        const controls = el('div', null, 'ot-actions'); add(controls, state.result ? button('Review local evidence', () => step('evidence'), 'ot-secondary') : null, button('Pause', pause, 'ot-secondary')); section.append(controls);
      }
      add(section, el('p', 'Answers are synthetic test inputs. They are not stored as facts about a real property.', 'ot-disclaimer')); return section;
    }
    function evidenceView() {
      const section = el('section', null, 'ot-panel'); add(section, el('p', 'STEP 4 · DOCUMENT INTAKE', 'ot-kicker'), el('h2', 'Submit evidence for review'), el('p', 'The existing PDF.js reader runs locally in this page. It does not upload, OCR, measure or verify a drawing.'), el('div', 'Synthetic scenario evidence', 'ot-project-pill'));
      const mount = el('div', null, 'ot-pdf-mount'); section.append(mount);
      if (!pdfApi && scope.FirstPrinciplePDFIntake?.mount) pdfApi = scope.FirstPrinciplePDFIntake.mount(mount, {onChange(snapshot) { pdfSnapshot = snapshot; }});
      const status = el('div', null, 'ot-evidence-status'); add(status, el('strong', 'Processing status'), el('p', pdfSnapshot.status === 'empty' ? 'No file selected.' : pdfSnapshot.status === 'review' ? 'Text extracted locally; review each note before using it.' : pdfSnapshot.status === 'needs_ocr' ? 'No usable text layer was found. OCR or manual review is needed.' : 'The selected file has not been uploaded.')); section.append(status);
      const actions = el('div', null, 'ot-actions'); add(actions, button('Back to questions', () => { state = {...state, stage: 'questions'}; render(); }, 'ot-secondary'), button(state.result ? 'Open preliminary Reading' : 'Return to questions', () => { state = {...state, stage: state.result ? 'result' : 'questions'}; render(); }, 'ot-primary')); section.append(actions); add(section, el('p', 'A PDF is not a measured site plan. Confirm what was extracted and what still needs professional verification.', 'ot-disclaimer')); return section;
    }
    function resultView() {
      const result = state.result || E().resultFor(state), section = el('section', null, 'ot-panel ot-result');
      add(section, el('p', 'STEP 5 · PRELIMINARY READING', 'ot-kicker'), el('h2', result.reading), el('p', result.explanation, 'ot-result-lead'));
      const meta = el('div', null, 'ot-result-meta'); add(meta, el('span', 'Confidence: ' + optionLabel(result.confidence)), el('span', 'Synthetic scenario')); section.append(meta);
      const columns = el('div', null, 'ot-result-columns');
      const reasons = el('div'); add(reasons, el('h3', 'Main reasons')); const reasonList = el('ul'); result.reasons.forEach(item => reasonList.append(el('li', item))); reasons.append(reasonList);
      const limits = el('div'); add(limits, el('h3', 'Material limitations')); const limitList = el('ul'); result.limitations.forEach(item => limitList.append(el('li', item))); limits.append(limitList); columns.append(reasons, limits); section.append(columns);
      const action = el('div', null, 'ot-next-action'); add(action, el('p', 'NEXT ACTION', 'ot-kicker'), el('strong', result.action)); if (result.handoff) action.append(el('p', 'Professional handoff recommended before relying on this screening.', 'ot-handoff')); section.append(action);
      const actions = el('div', null, 'ot-actions'); add(actions, button('Review answers', () => { state = {...state, stage: 'questions'}; render(); }, 'ot-secondary'), button('Save local draft', saveDraft, 'ot-primary'), options.navigate ? button('Open My Projects', () => options.navigate('my-projects'), 'ot-secondary') : null, button('Clear synthetic draft', clearDraft, 'ot-danger')); section.append(actions);
      const details = document.createElement('details'); const summary = el('summary', 'Diagnostic view for owner testing'); const pre = el('pre', JSON.stringify({scenarioId: state.scenarioId, sessionId: state.sessionId, stage: state.stage, history: state.history, pdfStatus: pdfSnapshot.status, result}, null, 2), 'ot-diagnostic'); details.append(summary, pre); section.append(details);
      add(section, el('p', 'This is a preliminary synthetic screening result. It is not Council advice, a professional planning assessment or a conclusion about the selected address.', 'ot-disclaimer')); return section;
    }
    function render() {
      renderProgress(); body.replaceChildren();
      if (!hasAccess()) { renderAccessDenied(); return; }
      access.textContent = 'Authorized owner test account · ' + text(authState.user?.email || 'signed-in owner', 120) + ' · server claim verified';
      const scenario = E().scenario(state); if (state.scenarioId !== scenario.id) state = E().initialState('clear-pathway');
      if (notice) body.append(el('p', notice, 'ot-notice'));
      const controls = el('div', null, 'ot-toolbar'); add(controls, el('span', 'Synthetic scenario: ' + scenario.title, 'ot-toolbar-label'), state.paused ? button('Resume', resume, 'ot-primary') : null, button('Save local draft', saveDraft, 'ot-secondary')); body.append(controls);
      const view = state.stage === 'property' ? propertyView() : state.stage === 'enquiry' ? enquiryView() : state.stage === 'evidence' ? evidenceView() : state.stage === 'result' ? resultView() : questionsView(); body.append(view);
    }
    const unsubscribe = auth?.subscribe?.(next => {
      const was = ownerId;
      const nextOwnerId = next.status === 'authenticated' && next.user?.ownerTest ? next.user.id : null;
      authState = next;
      ownerId = nextOwnerId;
      if (was !== nextOwnerId) {
        state = E().initialState('clear-pathway');
        resetPdfState();
        notice = '';
        if (ownerId) loadDraft();
      }
      render();
    });
    const ready = (async () => { try { await auth?.ready; authState = auth?.getState?.() || authState; ownerId = authState.status === 'authenticated' && authState.user?.ownerTest ? authState.user.id : null; if (ownerId) loadDraft(); } finally { render(); } })();
    const api = Object.freeze({ready, getState: () => {
      const authorized = hasAccess();
      return {authorized, state: authorized ? E().toJSON(state) : E().initialState('clear-pathway'), pdf: authorized ? {...pdfSnapshot} : {status: 'empty', document: null, facts: [], warnings: []}};
    }, render, dispose() { unsubscribe?.(); resetPdfState(); root.replaceChildren(); }});
    root._firstPrincipleOwnerTest = api; render(); return api;
  }
  scope.FirstPrincipleOwnerTest = Object.freeze({init});
})(typeof window !== 'undefined' ? window : globalThis);
