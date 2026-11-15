/* Deterministic synthetic journey adapter for the owner-only website test.
 * It contains reviewed interaction examples, not the private planning Runner.
 */
(function (scope) {
  'use strict';

  const ANSWERS = Object.freeze(['yes', 'no', 'not_sure', 'not_that_i_know']);
  const SCENARIOS = Object.freeze([
    {id: 'clear-pathway', title: 'Clear preliminary pathway', summary: 'B3 and B0 are answered without a material hold.', category: 'reading'},
    {id: 'b1-prohibited-zone', title: 'B1 prohibited-zone early exit', summary: 'A prohibited residential zone stops the tested pathway.', category: 'early_exit'},
    {id: 'b3-under-450', title: 'B3 under 450 m² early exit', summary: 'The tested lot-area threshold is not met.', category: 'early_exit'},
    {id: 'missing-site-plan', title: 'Missing site plan', summary: 'The screening continues, but geometry cannot be established.', category: 'evidence'},
    {id: 'other-structures', title: 'Other structures unresolved', summary: 'GIS 7 asks a conditional follow-up about other structures.', category: 'follow_up'},
    {id: 'protected-trees-slope', title: 'Protected trees or slope hazard hold', summary: 'A material hazard remains on hold for professional review.', category: 'hold'},
    {id: 'option-tie', title: 'Multiple design options with a tie', summary: 'Two tested ground-level options remain equally ranked.', category: 'options'},
    {id: 'all-options-out', title: 'All tested ground-level options ruled out', summary: 'Every tested option is ruled out by the synthetic facts.', category: 'options'},
    {id: 'interrupted-restored', title: 'Interrupted assessment restored', summary: 'A paused clear-pathway journey can be resumed from saved state.', category: 'resume'}
  ]);

  const QUESTIONS = Object.freeze({
    b1_zone: {id: 'b1_zone', node: 'B1', wording: 'Is the selected synthetic property in a zone where a dwelling house is permitted?', help: 'This is a synthetic zoning fact. It does not evaluate a real address.', type: 'choice', options: ['residential', 'prohibited', 'not_sure']},
    b3_area: {id: 'b3_area', node: 'B3', wording: 'Is the synthetic lot at least 450 m²?', help: 'Answer from the scenario card. A real lot-area check needs authoritative property evidence.', type: 'choice', options: ['yes', 'no', 'not_sure']},
    b0_principal: {id: 'b0_principal', node: 'B0', wording: 'Is there an existing principal dwelling on the same lot?', help: 'This question is deliberately deferred until after the B3 check.', type: 'choice', options: ANSWERS},
    gis7_other: {id: 'gis7_other', node: 'GIS 7', wording: 'Are there other structures on the synthetic site that need to be considered?', help: 'A yes or not-sure answer opens a short evidence follow-up.', type: 'choice', options: ANSWERS},
    gis7_details: {id: 'gis7_details', node: 'GIS 7', wording: 'Briefly describe the other structure or what remains unknown.', help: 'Do not enter private property information in this synthetic test.', type: 'text', options: []},
    site_plan: {id: 'site_plan', node: 'P2', wording: 'Is a site plan available for the synthetic scenario?', help: 'A selected PDF is still only a local document until its text and page status are reviewed.', type: 'choice', options: ['yes', 'no', 'not_sure']},
    hz10_trees: {id: 'hz10_trees', node: 'HZ10', wording: 'Could protected trees affect the tested placement?', help: 'This is a synthetic hazard prompt and does not inspect a real tree register.', type: 'choice', options: ANSWERS},
    hz08_slope: {id: 'hz08_slope', node: 'HZ08', wording: 'Has slope or another material hazard been independently checked?', help: 'An unresolved material hazard keeps the preliminary result on hold.', type: 'choice', options: ['yes', 'not_sure', 'not_that_i_know']},
    b8_geometry: {id: 'b8_geometry', node: 'B8/B9', wording: 'What does the synthetic geometry comparison show?', help: 'The comparison is dimension-only and cannot replace a measured plan.', type: 'choice', options: ['clear_option', 'tie', 'all_out', 'not_sure']}
  });

  const RESULT_TEMPLATES = Object.freeze({
    clear: {reading: 'Possibly, depending on the design', confidence: 'evidence_based', explanation: 'The synthetic B3 and B0 answers leave a preliminary pathway open for a secondary dwelling.', reasons: ['The scenario records a qualifying lot-area answer.', 'A principal dwelling answer is available for the tested pathway.'], limitations: ['This is a synthetic scenario; no real address, title, plan or live planning source was assessed.'], action: 'Have a planner or certifier check the real lot, controls and proposed design before relying on this pathway.', handoff: false},
    b1: {reading: 'Not likely under the tested pathway', confidence: 'evidence_based', explanation: 'The synthetic B1 answer stops this tested residential pathway at the zoning gate.', reasons: ['The scenario marks the tested zone as prohibited for a dwelling house.'], limitations: ['The synthetic zone is not a real property finding.'], action: 'Confirm the applicable zone and permitted uses with the responsible planning professional.', handoff: true},
    b1_unknown: {reading: 'Possibly but needs further information', confidence: 'preliminary', explanation: 'The screening cannot treat the synthetic zoning fact as clear while the permitted-use answer is uncertain.', reasons: ['The B1 zoning answer remains unresolved.'], limitations: ['The applicable zone and permitted uses were not checked for a real property.'], action: 'Confirm the real zone and permitted dwelling-house uses with a planning professional.', handoff: true},
    b3: {reading: 'Not likely under the tested pathway', confidence: 'evidence_based', explanation: 'The synthetic B3 answer is below the tested 450 m² threshold.', reasons: ['The scenario lot-area answer is under 450 m².'], limitations: ['The threshold example is not a real lot-area determination.'], action: 'Obtain authoritative lot-area and lot-configuration evidence before choosing a design.', handoff: true},
    b3_unknown: {reading: 'Possibly but needs further information', confidence: 'preliminary', explanation: 'The screening can continue, but the lot-area fact remains unresolved.', reasons: ['The customer selected an uncertain B3 answer.'], limitations: ['Lot area and applicable standards are not checked.'], action: 'Provide authoritative lot-area evidence for professional review.', handoff: true},
    plan: {reading: 'Possibly but needs further information', confidence: 'preliminary', explanation: 'Independent screening steps remain open, but the tested geometry cannot be established without a site plan.', reasons: ['The required site plan is unavailable or uncertain.'], limitations: ['No site boundaries, setbacks or measured placement were verified.'], action: 'Provide a site plan showing boundaries, existing structures and dimensions.', handoff: false},
    structures: {reading: 'Possibly but needs further information', confidence: 'preliminary', explanation: 'The screening can continue, while other structures remain unresolved for the tested site.', reasons: ['GIS 7 opened a conditional follow-up.', 'The answer needs site evidence or professional confirmation.'], limitations: ['Other structures, approvals and setbacks are not verified.'], action: 'List the other structures on a current site plan and ask a planner or certifier to review them.', handoff: true},
    hazard: {reading: 'Possibly but needs further information', confidence: 'held', explanation: 'A material hazard remains unresolved, so the preliminary pathway is held for professional review.', reasons: ['HZ08 requires an independent hazard check before a stronger reading.'], limitations: ['Slope and protected-tree constraints are not checked in this synthetic journey.'], action: 'Arrange a professional hazard and site review before relying on the screening result.', handoff: true},
    tie: {reading: 'Possibly, depending on the design', confidence: 'preliminary', explanation: 'Two synthetic ground-level options remain equally ranked after the dimension-only comparison.', reasons: ['O2 and O4 remain open with the same rank.', 'The comparison does not choose a preferred design.'], limitations: ['The geometry is representative only and does not establish a buildable envelope.'], action: 'Compare the open items for both options with a measured site plan and professional review.', handoff: true},
    geometry_clear: {reading: 'Possibly, depending on the design', confidence: 'preliminary', explanation: 'The synthetic geometry comparison leaves one tested option open.', reasons: ['The comparison marks one tested option as open.'], limitations: ['The geometry is representative only and does not establish a buildable envelope.'], action: 'Check the open option against a measured site plan and professional review.', handoff: true},
    geometry_unknown: {reading: 'Possibly but needs further information', confidence: 'preliminary', explanation: 'The synthetic geometry comparison is unresolved, so the screening cannot select a clear option.', reasons: ['The B8/B9 geometry answer remains uncertain.'], limitations: ['The geometry and buildable envelope were not verified.'], action: 'Provide a measured site plan for a professional comparison of the available options.', handoff: true},
    all_out: {reading: 'Not likely under the tested options', confidence: 'evidence_based', explanation: 'All synthetic ground-level options tested in this scenario are ruled out by the supplied constraints.', reasons: ['The B9 comparison marks every tested option as ruled out.'], limitations: ['Only the named synthetic options were tested; this is not a determination about all designs.'], action: 'Ask a professional to test a revised design or confirm whether another pathway is available.', handoff: true}
  });

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function cleanAnswer(value) { return typeof value === 'string' ? value.trim().slice(0, 400) : ''; }
  function initialState(scenarioId = 'clear-pathway') {
    const scenario = SCENARIOS.find(item => item.id === scenarioId) || SCENARIOS[0];
    return {version: 1, sessionId: null, scenarioId: scenario.id, stage: 'property', paused: false, property: null, answers: {}, history: [], result: null, savedAt: null};
  }
  function scenario(state) { return SCENARIOS.find(item => item.id === state?.scenarioId) || SCENARIOS[0]; }
  function questionFor(state) {
    if (!state || state.paused || state.result || state.stage === 'property' || state.stage === 'enquiry' || state.stage === 'evidence') return null;
    const id = state.scenarioId;
    if (id === 'b1-prohibited-zone') {
      if (!state.answers.b1_zone) return QUESTIONS.b1_zone;
      if (state.answers.b1_zone === 'prohibited' || state.answers.b1_zone === 'not_sure') return null;
    }
    if (!state.answers.b3_area) return QUESTIONS.b3_area;
    if (state.answers.b3_area === 'no') return null;
    if (state.answers.b3_area === 'not_sure') return null;
    if (!state.answers.b0_principal) return QUESTIONS.b0_principal;
    if (id === 'other-structures') {
      if (!state.answers.gis7_other) return QUESTIONS.gis7_other;
      if (['yes', 'not_sure', 'not_that_i_know'].includes(state.answers.gis7_other) && !state.answers.gis7_details) return QUESTIONS.gis7_details;
    }
    if (id === 'missing-site-plan' && !state.answers.site_plan) return QUESTIONS.site_plan;
    if (id === 'protected-trees-slope') {
      if (!state.answers.hz10_trees) return QUESTIONS.hz10_trees;
      if (!state.answers.hz08_slope) return QUESTIONS.hz08_slope;
    }
    if (['option-tie', 'all-options-out'].includes(id) && !state.answers.b8_geometry) return QUESTIONS.b8_geometry;
    return null;
  }
  function resultFor(state) {
    const id = state.scenarioId;
    if (id === 'b1-prohibited-zone') {
      if (state.answers.b1_zone === 'prohibited') return RESULT_TEMPLATES.b1;
      if (state.answers.b1_zone === 'not_sure') return RESULT_TEMPLATES.b1_unknown;
    }
    if (state.answers.b3_area === 'no') return RESULT_TEMPLATES.b3;
    if (state.answers.b3_area === 'not_sure') return RESULT_TEMPLATES.b3_unknown;
    if (id === 'missing-site-plan' && state.answers.site_plan !== 'yes') return RESULT_TEMPLATES.plan;
    if (id === 'other-structures' && ['yes', 'not_sure', 'not_that_i_know'].includes(state.answers.gis7_other)) return RESULT_TEMPLATES.structures;
    if (id === 'protected-trees-slope') return RESULT_TEMPLATES.hazard;
    if (['option-tie', 'all-options-out'].includes(id)) {
      if (state.answers.b8_geometry === 'all_out') return RESULT_TEMPLATES.all_out;
      if (state.answers.b8_geometry === 'tie') return RESULT_TEMPLATES.tie;
      if (state.answers.b8_geometry === 'clear_option') return RESULT_TEMPLATES.geometry_clear;
      return RESULT_TEMPLATES.geometry_unknown;
    }
    if (state.answers.b0_principal === 'not_that_i_know' || state.answers.b0_principal === 'not_sure') return RESULT_TEMPLATES.plan;
    return RESULT_TEMPLATES.clear;
  }
  function beginQuestions(state) {
    const next = clone(state); next.stage = 'questions'; next.paused = false; next.result = null; return next;
  }
  function applyAnswer(state, value) {
    const next = clone(state), question = questionFor(next), answer = cleanAnswer(value);
    if (!question) throw new Error('There is no pending question to answer.');
    if (question.type === 'text' && answer.length < 3) throw new Error('Add a short description or say what remains unknown.');
    if (question.type === 'choice' && !question.options.includes(answer)) throw new Error('Choose one of the available answers.');
    next.answers[question.id] = answer;
    next.history.push({questionId: question.id, node: question.node, answer, sequence: next.history.length + 1});
    if (!questionFor(next)) { next.result = clone(resultFor(next)); next.stage = 'result'; }
    return next;
  }
  function editQuestion(state, questionId) {
    const next = clone(state), index = next.history.findIndex(item => item.questionId === questionId);
    if (index < 0) throw new Error('That question is not in this assessment.');
    next.history = next.history.slice(0, index); next.answers = {};
    next.history.forEach(item => { next.answers[item.questionId] = item.answer; });
    delete next.result; next.result = null; next.stage = 'questions'; next.paused = false; return next;
  }
  function pause(state) { const next = clone(state); next.paused = true; next.stage = 'paused'; return next; }
  function resume(state) { const next = clone(state); next.paused = false; next.stage = next.result ? 'result' : 'questions'; return next; }
  function setProperty(state, property = {}) {
    const next = clone(state);
    const requestedScenario = typeof property.scenarioId === 'string' && SCENARIOS.some(item => item.id === property.scenarioId)
      ? property.scenarioId : next.scenarioId;
    next.scenarioId = requestedScenario;
    next.property = {kind: 'synthetic', id: 'OWNER-SYNTHETIC-001', label: 'Synthetic owner test property', address: 'Synthetic property · Hawkesbury (no real address)', lot: 'Lot 1 / DP-SYNTHETIC', scenarioId: requestedScenario};
    next.stage = 'enquiry';
    return next;
  }
  function toJSON(state) { return clone(state); }

  const api = Object.freeze({ANSWERS, QUESTIONS, RESULT_TEMPLATES, SCENARIOS, initialState, scenario, questionFor, resultFor, beginQuestions, applyAnswer, editQuestion, pause, resume, setProperty, toJSON});
  scope.FirstPrincipleOwnerTestEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
