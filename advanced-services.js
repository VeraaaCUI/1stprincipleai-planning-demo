/* Local service planning workspace. No booking, AI request or submission is sent. */
(function (scope) {
  'use strict';
  const TRACKS = [
    { id: 'cost', title: 'Cost planning', short: 'Build a working budget', copy: 'Organise your own allowances and the assumptions a professional quote will need.' },
    { id: 'application', title: 'Application preparation', short: 'Prepare the evidence', copy: 'Track draft materials and identify what needs a planner or specialist to review.' },
    { id: 'experts', title: 'AI Agent + experts', short: 'Plan the right review', copy: 'Prepare a handover for an AI-assisted service and the relevant human specialists.' }
  ];
  const TOOLS = [{id:'drawings',title:'Drawing review'},...TRACKS,{id:'email',title:'Client + expert email'}];
  const ROUTES = [
    {id:'drawings',title:'I have PDF drawings',copy:'Read the drawing pages, check the extracted notes and prepare a focused review.',action:'Start with my drawings',track:'drawings'},
    {id:'brief',title:'I need plans or a clearer brief',copy:'Describe the proposal, organise a working budget and identify the material to prepare.',action:'Build my project brief',track:'cost'},
    {id:'review',title:'I need specialist advice',copy:'Organise the evidence you already have and prepare questions for the relevant experts.',action:'Plan specialist review',track:'experts'}
  ];
  const ALLOWANCES = [
    { id: 'building', label: 'Building works allowance', hint: 'Your builder allowance or budget assumption.' },
    { id: 'professional', label: 'Design and planning allowance', hint: 'Your allowance for design, planning and professional fees.' },
    { id: 'studies', label: 'Survey and specialist studies allowance', hint: 'Your allowance for surveys and any required risk studies.' },
    { id: 'application', label: 'Application and other fees allowance', hint: 'Your allowance for authority fees and other project costs.' }
  ];
  const MATERIALS = [
    { id: 'proposal', title: 'Proposal and complete works scope', copy: 'Describe the intended use, size and all related works.', owner: 'Client + planner' },
    { id: 'site', title: 'Site, title and property records', copy: 'Confirm the address, lot, ownership and relevant title restrictions.', owner: 'Client + planner' },
    { id: 'controls', title: 'Applicable controls and planning maps', copy: 'Record the current zoning, overlays, source dates and pathway checks.', owner: 'Planner / certifier' },
    { id: 'plans', title: 'Survey and concept drawings', copy: 'Show boundaries, existing development, floor areas, setbacks and proposed works.', owner: 'Surveyor + designer' },
    { id: 'risk', title: 'Risk evidence and specialist reports', copy: 'Scope bushfire, flooding, trees or other constraints where relevant.', owner: 'Relevant specialists' },
    { id: 'statement', title: 'Planning statement and supporting material', copy: 'Prepare the material required for the professionally confirmed pathway.', owner: 'Planner' },
    { id: 'consent', title: 'Owner consent and application information', copy: 'Check required consents, application details and supporting documents.', owner: 'Client + planner' },
    { id: 'review', title: 'Professional review and submission checklist', copy: 'Reconcile document versions and arrange responsible professional sign-off.', owner: 'Responsible reviewer' }
  ];
  const MATERIAL_STATES = [
    ['not_started', 'Not started'], ['draft', 'Draft available'], ['review', 'Ready for professional review']
  ];
  const SPECIALISTS = [
    { id: 'planner', title: 'Town planner', copy: 'Confirm applicable controls, assess permissibility and coordinate the pathway.' },
    { id: 'certifier', title: 'Accredited certifier', copy: 'Review the scope and standards for any proposed CDC or certification route.' },
    { id: 'bushfire', title: 'Bushfire consultant', copy: 'Scope any necessary bushfire assessment, access and water-supply checks.' },
    { id: 'arborist', title: 'Arborist', copy: 'Assess retained or affected trees and any relevant tree protection requirements.' },
    { id: 'flood', title: 'Flood / civil engineer', copy: 'Check flood information, drainage and engineering questions where relevant.' },
    { id: 'surveyor', title: 'Registered surveyor', copy: 'Confirm the survey information needed for design and boundary checks.' }
  ];
  let mountNumber = 0;
  const clip = (value, max = 2000) => typeof value === 'string' ? value.slice(0, max) : '';
  const money = value => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
  const labelFor = (items, id) => items.find(item => item.id === id)?.title || id;
  function el(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined && text !== null) element.textContent = String(text);
    if (className) element.className = className;
    return element;
  }
  function button(text, onClick, className = 'fps-button') {
    const result = el('button', text, className);
    result.type = 'button';
    result.addEventListener('click', onClick);
    return result;
  }
  function normalize(input) {
    const location = input?.location || {};
    const report = input?.report || {};
    const names = Array.isArray(location.councilNames) ? location.councilNames.map(name => clip(name, 180)).filter(Boolean) : [];
    const summary = Array.isArray(report.summary) ? report.summary.map(item => clip(item)).filter(Boolean).join('\n\n') : clip(report.summary, 6000);
    return {
      location: { name: clip(location.name, 250) || clip(location.address, 250) || 'Location not provided', address: clip(location.address, 250), councilNames: names, kind: clip(location.kind, 30) },
      question: clip(input?.question, 1600),
      report: { summary, confidence: /^(high|medium|low)$/i.test(report.confidence || '') ? report.confidence.toLowerCase() : 'low', missing: Array.isArray(report.missing) ? report.missing.map(item => clip(item, 500)).filter(Boolean).slice(0, 30) : [], caseId: clip(report.caseId || input?.caseId, 80), sources: Array.isArray(report.sources) ? report.sources.filter(source => /^https:\/\//.test(source?.url || '')).map(source => ({ title: clip(source.title, 250), url: clip(source.url, 1200) })).slice(0, 20) : [] }
    };
  }
  function mount(root) {
    if (!root) return { show() {}, refresh() {}, getState() { return { hasContext: false }; } };
    if (root._firstPrincipleServices) return root._firstPrincipleServices;
    const prefix = 'fps-' + (++mountNumber) + '-';
    let context = normalize(null), signature = '', activeTrack = 'drawings', hasContext = false, route = null;
    let pdfApi=null,progressApi=null,emailApi=null,pdfState={status:'empty',facts:[],confirmedCount:0},emailState={draftPrepared:false,emailSent:false,emailDeliveryConnected:false},syncing=false;
    let selected = new Set(TRACKS.map(item => item.id)), expertSelection = new Set(['planner']);
    let budget = {}, contingency = '', gstBasis = '', materialStatus = {}, briefPrepared = false;
    let aim = '', timing = '', meeting = 'Online first';
    const costInputs = {}, materialSelects = {}, expertInputs = {}, scopeInputs = {}, tabs = {}, panels = {};
    const shell = el('div', null, 'fps-workspace');
    const top = el('div', null, 'fps-top');
    const back = button('← Back to your report', () => scope.dispatchEvent(new CustomEvent('firstprinciple:back-to-report')), 'fps-back');
    top.append(back, el('span', 'Demo workspace', 'fps-demo-badge'));
    const hero = el('div', null, 'fps-hero');
    hero.append(el('p', 'Your project workspace', 'fps-eyebrow'), el('h2', 'Bring your project into focus.'), el('p', 'Start with the information you already have. Review drawings, prepare the next tasks and coordinate the people who can help.', 'fps-lead'));
    const journey = el('ol', null, 'fps-journey'); journey.setAttribute('aria-label', 'Customer journey');
    [['01', 'Locate the property'], ['02', 'Read the preliminary report'], ['03', 'Plan the service'], ['04', 'Arrange professional review']].forEach(([number, title], index) => {
      const item = el('li', null, index === 2 ? 'is-current' : '');
      if (index === 2) item.setAttribute('aria-current', 'step');
      item.append(el('span', number), el('strong', title)); journey.append(item);
    });
    const contextPanel = el('section', null, 'fps-context'); contextPanel.setAttribute('aria-label', 'Your report context');
    const contextTop = el('div', null, 'fps-context-top');
    const contextCopy = el('div');
    const locationText = el('h3'); const councilText = el('p', '', 'fps-muted');
    contextCopy.append(el('p', 'YOUR PROJECT', 'fps-eyebrow'), locationText, councilText);
    const confidence = el('span', '', 'fps-confidence'); contextTop.append(contextCopy, confidence);
    const questionText = el('p', '', 'fps-question');
    const reportDetails = el('details', null, 'fps-report-details');
    const reportText = el('p'); const sourceList = el('ul', null, 'fps-source-list');
    reportDetails.append(el('summary', 'Review the preliminary report and sources'), reportText, sourceList);
    const missing = el('div', null, 'fps-missing'); const missingList = el('ul');
    missing.append(el('h4', 'Evidence to resolve'), missingList);
    contextPanel.append(contextTop, questionText, reportDetails, missing);
    const routeSection=el('section',null,'fps-routing');routeSection.setAttribute('aria-labelledby',prefix+'route-title');
    const routeTitle=el('h3','What are you bringing to the project?');routeTitle.id=prefix+'route-title';
    const routeCards=el('div',null,'fps-route-cards'),routeButtons={};
    ROUTES.forEach(item=>{const action=button(null,()=>chooseRoute(item.id),'fps-route-card');action.dataset.route=item.id;action.setAttribute('aria-pressed','false');action.append(el('span',item.id==='drawings'?'Drawings':item.id==='brief'?'Project brief':'Specialist support','fps-route-type'),el('strong',item.title),el('p',item.copy),el('span',item.action,'fps-route-action'));routeButtons[item.id]=action;routeCards.append(action);});
    const routeStatus=el('p','Choose a starting point. You can change it as your information develops.','fps-route-status');routeStatus.setAttribute('role','status');
    routeSection.append(routeTitle,routeCards,routeStatus);
    const progressRoot=el('div');progressRoot.id=prefix+'progress';
    const toolsArea=el('section',null,'fps-tools-area');toolsArea.hidden=true;toolsArea.setAttribute('aria-label','Project preparation tools');
    const routeTasks=el('section',null,'fps-route-tasks');routeTasks.setAttribute('aria-label','Suggested next tasks');
    const scopeSection = el('section', null, 'fps-scope'); scopeSection.setAttribute('aria-labelledby', prefix + 'scope-title');
    const scopeTitle = el('h3', 'What would you like help with?'); scopeTitle.id = prefix + 'scope-title';
    const scopeCards = el('div', null, 'fps-scope-cards');
    TRACKS.forEach(track => {
      const card = el('label', null, 'fps-scope-card');
      const check = el('input'); check.type = 'checkbox'; check.checked = true; check.dataset.service = track.id;
      check.addEventListener('change', () => { check.checked ? selected.add(track.id) : selected.delete(track.id); card.classList.toggle('is-selected', check.checked); markChanged(); });
      const copy = el('span'); copy.append(el('strong', track.title), el('small', track.copy));
      card.append(check, copy); card.classList.add('is-selected'); scopeCards.append(card); scopeInputs[track.id] = { input: check, card };
    });
    scopeSection.append(scopeTitle, el('p', 'Selections define the requested scope; they do not start a service or create a fee.', 'fps-muted'), scopeCards);
    const tabList = el('div', null, 'fps-tabs'); tabList.setAttribute('role', 'tablist'); tabList.setAttribute('aria-label', 'Service planning tools');
    TOOLS.forEach((track, index) => {
      const tab = button(track.title, () => setTrack(track.id), 'fps-tab');
      tab.id = prefix + 'tab-' + track.id; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', prefix + 'panel-' + track.id);
      tab.addEventListener('keydown', event => {
        let next = index;
        if (event.key === 'ArrowRight') next = (index + 1) % TOOLS.length;
        else if (event.key === 'ArrowLeft') next = (index + TOOLS.length - 1) % TOOLS.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = TOOLS.length - 1;
        else return;
        event.preventDefault(); setTrack(TOOLS[next].id); tabs[TOOLS[next].id].focus();
      });
      const panel = el('section', null, 'fps-tool-panel'); panel.id = prefix + 'panel-' + track.id; panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', tab.id);
      tabs[track.id] = tab; panels[track.id] = panel; tabList.append(tab);
    });
    const pdfRoot=el('div');pdfRoot.id=prefix+'pdf-intake';panels.drawings.append(pdfRoot);
    const emailRoot=el('div');emailRoot.id=prefix+'expert-contact';panels.email.append(emailRoot);
    const costLayout = el('div', null, 'fps-cost-layout');
    const costForm = el('div', null, 'fps-cost-form');
    costForm.append(el('p', 'YOUR ALLOWANCES · AUD', 'fps-eyebrow'), el('h3', 'Start with assumptions you can explain.'), el('p', 'Enter amounts you have been given or want to test. Blank items are excluded, so a partial total is not a complete project budget.', 'fps-muted'));
    ALLOWANCES.forEach(item => {
      const field = el('div', null, 'fps-field');
      const label = el('label', item.label + ' (AUD)'); label.htmlFor = prefix + 'cost-' + item.id;
      const input = el('input'); input.id = label.htmlFor; input.type = 'number'; input.min = '0'; input.max = '1000000000'; input.step = 'any'; input.inputMode = 'decimal'; input.placeholder = 'Enter your allowance'; input.dataset.allowance = item.id;
      const hint = el('small', item.hint); hint.id = input.id + '-help'; input.setAttribute('aria-describedby', hint.id);
      input.addEventListener('input', () => { budget[item.id] = input.value; renderBudget(); markChanged(); });
      costInputs[item.id] = input; field.append(label, input, hint); costForm.append(field);
    });
    const costOptions = el('div', null, 'fps-cost-options');
    const contingencyField = el('div', null, 'fps-field');
    const contingencyLabel = el('label', 'Contingency (%)'); contingencyLabel.htmlFor = prefix + 'contingency';
    const contingencyInput = el('input'); contingencyInput.id = contingencyLabel.htmlFor; contingencyInput.type = 'number'; contingencyInput.min = '0'; contingencyInput.max = '100'; contingencyInput.step = 'any'; contingencyInput.inputMode = 'decimal'; contingencyInput.placeholder = 'Enter a percentage';
    contingencyInput.addEventListener('input', () => { contingency = contingencyInput.value; renderBudget(); markChanged(); });
    contingencyField.append(contingencyLabel, contingencyInput, el('small', 'Applied to the entered subtotal. Blank means no contingency added.'));
    const gstField = el('div', null, 'fps-field'); const gstLabel = el('label', 'GST basis of your amounts'); gstLabel.htmlFor = prefix + 'gst';
    const gstSelect = el('select'); gstSelect.id = gstLabel.htmlFor;
    [['', 'Not specified'], ['inclusive', 'Amounts include GST'], ['exclusive', 'Amounts exclude GST']].forEach(([value, label]) => { const option = el('option', label); option.value = value; gstSelect.append(option); });
    gstSelect.addEventListener('change', () => { gstBasis = gstSelect.value; renderBudget(); markChanged(); });
    gstField.append(gstLabel, gstSelect, el('small', 'The calculator does not add GST. State the basis for the reviewer.')); costOptions.append(contingencyField, gstField); costForm.append(costOptions);
    const costSummary = el('aside', null, 'fps-budget-summary'); costSummary.setAttribute('aria-label', 'Working budget summary');
    const totalLabel = el('p', 'YOUR WORKING ALLOWANCE', 'fps-eyebrow'); const totalText = el('strong', 'Not entered', 'fps-total'); totalText.setAttribute('aria-live', 'polite');
    const budgetStatus = el('p', '', 'fps-budget-status'); budgetStatus.setAttribute('role', 'status');
    const breakdown = el('dl', null, 'fps-breakdown');
    const costNote = el('p', 'This is arithmetic on your inputs, not a market estimate or a professional quote. Confirm scope, inclusions and fees with the relevant professionals.', 'fps-small-note');
    costSummary.append(totalLabel, totalText, budgetStatus, breakdown, costNote); costLayout.append(costForm, costSummary); panels.cost.append(costLayout);
    panels.application.append(el('p', 'APPLICATION READINESS', 'fps-eyebrow'), el('h3', 'A draft can be useful without being ready to lodge.'), el('p', 'Record what you already have. A review status requests a professional check; it does not confirm compliance or submission readiness.', 'fps-muted'));
    const materialCounter = el('p', '', 'fps-material-count'); materialCounter.setAttribute('aria-live', 'polite'); panels.application.append(materialCounter);
    const materialList = el('div', null, 'fps-materials');
    MATERIALS.forEach(item => {
      const row = el('div', null, 'fps-material-row'); const copy = el('div');
      copy.append(el('h4', item.title), el('p', item.copy), el('span', item.owner, 'fps-role'));
      const selectWrap = el('div', null, 'fps-material-select'); const label = el('label', 'Preparation status'); label.htmlFor = prefix + 'material-' + item.id;
      const select = el('select'); select.id = label.htmlFor; select.dataset.material = item.id;
      MATERIAL_STATES.forEach(([value, title]) => { const option = el('option', title); option.value = value; select.append(option); });
      select.addEventListener('change', () => { materialStatus[item.id] = select.value; renderMaterialCount(); markChanged(); });
      materialSelects[item.id] = select; selectWrap.append(label, select); row.append(copy, selectWrap); materialList.append(row);
    });
    panels.application.append(materialList);
    panels.experts.append(el('p', 'AI-ASSISTED WORK + HUMAN ACCOUNTABILITY', 'fps-eyebrow'), el('h3', 'Put each question in the right hands.'), el('p', 'Select the roles you want included in the service brief. A planner can confirm which specialists are actually needed and coordinate their review.', 'fps-muted'));
    const agentCard = el('div', null, 'fps-agent-card');
    agentCard.append(el('span', 'AI AGENT WORK PLAN', 'fps-role'), el('h4', 'Organise. Draft. Reconcile. Escalate.'), el('p', 'Requested agent support: organise evidence, draft material checklists, track unanswered questions and prepare focused briefs for human review.'), el('small', 'Demo: no live AI Agent run or professional engagement is started here.'));
    panels.experts.append(agentCard);
    const expertGrid = el('div', null, 'fps-experts');
    SPECIALISTS.forEach(item => {
      const card = el('label', null, 'fps-expert-card'); const input = el('input'); input.type = 'checkbox'; input.dataset.expert = item.id;
      const copy = el('span'); copy.append(el('strong', item.title), el('small', item.copy));
      input.addEventListener('change', () => { input.checked ? expertSelection.add(item.id) : expertSelection.delete(item.id); card.classList.toggle('is-selected', input.checked); markChanged(); });
      expertInputs[item.id] = { input, card }; card.append(input, copy); expertGrid.append(card);
    }); panels.experts.append(expertGrid);
    const meetingField = el('div', null, 'fps-field fps-meeting-field'); const meetingLabel = el('label', 'Preferred first discussion'); meetingLabel.htmlFor = prefix + 'meeting'; const meetingSelect = el('select'); meetingSelect.id = meetingLabel.htmlFor;
    ['Online first', 'Site visit if advised', 'No preference'].forEach(value => { const option = el('option', value); option.value = value; meetingSelect.append(option); });
    meetingSelect.addEventListener('change', () => { meeting = meetingSelect.value; markChanged(); }); meetingField.append(meetingLabel, meetingSelect); panels.experts.append(meetingField);
    const briefSection = el('section', null, 'fps-brief-section'); briefSection.setAttribute('aria-labelledby', prefix + 'brief-title');
    const briefHeader = el('div', null, 'fps-brief-header'); const briefHeaderCopy = el('div'); const briefTitle = el('h3', 'Leave with a useful service brief.'); briefTitle.id = prefix + 'brief-title';
    briefHeaderCopy.append(el('p', 'YOUR HANDOVER', 'fps-eyebrow'), briefTitle, el('p', 'Bring the location, question, evidence gaps and your selected support together.', 'fps-muted')); briefHeader.append(briefHeaderCopy);
    const briefForm = el('div', null, 'fps-brief-form');
    const aimField = el('div', null, 'fps-field'); const aimLabel = el('label', 'Project aim or priorities'); aimLabel.htmlFor = prefix + 'aim'; const aimInput = el('textarea'); aimInput.id = aimLabel.htmlFor; aimInput.rows = 3; aimInput.maxLength = 2000; aimInput.placeholder = 'For example: confirm a viable pathway, retain existing trees and understand the next design tasks.';
    aimInput.addEventListener('input', () => { aim = aimInput.value; markChanged(); }); aimField.append(aimLabel, aimInput);
    const timingField = el('div', null, 'fps-field'); const timingLabel = el('label', 'Preferred timing (optional)'); timingLabel.htmlFor = prefix + 'timing'; const timingInput = el('input'); timingInput.id = timingLabel.htmlFor; timingInput.type = 'text'; timingInput.maxLength = 200; timingInput.placeholder = 'Your target or preferred review window';
    timingInput.addEventListener('input', () => { timing = timingInput.value; markChanged(); }); timingField.append(timingLabel, timingInput); briefForm.append(aimField, timingField);
    const prepare = button('Prepare service brief', prepareBrief, 'fps-button fps-primary'); const briefStatus = el('p', 'Choose support and add any assumptions, then prepare your brief.', 'fps-brief-status'); briefStatus.setAttribute('role', 'status');
    const briefActions = el('div', null, 'fps-brief-actions'); briefActions.append(prepare, briefStatus);
    const briefPreview = el('div', null, 'fps-brief-preview'); briefPreview.hidden = true;
    const previewLabel = el('label', 'Review and revise your brief'); previewLabel.htmlFor = prefix + 'brief-text'; const briefEditor = el('textarea'); briefEditor.id = previewLabel.htmlFor; briefEditor.rows = 18; briefEditor.maxLength = 30000; briefEditor.spellcheck = true;
    const downloadText = button('Download brief (.txt)', () => download('txt'), 'fps-button fps-primary');
    const downloadJson = button('Download project data (.json)', () => download('json'));
    const downloadActions = el('div', null, 'fps-download-actions'); downloadActions.append(downloadText, downloadJson);
    briefPreview.append(previewLabel, briefEditor, downloadActions, el('p', 'The downloads stay on your device. Nothing is sent to an expert, booked, paid or lodged by this demo.', 'fps-small-note'));
    briefSection.append(briefHeader, briefForm, briefActions, briefPreview);
    const finalNote = el('p', 'Your entries stay in this page until you leave or reload it. Professional scope, fees, availability and responsibility must be agreed before a real service starts.', 'fps-final-note');
    const contextDetails=el('details',null,'fps-context-details');contextDetails.append(el('summary','Project address, preliminary report and evidence gaps'),contextPanel);
    toolsArea.append(routeTasks,scopeSection,tabList,...TOOLS.map(item=>panels[item.id]),briefSection);
    shell.append(top, hero, contextDetails,routeSection,progressRoot,toolsArea,finalNote); root.append(shell);
    if(scope.FirstPrincipleProjectProgress)progressApi=scope.FirstPrincipleProjectProgress.mount(progressRoot,{onStep:openTask});
    if(scope.FirstPrinciplePDFIntake)pdfApi=scope.FirstPrinciplePDFIntake.mount(pdfRoot,{onChange:snapshot=>{pdfState=snapshot;markChanged();}});
    else pdfRoot.append(el('p','The drawing reader could not load. Refresh to try again.','fps-muted'));
    if(scope.FirstPrincipleExpertContact)emailApi=scope.FirstPrincipleExpertContact.mount(emailRoot,{onChange:snapshot=>{emailState=snapshot;if(!syncing)markChanged();}});
    else emailRoot.append(el('p','The email draft interface could not load. Refresh to try again.','fps-muted'));
    function setTrack(track) {
      activeTrack = TOOLS.some(item => item.id === track) ? track : 'cost';
      TOOLS.forEach(item => { const active = item.id === activeTrack; tabs[item.id].setAttribute('aria-selected', String(active)); tabs[item.id].tabIndex = active ? 0 : -1; panels[item.id].hidden = !active; });
    }
    function chooseRoute(id,focus=true){
      if(!hasContext){routeStatus.textContent='Return to your address report before starting a project workspace.';return;}
      const choice=ROUTES.find(item=>item.id===id);if(!choice)return;
      route=id;toolsArea.hidden=false;
      Object.entries(routeButtons).forEach(([key,action])=>action.setAttribute('aria-pressed',String(key===route)));
      routeStatus.textContent=choice.title+'. Your drawings and preparation work remain available when you switch starting points.';
      setTrack(choice.track);markChanged();
      if(focus)toolsArea.scrollIntoView({block:'start',behavior:'instant'});
    }
    function openTask(target){
      if(!hasContext)return;
      if(!route)chooseRoute(target==='drawings'?'drawings':target==='experts'||target==='email'?'review':'brief',false);
      if(target==='brief'){briefSection.scrollIntoView({block:'start',behavior:'instant'});aimInput.focus();return;}
      const track=target==='documents'?'drawings':target==='collaboration'?'email':target;
      if(TOOLS.some(item=>item.id===track)){setTrack(track);toolsArea.scrollIntoView({block:'start',behavior:'instant'});tabs[track].focus();}
    }
    function syncProject(){
      if(syncing)return;syncing=true;
      try{
        const project={hasContext,route,pdf:pdfState,drawingSummary:pdfState,confirmedFacts:(pdfState.facts||[]).filter(fact=>fact.status==='confirmed'),materialStatus:{...materialStatus},budget:budgetResult(),briefPrepared,specialists:[...expertSelection],supportedNSW:context.location.councilNames.length>0,email:emailState};
        emailApi?.updateProject(project);emailState=emailApi?.getState()||emailState;project.email=emailState;progressApi?.update(project);
        renderNextTasks();
      }finally{syncing=false;}
    }
    function renderNextTasks(){
      routeTasks.replaceChildren();if(!route)return;
      routeTasks.append(el('p','Next tasks for this project','fps-eyebrow'));
      let tasks;
      if(route==='drawings'){
        tasks=pdfState.status==='needs_ocr'||pdfState.needsOCR?[['drawings','Arrange OCR or review the remaining pages manually'],['experts','Discuss drawing quality and missing information'],['email','Prepare an expert email draft']]:pdfState.status==='error'?[['drawings','Replace the unreadable PDF or request manual review'],['experts','Discuss the drawing information to provide'],['email','Prepare an expert email draft']]:pdfState.status==='review'?[['drawings','Confirm or leave the extracted drawing notes unresolved'],['application','Reconcile the drawings with the evidence checklist'],['email','Prepare questions for the reviewing expert']]:[['drawings','Choose a drawing PDF and extract its pages'],['drawings','Check page references before confirming notes'],['experts','Scope a planner or specialist review']];
      }else tasks=route==='brief'?[['brief','Describe your scope and priorities'],['cost','Record your own cost allowances'],['application','Identify the drawings and records to prepare']]:[['application','Record the evidence you already have'],['experts','Choose the specialist roles to discuss'],['email','Prepare an email draft for your chosen expert']];
      const actions=el('div',null,'fps-next-task-actions');tasks.forEach(([target,label])=>actions.append(button(label,()=>openTask(target),'fps-next-task')));routeTasks.append(actions);
      if(pdfState.illustrative||pdfState.document?.demo)routeTasks.append(el('p','The loaded example is an illustrative drawing. Its notes are not evidence for the historical case.','fps-illustrative-note'));
    }
    function budgetResult() {
      let subtotal = 0, entered = 0; const lines = [], errors = [];
      ALLOWANCES.forEach(item => {
        const raw = budget[item.id] || '';
        if (!raw.trim()) { lines.push({ id: item.id, label: item.label, amount: null }); return; }
        const value = Number(raw);
        if (!Number.isFinite(value) || value < 0 || value > 1000000000) { errors.push(item.label); return; }
        subtotal += value; entered += 1; lines.push({ id: item.id, label: item.label, amount: value });
      });
      const rate = contingency.trim() ? Number(contingency) : 0;
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) errors.push('Contingency');
      const contingencyAmount = errors.length ? null : subtotal * rate / 100;
      return { lines, entered, missing: ALLOWANCES.length - entered, subtotal, contingencyPercent: rate, contingencyAmount, total: errors.length || !entered ? null : subtotal + contingencyAmount, gstBasis: gstBasis || 'not_specified', errors };
    }
    function renderBudget() {
      const result = budgetResult(); breakdown.replaceChildren();
      totalText.textContent = result.errors.length ? 'Check your inputs' : result.total === null ? 'Not entered' : money(result.total);
      budgetStatus.textContent = result.errors.length ? 'Enter non-negative allowances up to AUD 1 billion and a contingency between 0% and 100%.' : !result.entered ? 'No amounts have been assumed.' : `${result.entered} of ${ALLOWANCES.length} allowances entered. ${result.missing ? result.missing + ' blank item(s) excluded.' : 'All allowance categories entered.'}`;
      result.lines.forEach(line => { breakdown.append(el('dt', line.label), el('dd', line.amount === null ? 'Not entered' : money(line.amount))); });
      breakdown.append(el('dt', 'Entered subtotal'), el('dd', money(result.subtotal)), el('dt', 'Contingency' + (Number.isFinite(result.contingencyPercent) ? ' · ' + result.contingencyPercent + '%' : '')), el('dd', result.contingencyAmount === null ? 'Check input' : money(result.contingencyAmount)), el('dt', 'GST basis'), el('dd', result.gstBasis === 'inclusive' ? 'Inputs include GST' : result.gstBasis === 'exclusive' ? 'Inputs exclude GST; no GST added' : 'Not specified; no GST added'));
      prepare.disabled = !hasContext || result.errors.length > 0;
      downloadText.disabled = !briefPrepared || result.errors.length > 0; downloadJson.disabled = !briefPrepared || result.errors.length > 0;
    }
    function renderMaterialCount() {
      const values = MATERIALS.map(item => materialStatus[item.id] || 'not_started');
      materialCounter.textContent = `${values.filter(value => value === 'draft').length} draft available · ${values.filter(value => value === 'review').length} marked for professional review · ${values.filter(value => value === 'not_started').length} not started`;
    }
    function markChanged() {
      if (briefPrepared) { briefPrepared = false; briefStatus.textContent = 'Your plan changed. Prepare an updated brief before downloading.'; downloadText.disabled = true; downloadJson.disabled = true; }
      syncProject();
    }
    function briefData() {
      return { brand: '1stprincipleai', mode: 'demonstration_service_brief', preparedOn: new Date().toISOString().slice(0, 10), location: context.location, question: context.question, preliminaryReport: context.report, projectRoute:route, projectAim: aim.trim(), preferredTiming: timing.trim(), requestedServices: TRACKS.filter(item => selected.has(item.id)).map(item => ({ id: item.id, title: item.title })), budget: budgetResult(), materials: MATERIALS.map(item => ({ id: item.id, title: item.title, preparationStatus: materialStatus[item.id] || 'not_started', responsibleRoleToConfirm: item.owner })), requestedSpecialists: SPECIALISTS.filter(item => expertSelection.has(item.id)).map(item => ({ id: item.id, title: item.title, scopeToDiscuss: item.copy })), preferredFirstDiscussion: meeting,drawingReview:pdfState,progress:progressApi?.getState()||null,emailPreparation:emailState, professionalReviewCompleted: false, liveAgentStarted: false, expertContacted: false, applicationSubmitted: false, notes: 'User-entered allowances are assumptions, not a market estimate or quote. Drawing notes are local extraction candidates, not verified site facts. Service scope, fees, availability and professional responsibility remain to be agreed.' };
    }
    function prepareBrief() {
      if (!hasContext) { briefStatus.textContent = 'Return to the location report before preparing a service brief.'; return; }
      const data = briefData();
      if (data.budget.errors.length) { briefStatus.textContent = 'Correct the budget inputs before preparing the brief.'; setTrack('cost'); return; }
      if (!selected.size) { briefStatus.textContent = 'Select at least one support area for the service brief.'; scopeTitle.focus?.(); return; }
      const section = (title, lines) => [title, ...lines, ''].join('\n');
      const lines = [
        '1stprincipleai — Service brief', 'Demo draft for review · ' + data.preparedOn, '',
        section('PROJECT', [data.location.name, data.location.councilNames.join(' / ') || 'Council to confirm', data.preliminaryReport.caseId ? 'Case reference: ' + data.preliminaryReport.caseId : '', 'Initial question: ' + (data.question || 'To be provided'), 'Priorities: ' + (data.projectAim || 'To discuss'), 'Preferred timing: ' + (data.preferredTiming || 'To discuss')].filter(Boolean)),
        section('PRELIMINARY REPORT', ['Confidence: ' + data.preliminaryReport.confidence.toUpperCase(), data.preliminaryReport.summary || 'Report not provided.']),
        section('EVIDENCE TO RESOLVE', data.preliminaryReport.missing.length ? data.preliminaryReport.missing.map(item => '• ' + item) : ['Confirm the site evidence, applicable controls and professional review requirements.']),
        section('REQUESTED SUPPORT', data.requestedServices.map(item => '• ' + item.title)),
        section('DRAWING REVIEW', [data.drawingReview.document?data.drawingReview.document.name+' — '+(data.drawingReview.document.pages||data.drawingReview.pageCount||'Unconfirmed')+' page(s)':'No drawing PDF has been read.',data.drawingReview.illustrative||data.drawingReview.document?.demo?'ILLUSTRATIVE SAMPLE — not a project record.':'Document evidence remains subject to professional review.',...(data.drawingReview.facts||[]).filter(item=>item.status==='confirmed').map(item=>'• '+item.label+': '+item.value+' (page '+item.page+', user-reviewed note)'), 'Local extraction does not verify dimensions, compliance or approval.']),
        section('USER-ENTERED BUDGET ASSUMPTIONS · AUD', [...data.budget.lines.map(item => item.label + ': ' + (item.amount === null ? 'Not entered' : money(item.amount))), 'Contingency: ' + data.budget.contingencyPercent + '%', 'Working total: ' + (data.budget.total === null ? 'Not entered' : money(data.budget.total)), 'GST basis: ' + data.budget.gstBasis, 'Blank items are excluded. This is not a market estimate or a quote.']),
        section('MATERIALS', data.materials.map(item => '• ' + item.title + ' — ' + MATERIAL_STATES.find(([id]) => id === item.preparationStatus)[1] + ' · ' + item.responsibleRoleToConfirm)),
        section('SPECIALIST REVIEW TO DISCUSS', data.requestedSpecialists.length ? data.requestedSpecialists.map(item => '• ' + item.title + ': ' + item.scopeToDiscuss) : ['Specialist requirements to be confirmed with the planner.']),
        section('FIRST DISCUSSION', [data.preferredFirstDiscussion + ' — preference only; no appointment arranged.']),
        section('REPORT SOURCES', data.preliminaryReport.sources.length ? data.preliminaryReport.sources.map(item => (item.title || 'Official source') + ': ' + item.url) : ['Source review remains to be completed.']),
        'Demo only. No live AI Agent, professional engagement, payment or application submission has been started. Agree scope, fees, responsibility and required evidence before progressing.'
      ];
      briefEditor.value = lines.join('\n'); briefPrepared = true; briefPreview.hidden = false; briefStatus.textContent = 'Draft ready. Review or revise the text, then download it for your own use.'; downloadText.disabled = false; downloadJson.disabled = false;syncProject(); briefEditor.focus();
    }
    function download(format) {
      if (!briefPrepared) return;
      const data = briefData();
      const content = format === 'json' ? JSON.stringify({ ...data, reviewedBriefText: briefEditor.value }, null, 2) + '\n' : briefEditor.value;
      const blob = new Blob([content], { type: format === 'json' ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob); const anchor = el('a'); anchor.href = url; anchor.download = '1stprincipleai-service-brief.' + format;
      document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      briefStatus.textContent = 'Brief downloaded. It has not been sent or submitted.';
    }
    function show(input) {
      const next = normalize(input); const nextSignature = JSON.stringify(next);
      hasContext = Boolean(input?.location && input?.report);
      if (nextSignature !== signature) {
        context = next; signature = nextSignature;
        route=null;toolsArea.hidden=true;routeStatus.textContent='Choose a starting point. You can change it as your information develops.';Object.values(routeButtons).forEach(action=>action.setAttribute('aria-pressed','false'));
        budget = {}; contingency = ''; gstBasis = ''; materialStatus = {}; aim = ''; timing = ''; meeting = 'Online first';
        selected = new Set(TRACKS.map(item => item.id)); expertSelection = new Set(['planner']);
        const risks = (context.question + ' ' + context.report.summary + ' ' + context.report.missing.join(' ')).toLowerCase();
        if (/bushfire|bush fire|bal[- ]/.test(risks)) expertSelection.add('bushfire');
        if (/tree|arbor/.test(risks)) expertSelection.add('arborist');
        if (/flood|drainage/.test(risks)) expertSelection.add('flood');
        locationText.textContent = context.location.name;
        councilText.textContent = context.location.councilNames.join(' / ') || 'Responsible council to confirm';
        confidence.textContent = 'Report confidence · ' + context.report.confidence.charAt(0).toUpperCase() + context.report.confidence.slice(1);
        questionText.textContent = context.question ? 'Your question: ' + context.question : 'Describe the intended works with your reviewing planner.';
        reportText.textContent = context.report.summary || 'Return to the location report to prepare a preliminary assessment first.'; sourceList.replaceChildren();
        context.report.sources.forEach(source => { const link = el('a', source.title || 'Official source'); link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; const item = el('li'); item.append(link); sourceList.append(item); });
        missingList.replaceChildren();
        (context.report.missing.length ? context.report.missing : ['Confirm current site evidence, applicable controls and the responsible professional reviewer.']).forEach(text => missingList.append(el('li', text)));
        ALLOWANCES.forEach(item => { costInputs[item.id].value = ''; }); contingencyInput.value = ''; gstSelect.value = '';
        Object.values(materialSelects).forEach(select => { select.value = 'not_started'; });
        Object.values(scopeInputs).forEach(item => { item.input.checked = true; item.card.classList.add('is-selected'); });
        Object.entries(expertInputs).forEach(([id, item]) => { item.input.checked = expertSelection.has(id); item.card.classList.toggle('is-selected', item.input.checked); });
        aimInput.value = ''; timingInput.value = ''; meetingSelect.value = meeting;
        briefPrepared = false; briefPreview.hidden = true; briefEditor.value = ''; briefStatus.textContent = 'Choose support and add any assumptions, then prepare your brief.';
        renderBudget(); renderMaterialCount(); setTrack('drawings');
        syncing=true;
        try{pdfApi?.setContext(hasContext?context:null,{reset:true});pdfState=pdfApi?.getState()||{status:'empty',facts:[],confirmedCount:0};emailApi?.setContext(hasContext?context:null,{reset:true});emailState=emailApi?.getState()||{draftPrepared:false,emailSent:false,emailDeliveryConnected:false};progressApi?.reset();}finally{syncing=false;}
      }
      root.dataset.serviceContext = hasContext ? 'ready' : 'missing';
      renderBudget();syncProject();
      return api;
    }
    const api = { show, refresh() {}, getState() { return { hasContext,route, activeTrack, selectedServices: [...selected], budget: budgetResult(), materialStatus: { ...materialStatus }, requestedSpecialists: [...expertSelection], briefPrepared,pdf:pdfState,progress:progressApi?.getState()||null,email:emailState }; } };
    root._firstPrincipleServices = api;
    show(null);
    return api;
  }
  scope.FirstPrincipleServices = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
