/* A customer-safe snapshot explorer. No network calls or decision execution. */
(() => {
  'use strict';
  const source = document.getElementById('case-demo-data');
  const outlet = document.getElementById('view-content');
  if (!source || !outlet) return;
  let data;
  try { data = JSON.parse(source.textContent); }
  catch { outlet.textContent = 'Unable to read the case snapshot. Please reload the complete demo page.'; return; }
  if (data.audience !== 'customer' || data.schema_version !== 'case-demo-0.1') {
    outlet.textContent = 'This page requires a customer demo snapshot.'; return;
  }
  const stageLabels = { enquiry: 'Enquiry', lodgement: 'Lodgement', after_lodgement: 'After lodgement' };
  const viewLabels = { map: 'Location & questions', services:'Advanced services', workflow: 'Workflow', facts: 'Case facts', tree: 'Decision questions', evidence: 'Evidence trail', results: 'Progress' };
  const stateLabels = {
    known: 'Candidate recorded · unverified', checked_present: 'Presence recorded · unverified',
    checked_clear: 'Clearance claim recorded · unverified', not_applicable: 'Not-applicable claim · unverified',
    unknown: 'Unresolved', not_checked: 'Not checked', source_unavailable: 'Source unavailable', conflict: 'Conflicting evidence'
  };
  const qualityLabels = {
    early_stage_claim_uses_post_lodgement_material: 'The source includes post-lodgement material, so its value is withheld from this view.',
    negative_or_na_requires_named_verification: 'A clearance or not-applicable claim lacks named verification. The question remains open.',
    evidence_index_missing: 'No linked evidence index is available.', project_fact_requires_case_specific_evidence: 'A rule alone cannot establish a fact about this site.',
    map_silence_is_not_clear: 'An empty map result does not establish that a constraint is absent.', not_applicable_reason_missing: 'The reason for the not-applicable claim has not been recorded.',
    evaluation_source_not_case_evidence: 'Evaluation material cannot establish facts about this case.',
    conflict_register_requires_local_review: 'The related conflict has not received a local professional review.'
  };
  const treeLabels = {
    A: { name: 'Development type', short: 'Understand the proposal', note: 'Check self-contained use, the principal dwelling, title intentions and construction type.' },
    B: { name: 'Permissibility & site', short: 'Prepare the DA checks', note: 'Organise zoning, area, title and site-fit checks. Experience-based prompts cannot close a pathway.' },
    C: { name: 'CDC pathway', short: 'Check complying development', note: 'Gather site, design, hazard and specialist approval inputs. Automated branches have not been executed.' },
    D: { name: 'Moveable dwellings', short: 'A different structure pathway', note: 'Consider this pathway only after identifying the structure. The label “tiny home” does not establish an approval exemption.' }
  };
  const nodeNames = {
    A0: 'Self-contained use', A1: 'Principal dwelling', A2: 'Dwelling count & lawfulness', A3: 'Same lot & title', A3a: 'Full scope of works', A4: 'Moveable structure', A5: 'Manufactured or relocatable home', A6: 'Location & form',
    B1: 'Zoning & dwelling permissibility', B2: 'Additional permitted uses', B3: 'Site area', B4: 'Site fit without plans', B4a: 'Previous refusals & design risk', B4b: 'Constraints & required reports', B4c: 'Comparable site experience', B5: 'Secondary dwelling area', B6: 'Total floor-area controls', B7: 'Title restrictions & building scope',
    C0: 'Code coverage for all works', C1: 'Eligible residential zones', C2: 'Land exclusions', C3: 'Other agency consent', C4: 'Area, frontage & access', C5: 'Internal conversion', C5a: 'Internal conversion conditions', C6: 'Basement & roof terrace', C7: 'New principal dwelling', C8: 'Design standards checklist', C9: 'Bush fire prone land', C9a: 'Bush fire rating & access', C10: 'Flood control lot', C10a: 'Flood areas & engineering conditions', C11: 'Specialist approvals', 'C-out': 'CDC pathway review',
    D1: 'Caravan for household use', D2: 'Short stays in caravans or tents', D3: 'Seasonal agricultural accommodation', D3a: 'Temporary disaster accommodation', D4: 'Specialist approval requirements'
  };
  const featureNames = {
    'proposal.description_raw': 'Initial enquiry', 'proposal.scope_items': 'Full scope of works', 'proposal.subdivision': 'Subdivision proposed',
    'sd.self_contained': 'Self-contained living facilities', 'sd.form': 'Secondary dwelling form', 'sd.structure_kind': 'Structure & construction type',
    'site.principal_dwelling': 'Principal dwelling status', 'site.dwellings_after': 'Dwelling count after works', 'title.separate_title_intent': 'Separate title proposed',
    'history.existing_structures_lawful': 'Lawfulness of existing structures', 'history.prior_applications': 'Previous applications',
    'site.lot_ids': 'Site lot identifiers', 'site.area_m2': 'Site area', 'site.frontage_m': 'Frontage width', 'land.zone': 'Land zoning',
    'land.split_zone': 'Split zoning', 'land.lep_dwelling_house_bar': 'Specific dwelling permissibility restrictions', 'land.apu': 'Additional permitted uses',
    'land.acid_sulfate_class': 'Acid sulfate soil class', 'land.bushfire_prone': 'Bush fire prone land', 'land.heritage': 'Heritage constraints',
    'land.anef': 'Aircraft noise constraints', 'land.flood_control_lot': 'Flood control lot', 'land.esa': 'Environmentally sensitive area', 'land.biodiversity_mapped': 'Mapped biodiversity',
    'land.cdc_land_exclusions': 'CDC land exclusions', 'sd.floor_area_da_m2': 'Dwelling floor area for DA', 'sd.floor_area_cdc_m2': 'Dwelling floor area for CDC',
    'site.total_floor_area_cdc_m2': 'Total floor area for CDC', 'building.basement': 'Basement proposed', 'building.roof_terrace': 'Roof terrace proposed',
    'building.height_m': 'Building height', 'building.setbacks_m': 'Building setbacks', 'site.landscaped_area': 'Landscaped area',
    'site.bal_building': 'Bush fire rating at the building', 'site.bal_access': 'Bush fire access conditions', 'site.water_supply': 'Water supply',
    'services.sewer': 'Sewer connection', 'title.restrictions': 'Title restrictions', 'approval.s68_required': 'Section 68 approval requirements',
    'approval.s138_required': 'Section 138 road works consent', 'lep.max_floor_area_dwelling_house': 'Planning controls on total dwelling floor area'
  };
  const vocabulary = new Map((data.vocabulary.features || []).map(item => [item.feature_key, item]));
  const evidenceMap = new Map(data.evidence.map(item => [item.evidence_id, item]));
  const stages = Object.keys(stageLabels);
  const unresolved = new Set(['unknown', 'not_checked', 'source_unavailable', 'conflict']);
  const allFeatureKeys = [...new Set(stages.flatMap(stage => [...data.stages[stage].facts.map(fact => fact.feature_key), ...data.stages[stage].deferred_features.map(fact => fact.feature_key)]))];
  const ui = { view: 'map', stage: 'enquiry', workflowStep: '1', fact: 'sd.form', tree: 'A', node: 'A0', evidence: data.evidence[0]?.evidence_id || '', tour: null };
  let mapApi = null, servicesApi = null, serviceContext = null;
  const nameOf = key => featureNames[key] || vocabulary.get(key)?.label || key;
  const dossier = () => data.stages[ui.stage];
  const factsByKey = () => new Map(dossier().facts.map(fact => [fact.feature_key, fact]));
  function element(tag, text, className) {
    const result = document.createElement(tag);
    if (text !== undefined && text !== null) result.textContent = String(text);
    if (className) result.className = className;
    return result;
  }
  function add(parent, ...children) { children.filter(Boolean).forEach(child => parent.append(child)); return parent; }
  function badge(text, kind = '') { return element('span', text, `badge${kind ? ` badge-${kind}` : ''}`); }
  function button(text, className, action) {
    const result = element('button', text, className);
    result.type = 'button'; result.addEventListener('click', action); return result;
  }
  function heading(eyebrow, title, subtitle, side) {
    const result = element('div', null, 'section-heading');
    const copy = element('div');
    add(copy, element('p', eyebrow, 'eyebrow'), element('h2', title), element('p', subtitle));
    add(result, copy, side ? element('span', side, 'quiet-label') : null); return result;
  }
  function announce(text) { document.getElementById('announcement').textContent = text; }
  function setView(view) {
    if (!Object.hasOwn(viewLabels, view)) return;
    if (view === 'services' && !serviceContext) return;
    ui.tour = null; ui.view = view; render();
    announce(`Opened ${viewLabels[view]}. Evidence view: ${stageLabels[ui.stage]}.`);
  }
  function safeValue(fact) {
    if (fact.customer_value_review_required) return 'Measurement basis needs review';
    if (fact.customer_value_redacted) return 'Site details or free text withheld';
    if (fact.candidate_value === null || fact.candidate_value === undefined) return 'No usable candidate value yet';
    const value = fact.candidate_value;
    const translations = { detached: 'Detached', attached: 'Attached to the principal dwelling', within_principal: 'Within the principal dwelling', site_built: 'Site-built', existing: 'Existing principal dwelling', yes: 'Yes', no: 'No', true: 'Yes', false: 'No' };
    let text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    text = translations[text] || text;
    if (fact.unit && !['text', 'count', 'bool', 'enum'].includes(fact.unit)) text += ` ${fact.unit}`;
    return text;
  }
  function stateBadge(fact) {
    if (fact.customer_value_review_required) return badge('Multiple measurements need review', 'warm');
    if (fact.customer_value_redacted) return badge('Withheld from the customer demo', 'neutral');
    return badge(stateLabels[fact.effective_state] || 'Needs review', fact.effective_state === 'conflict' ? 'danger' : unresolved.has(fact.effective_state) ? 'warm' : 'neutral');
  }
  function docList(ids) {
    const list = element('ul', null, 'doc-list');
    ids.forEach(id => {
      const doc = evidenceMap.get(id);
      const copy = element('div');
      add(copy, element('strong', doc?.title || 'Source index'), element('p', doc?.retained_copy_claim === 'provider_reports_no_copy' ? 'Provider reports no original copy · document needed' : 'Index recorded · original not professionally verified here'));
      add(list, add(element('li', null, 'doc-item'), element('span', id, 'doc-id'), copy));
    }); return list;
  }
  const workflow = [
    { id: '1', name: 'Receive enquiry', status: 'Data organisation available', mode: 'built', title: 'Record the request and the unknowns', description: 'Enquiry records, evidence snapshots and missing-information lists are available. This is a development case reconstructed from historical material, not a new client engagement.', items: ['Retain the enquiry meaning and its source', 'Separate candidate facts, unknowns, unchecked items and conflicts', 'Limit early views to information available at that stage'], next: 'Explore case facts', view: 'facts' },
    { id: '2', name: 'Check permissibility', status: 'Question organisation available', mode: 'built', title: 'Make the required inputs visible', description: 'Trees A–D organise questions and evidence requirements from the available information. Rules and written branches still need professional confirmation; DA or CDC eligibility is not decided automatically.', items: ['Identify development and structure type', 'Gather DA permissibility and site questions', 'Collect inputs for CDC and specialist checks'], next: 'Explore decision questions', view: 'tree' },
    { id: '3', name: 'Scope & quote', status: 'Business integration planned', mode: 'planned', title: 'Turn reviewed findings into a clear scope', description: 'A confirmed proposal and pathway will inform required reports, service scope, fees and client acceptance. Automated quotes and acceptance records are not available yet.', items: ['Define the service scope and required reports', 'Set fees and milestones with human review', 'Record whether the client accepts'], next: 'See the next milestone', view: 'results' },
    { id: '4–6', name: 'Prepare the package', status: 'Document production planned', mode: 'planned', title: 'Build from the missing-information list', description: 'The information and evidence foundation is in place. Plans, reports and a Statement of Environmental Effects can be connected later. This demo does not produce a submission-ready package.', items: ['Collect plans and specialist reports for the proposal', 'Organise evidence and explanatory documents', 'Respond to returned packages and requests for information'], next: 'Explore the evidence trail', view: 'evidence' },
    { id: '7', name: 'Review & sign-off', status: 'Professional review required', mode: 'review', title: 'Keep professional accountability explicit', description: 'Versioning and human review records have a foundation. This case has no local planning professional sign-off. Recording information does not approve a proposal or pathway.', items: ['Verify originals, proposal versions and applicable dates', 'Review critical rules and conflicts', 'Obtain responsible reviewer, client or owner sign-off'], next: 'See the review gaps', view: 'results' },
    { id: '8', name: 'Lodge in the Portal', status: 'Business integration planned', mode: 'planned', title: 'Proceed to lodgement after sign-off', description: 'Completeness checks, lodgement and fee records can be connected later. This website is not connected to the Planning Portal and does not submit applications on your behalf.', items: ['Check the application package for completeness', 'Complete formal lodgement and fee processing', 'Record acceptance or return'], next: 'Return to the facts', view: 'facts' },
    { id: '9', name: 'Assessment & RFIs', status: 'Business integration planned', mode: 'planned', title: 'Turn assessment feedback into tracked tasks', description: 'Future work will track RFIs, comments, additional reports and negotiations, with a return to package preparation. No new council feedback has been added here.', items: ['Record RFIs and comments', 'Assign document updates and review tasks', 'Retain revised document versions'], next: 'See project progress', view: 'results' },
    { id: '10', name: 'Determination & follow-up', status: 'Business integration planned', mode: 'planned', title: 'Connect decisions, conditions and follow-up', description: 'Future work will organise consent conditions, handover and subsequent processes. Historical approval outcomes are not presented as automated decisions by this system.', items: ['Organise determinations and conditions', 'Track subsequent certificates and handover', 'Have a professional assess modification or review needs'], next: 'See what has been delivered', view: 'results' }
  ];
  function renderWorkflow() {
    const result = element('section');
    add(result, heading('THE BIG PICTURE', 'Ten steps, three decisions, two loops', 'Select a step to explore available capabilities and planned work. The workflow is a guide; changing evidence views does not complete a step.', 'Current demo: information and questions'));
    const layout = element('div', null, 'workflow-layout');
    const map = element('div', null, 'workflow-map');
    const grid = element('ol', null, 'workflow-grid');
    workflow.forEach(step => {
      const control = button('', 'workflow-step', () => { ui.workflowStep = step.id; render(); });
      control.setAttribute('aria-pressed', String(step.id === ui.workflowStep));
      add(control, element('span', step.id, 'step-number'), element('span', step.name, 'step-name'), element('span', step.status, `step-status is-${step.mode}`));
      add(grid, add(element('li'), control));
    });
    const legend = element('div', null, 'workflow-legend');
    add(legend, element('span', 'Available information tools'), element('span', 'Professional sign-off'), element('span', 'Planned business functions'));
    const decisions = element('div', null, 'decision-strip');
    [['Permissible?', 'Professional assessment required; no → close / refer'], ['Client accepts?', 'Accepted scope → prepare the package'], ['Accepted by council?', 'Returned → prepare the package again']].forEach(([title, copy]) => {
      const item = element('div', null, 'decision-item');
      add(item, element('span', '', 'decision-symbol'), document.createTextNode(title), element('small', copy)); add(decisions, item);
    });
    add(map, grid, legend, decisions, element('p', '↶ Return loop: acceptance check → package preparation · ↶ RFI loop: assessment → package preparation', 'return-loop'));
    const step = workflow.find(item => item.id === ui.workflowStep) || workflow[0];
    const details = element('aside', null, 'detail-panel');
    const list = element('ul'); step.items.forEach(item => add(list, element('li', item)));
    add(details, element('p', `STEP ${step.id}`, 'eyebrow'), element('h3', step.title), element('p', step.description), element('div', '', 'detail-divider'), element('div', 'WHAT THIS STEP NEEDS', 'mini-label'), list, button(`${step.next} →`, 'button', () => setView(step.view)));
    add(layout, map, details);
    add(result, layout, element('p', 'This read-only development replay has no formal client progression record, accepted quote, professionally approved pathway or local lodgement.', 'context-line')); return result;
  }
  function renderFacts() {
    const result = element('section');
    add(result, heading('FACTS IN CONTEXT', 'One case. Different information over time.', 'Select a field to inspect its candidate value, sources and unresolved issues in this view. Visible information is not necessarily verified.', `${allFeatureKeys.length} case facts`));
    const grid = element('div', null, 'detail-grid');
    const factPanel = element('div', null, 'panel');
    const label = element('label', 'Choose a fact', 'field-label'); label.htmlFor = 'fact-select';
    const select = element('select', null, 'field-select'); select.id = 'fact-select';
    allFeatureKeys.forEach(key => { const option = element('option', nameOf(key)); option.value = key; option.selected = key === ui.fact; add(select, option); });
    select.addEventListener('change', () => { ui.fact = select.value; render(); document.getElementById('fact-select')?.focus(); });
    add(factPanel, label, select, element('p', ui.fact, 'field-key'));
    const fact = factsByKey().get(ui.fact);
    const evidencePanel = element('div', null, 'panel');
    add(evidencePanel, element('p', 'SOURCE CONNECTION', 'eyebrow-sub'), element('h3', 'Evidence for this fact'));
    if (!fact) {
      const deferred = dossier().deferred_features.find(item => item.feature_key === ui.fact);
      add(factPanel, element('div', 'Later-stage fact · withheld from this view', 'fact-value is-empty'), badge('Not available at this stage', 'neutral'), element('div', '', 'section-divider'), element('p', `The provider assigned this fact to ${stageLabels[deferred?.stage_known] || 'a later stage'}. Change evidence views to see the difference; its value remains withheld here.`, 'state-explainer'));
      add(evidencePanel, element('p', 'Later-stage sources are not used to backfill facts as if they were known earlier.', 'empty-state'));
    } else {
      add(factPanel, element('div', safeValue(fact), `fact-value${fact.candidate_value == null ? ' is-empty' : ''}`));
      add(factPanel, add(element('div', null, 'fact-meta'), stateBadge(fact), badge(`Recorded: ${stageLabels[fact.stage_known]}`, 'neutral')));
      add(factPanel, element('p', fact.customer_value_review_required ? 'The sources contain different measurements or definitions. This view does not select one value; originals and proposal versions need review.' : fact.customer_value_redacted ? 'Free text or site details are withheld from this customer demo. The source record status is unchanged.' : fact.customer_value_summarized ? 'This is a simplified candidate value. Measurement definitions, source records and professional review still need checking.' : 'The candidate value comes from the provider. Original evidence has not been professionally verified here.', 'state-explainer'));
      const warningList = element('ul', null, 'quality-list');
      fact.quality_warnings.forEach(code => add(warningList, element('li', qualityLabels[code] || 'This item needs further source review.')));
      add(factPanel, warningList);
      add(evidencePanel, fact.evidence_ids.length ? docList(fact.evidence_ids) : element('p', 'No case-specific evidence index is linked at present.', 'empty-state'));
      add(evidencePanel, element('p', 'One document can have several index entries. A recorded index does not establish that an original has been obtained or verified.', 'context-line'));
    }
    add(grid, factPanel, evidencePanel); add(result, grid);
    const states = Object.entries(dossier().counts.states).map(([state, count]) => `${stateLabels[state] || state} ${count}`).join(' · ');
    add(result, element('p', `Statuses in this view: ${states}`, 'context-line')); return result;
  }
  function renderTree() {
    const result = element('section');
    add(result, heading('QUESTIONS BEFORE CONCLUSIONS', 'Turn decision trees into traceable checks', 'Select a question to inspect missing inputs. Branches are not executed, and a node does not pass simply because no inputs are missing.', `${data.nodes.length} reference nodes`));
    const tabs = element('div', null, 'tree-tabs'); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', 'Choose a decision tree');
    Object.entries(treeLabels).forEach(([id, tree]) => {
      const tab = button('', 'tree-tab', () => { ui.tree = id; ui.node = data.nodes.find(node => node.tree === id)?.node_id || ''; render(); });
      tab.setAttribute('aria-pressed', String(ui.tree === id));
      add(tab, element('span', id, 'tree-letter'), add(element('span'), element('strong', tree.name), element('small', tree.short))); add(tabs, tab);
    }); add(result, tabs);
    const layout = element('div', null, 'tree-layout'); const nodes = element('div', null, 'node-grid');
    const questions = new Map(dossier().question_queue.map(item => [item.node_id, item]));
    data.nodes.filter(node => node.tree === ui.tree).forEach(node => {
      const q = questions.get(node.node_id);
      const status = q ? `${q.missing_fields.length} missing · ${q.activation === 'active' ? 'active question' : 'conditional task'}` : 'Inputs listed · review needed';
      const control = button('', 'node-button', () => { ui.node = node.node_id; render(); }); control.setAttribute('aria-pressed', String(ui.node === node.node_id));
      add(control, element('span', node.node_id, 'node-id'), add(element('span', null, 'node-copy'), element('strong', nodeNames[node.node_id] || node.question), element('small', status, q ? 'has-gap' : ''))); add(nodes, control);
    });
    const node = data.nodes.find(item => item.node_id === ui.node) || data.nodes.find(item => item.tree === ui.tree);
    const details = element('div', null, 'panel node-detail');
    if (node) {
      const question = questions.get(node.node_id); const facts = factsByKey();
      add(details, element('p', `TREE ${ui.tree} / ${node.node_id}`, 'eyebrow-sub'), element('h3', nodeNames[node.node_id] || node.question), badge(question?.activation === 'active' ? 'Inputs currently required' : 'Conditional reference · professional review needed', 'warm'), element('p', node.question, 'source-question'));
      const inputs = element('ul', null, 'input-list');
      node.inputs.forEach(key => {
        const fact = facts.get(key); let status;
        if (!fact) status = dossier().deferred_features.some(item => item.feature_key === key) ? 'Withheld until a later stage' : 'Information missing';
        else if (fact.customer_value_redacted) status = 'Candidate details withheld';
        else status = unresolved.has(fact.effective_state) ? stateLabels[fact.effective_state] : 'Candidate information unverified';
        add(inputs, add(element('li'), element('span', nameOf(key)), element('span', status, `input-state${fact && !unresolved.has(fact.effective_state) ? ' candidate' : ''}`)));
      });
      add(details, inputs.length || node.inputs.length ? inputs : element('p', 'This is a reference exit node. Prerequisites and rules need professional confirmation first.', 'empty-state'));
      add(details, element('p', node.refer_to ? `Suggested reviewer: ${node.refer_to}` : 'Reviewer: to be assigned by the responsible professional', 'state-explainer'));
      add(details, element('p', `Related rules: ${node.rule_ids.length ? node.rule_ids.join(', ') : 'see node prerequisites'} · unconfirmed references`, 'rule-line'));
      const sourceDetail = element('details'); add(sourceDetail, element('summary', 'View minimum evidence requirements'), element('p', node.evidence_min || 'Check the evidence and findings for prerequisite nodes.', 'source-question')); add(details, sourceDetail);
    }
    add(layout, nodes, details); add(result, layout, element('p', `${treeLabels[ui.tree].note} Written branches have not been executed, and no nodes are marked as passed.`, 'context-line')); return result;
  }
  function renderEvidence() {
    const result = element('section');
    add(result, heading('TRACEABLE, NOT ASSUMED', 'Connect each fact to its evidence', 'Select an index entry to see the facts linked in this evidence view. Original file locations and site details are withheld.'));
    const summary = element('div', null, 'evidence-summary');
    add(summary, add(element('div'), element('strong', data.evidence.length), element('span', 'evidence index entries')), add(element('div'), element('strong', data.evidence.filter(item => item.original_document_verified_here).length), element('span', 'professionally verified here')), add(element('div'), element('strong', dossier().facts.filter(fact => fact.effective_state === 'conflict').length), element('span', 'visible facts with conflicts')));
    const layout = element('div', null, 'evidence-layout'); const catalog = element('div', null, 'evidence-catalog');
    data.evidence.forEach(item => {
      const control = button('', 'evidence-button', () => { ui.evidence = item.evidence_id; render(); }); control.setAttribute('aria-pressed', String(item.evidence_id === ui.evidence));
      add(control, element('span', item.evidence_id, 'doc-id'), element('span', item.title), element('span', '↗', 'evidence-arrow')); add(catalog, control);
    });
    const selected = evidenceMap.get(ui.evidence); const details = element('div', null, 'panel evidence-detail');
    if (selected) {
      add(details, element('p', selected.evidence_id, 'eyebrow-sub'), element('h3', selected.title), badge('Source index · original unverified', 'warm'), element('p', 'The register preserves the connection between facts and sources. An index entry is not treated as a verified original.', 'context-line'), element('div', '', 'section-divider'), element('p', `Linked facts visible: ${stageLabels[ui.stage]}`, 'field-label'));
      if (selected.retained_copy_claim === 'provider_reports_no_copy') add(details, element('p', 'The provider reports that no original copy has been obtained. The document is needed before its contents can be checked.', 'context-line'));
      const fields = dossier().facts.filter(fact => fact.evidence_ids.includes(selected.evidence_id));
      const linked = element('div', null, 'linked-fields');
      fields.forEach(fact => { const control = button('', 'linked-field', () => { ui.fact = fact.feature_key; setView('facts'); }); add(control, element('div', nameOf(fact.feature_key)), element('span', 'View fact →')); add(linked, control); });
      add(details, fields.length ? linked : element('p', 'No linked facts are visible in this view. This does not establish that the original evidence is absent.', 'empty-state'));
      add(details, element('p', 'Next verification steps: obtain the original → check pages, version and proposal → have the responsible reviewer record findings and a date.', 'context-line'));
    }
    add(layout, catalog, details); add(result, summary, layout, element('p', 'This case has 14 project index entries and one shared rule index. Entries can refer to different pages or plans in the same document; entry counts are not unique document counts.', 'context-line')); return result;
  }
  function renderResults() {
    const result = element('section');
    add(result, heading('WHAT WE HAVE BUILT', 'Progress you can inspect', 'Current capabilities cover versioned information, staged facts, questions and evidence review. Professional confirmation and new independent acceptance cases come next.'));
    const counts = data.package.counts; const stats = element('div', null, 'results-stat-grid');
    [[counts.development_cases, 'development cases connected'], [counts.case_facts, 'structured fact records'], [counts.nodes, 'reference question nodes'], [counts.rules, 'unconfirmed rule records']].forEach(([value, label]) => add(stats, add(element('div', null, 'results-stat'), element('strong', value), element('span', label)))); add(result, stats);
    const capabilities = [
      ['Versioned information', 'Retain source snapshots and validation records. Updates do not overwrite the existing baseline.', 'Available'],
      ['Facts by evidence stage', 'Enquiry, lodgement and post-lodgement views keep later material from being treated as earlier knowledge.', 'Explore in this demo'],
      ['Questions linked to evidence', 'Generate questions from missing inputs and link sources, limitations and review roles.', 'Explore in this demo'],
      ['Uncertainty kept visible', 'Keep unknowns, unavailable sources and conflicts explicit. Missing information does not mean no risk.', 'Available'],
      ['Professional rule confirmation', `${counts.rule_status_counts?.confirmed ?? 0} rules are recorded as confirmed. Professional judgement, executable conditions and sign-off remain outstanding.`, 'Professional confirmation needed'],
      ['Independent acceptance & integration', 'Connect quotes, document production and lodgement after new independent cases, named reviews and scoring rules are confirmed.', 'Next phase']
    ];
    const list = element('div', null, 'capability-list');
    capabilities.forEach(([name, copy, status], index) => add(list, add(element('div', null, 'capability-row'), element('span', String(index + 1).padStart(2, '0'), 'capability-number'), add(element('div'), element('h3', name), element('p', copy)), badge(status, index < 4 ? 'neutral' : 'warm')))); add(result, list);
    const next = element('div', null, 'next-panel');
    add(next, add(element('div'), element('p', 'NEXT MILESTONE', 'eyebrow-sub'), element('h3', 'Confirm rules and evidence before decisions'), element('p', 'Once engineering feedback arrives, prioritise key branch conditions, original-document checks, responsible professional confirmation and new independent acceptance cases. This website demonstrates available capabilities; it does not provide formal planning advice or a submission-ready package.')), badge('Awaiting professional feedback', 'warm')); add(result, next);
    add(result, element('p', 'This demo does not read independent acceptance answers. Historical pathways and approval outcomes are not runtime inputs. CASE-0001 is a development reconstruction and cannot replace new independent acceptance testing.', 'context-line')); return result;
  }
  const tours = [
    { view: 'workflow', stage: 'enquiry', title: '01 / Locate our progress in the full workflow', copy: 'Current information and question capabilities support the first two steps. Select any step to see available tools, professional review points and planned integrations.', step: '1' },
    { view: 'facts', stage: 'enquiry', fact: 'site.lot_ids', title: '02 / Keep later knowledge in its proper stage', copy: 'Lot information appears in the historical file, but its early source includes post-lodgement material. The enquiry view keeps it unresolved. Switch to the post-lodgement view to explore the change.' },
    { view: 'tree', stage: 'enquiry', tree: 'A', node: 'A0', title: '03 / Turn missing inputs into clear questions', copy: 'A0 asks about self-contained living facilities. The label “granny flat” alone does not decide the classification. Explore all four trees to inspect missing inputs and review roles.' },
    { view: 'evidence', stage: 'after_lodgement', evidence: 'EV-0006', title: '04 / Keep facts, conflicts and evidence connected', copy: 'The post-lodgement view reveals more information and conflicts. The 15 entries are evidence indices, not 15 verified originals. Select an entry to follow its linked facts.' },
    { view: 'results', stage: 'after_lodgement', title: '05 / See the deliverables and the next milestone', copy: 'Versioned information, three evidence stages, questions and evidence tracing are available. Professional rule confirmation and new independent acceptance cases are needed before connecting formal decisions and lodgement.' }
  ];
  function showTour(index) {
    ui.tour = index; const step = tours[index];
    Object.assign(ui, { view: step.view, stage: step.stage });
    if (step.fact) ui.fact = step.fact;
    if (step.tree) ui.tree = step.tree;
    if (step.node) ui.node = step.node;
    if (step.step) ui.workflowStep = step.step;
    if (step.evidence && evidenceMap.has(step.evidence)) ui.evidence = step.evidence;
    render(); announce(`Walkthrough step ${index + 1} of ${tours.length}. ${step.title}`);
    document.getElementById('tour-panel').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  }
  function renderTour() {
    const panel = document.getElementById('tour-panel'); panel.hidden = ui.tour === null;
    if (ui.tour === null) return;
    const step = tours[ui.tour];
    document.getElementById('tour-position').textContent = `CASE WALKTHROUGH / ${ui.tour + 1} OF ${tours.length}`;
    document.getElementById('tour-title').textContent = step.title;
    document.getElementById('tour-copy').textContent = step.copy;
    document.getElementById('tour-prev').disabled = ui.tour === 0;
    document.getElementById('tour-next').textContent = ui.tour === tours.length - 1 ? 'Finish walkthrough ✓' : 'Next →';
    const dots = document.getElementById('tour-dots'); dots.replaceChildren();
    tours.forEach((_, index) => add(dots, element('span', '', `tour-dot${index === ui.tour ? ' active' : ''}`)));
  }
  function render() {
    const isMap = ui.view === 'map';
    const isServices = ui.view === 'services';
    const isCase = !isMap && !isServices;
    document.getElementById('council-home').hidden = !isMap;
    document.getElementById('services-home').hidden = !isServices;
    document.getElementById('case-ribbon').hidden = !isCase;
    document.getElementById('case-stage-section').hidden = !isCase;
    outlet.hidden = !isCase;
    document.getElementById('page-title').textContent = isMap ? 'From a property question to a project plan.' : isServices ? 'Take the next step with the right support.' : 'The evidence behind the example project.';
    document.getElementById('page-description').textContent = isMap ? 'Find the address, get a short planning preview, then explore costs, application preparation and specialist review.' : isServices ? 'Your location, question and preliminary report stay together as you plan the next phase.' : 'Inspect the historical records, decision questions and evidence behind CASE-0001. This audit trail supports the customer journey.';
    document.querySelectorAll('[data-view]').forEach(control => {
      if (control.dataset.view === ui.view) control.setAttribute('aria-current', 'page'); else control.removeAttribute('aria-current');
    });
    document.querySelectorAll('[data-stage]').forEach(control => control.setAttribute('aria-pressed', String(control.dataset.stage === ui.stage)));
    document.getElementById('breadcrumb-view').textContent = viewLabels[ui.view];
    document.getElementById('metric-visible').textContent = dossier().counts.visible_facts;
    document.getElementById('metric-deferred').textContent = dossier().counts.withheld_later_facts;
    document.getElementById('metric-questions').textContent = dossier().counts.questions;
    const active = dossier().active_question_queue.length;
    document.getElementById('stage-caption').textContent = `${active} active questions; the rest are conditional tasks. No nodes have been passed automatically.`;
    document.getElementById('snapshot-date').textContent = `Case snapshot ${data.as_at} · sample address shown`;
    if (isCase) {
      const content = { workflow: renderWorkflow, facts: renderFacts, tree: renderTree, evidence: renderEvidence, results: renderResults }[ui.view]();
      content.classList.add('fade-in'); outlet.replaceChildren(content);
    }
    renderTour();
    if (isMap) window.requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }
  document.querySelectorAll('[data-view]').forEach(control => control.addEventListener('click', () => setView(control.dataset.view)));
  document.querySelectorAll('[data-stage]').forEach(control => control.addEventListener('click', () => { ui.stage = control.dataset.stage; render(); announce(`Evidence view changed to ${stageLabels[ui.stage]}. No business steps have been marked complete.`); }));
  document.querySelector('.brand').addEventListener('click', event => { event.preventDefault(); setView('map'); });
  window.addEventListener('lynn:open-case', () => { ui.stage = 'enquiry'; setView('workflow'); document.getElementById('main-content').focus(); });
  window.addEventListener('firstprinciple:evidence-tour', () => showTour(0));
  window.addEventListener('firstprinciple:report-ready', event => { serviceContext=event.detail; document.getElementById('services-nav').hidden=false; });
  window.addEventListener('firstprinciple:report-cleared', () => { serviceContext=null; document.getElementById('services-nav').hidden=true; });
  window.addEventListener('firstprinciple:advanced-services', event => {
    serviceContext=event.detail; servicesApi?.show(serviceContext); setView('services');
    document.getElementById('main-content').scrollIntoView({behavior:'instant',block:'start'}); document.getElementById('main-content').focus();
  });
  window.addEventListener('firstprinciple:back-to-report', () => { setView('map'); mapApi?.focusReport(); });
  document.getElementById('services-nav').addEventListener('click',()=>{if(serviceContext)servicesApi?.show(serviceContext);});
  document.getElementById('start-tour').addEventListener('click', () => { setView('map'); mapApi?.loadCase(); });
  document.getElementById('close-tour').addEventListener('click', () => { ui.tour = null; renderTour(); announce('Walkthrough closed. You can continue exploring.'); });
  document.getElementById('tour-prev').addEventListener('click', () => { if (ui.tour > 0) showTour(ui.tour - 1); });
  document.getElementById('tour-next').addEventListener('click', () => { if (ui.tour < tours.length - 1) showTour(ui.tour + 1); else { ui.tour = null; renderTour(); announce('The case walkthrough is complete.'); } });
  render();
  const mapRoot = document.getElementById('council-map-root');
  if (window.LynnCouncilMap && mapRoot) mapApi=window.LynnCouncilMap.mount(mapRoot);
  else if (mapRoot) mapRoot.textContent = 'The map component is unavailable. You can explore the case using the navigation or use the official NSW council finder.';
  if(window.FirstPrincipleServices)servicesApi=window.FirstPrincipleServices.mount(document.getElementById('advanced-services-root'));
})();
