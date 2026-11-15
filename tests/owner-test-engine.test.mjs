import test from 'node:test';
import assert from 'node:assert/strict';
import engine from '../owner-test-engine.js';

function ready(id) {
  let state = engine.setProperty(engine.initialState(id), {});
  return engine.beginQuestions(state);
}
function answer(state, value) { return engine.applyAnswer(state, value); }

test('clear path defers B0 until after B3 and returns a preliminary reading', () => {
  let state = ready('clear-pathway');
  assert.equal(engine.questionFor(state).id, 'b3_area');
  state = answer(state, 'yes');
  assert.equal(engine.questionFor(state).id, 'b0_principal');
  state = answer(state, 'yes');
  assert.equal(state.stage, 'result');
  assert.equal(state.result.reading, 'Possibly, depending on the design');
});

test('B1 prohibited zone exits without asking later B0 questions', () => {
  let state = ready('b1-prohibited-zone');
  assert.equal(engine.questionFor(state).id, 'b1_zone');
  state = answer(state, 'prohibited');
  assert.equal(state.stage, 'result');
  assert.equal(state.history.some(item => item.questionId === 'b0_principal'), false);
  assert.equal(state.result.handoff, true);
});

test('B3 under 450 exits before B0', () => {
  let state = ready('b3-under-450');
  state = answer(state, 'no');
  assert.equal(state.result.reading, 'Not likely under the tested pathway');
  assert.equal(state.history.length, 1);
});

test('not_that_i_know remains unresolved and does not become clear', () => {
  let state = ready('clear-pathway');
  state = answer(state, 'yes');
  state = answer(state, 'not_that_i_know');
  assert.equal(state.result.reading, 'Possibly but needs further information');
  assert.equal(state.result.confidence, 'preliminary');
});

test('GIS 7 opens a required text follow-up for other structures', () => {
  let state = ready('other-structures');
  state = answer(state, 'yes');
  state = answer(state, 'yes');
  assert.equal(engine.questionFor(state).id, 'gis7_other');
  state = answer(state, 'yes');
  assert.equal(engine.questionFor(state).id, 'gis7_details');
  state = answer(state, 'Garage remains to be checked');
  assert.equal(state.result.reading, 'Possibly but needs further information');
});

test('material hazard remains a hold after protected-tree questions', () => {
  let state = ready('protected-trees-slope');
  state = answer(state, 'yes');
  state = answer(state, 'yes');
  state = answer(state, 'not_sure');
  state = answer(state, 'not_sure');
  assert.equal(state.result.confidence, 'held');
  assert.match(state.result.action, /professional/i);
});

test('B8/B9 tie and all-options-out produce distinct readings', () => {
  let state = ready('option-tie');
  state = answer(state, 'yes'); state = answer(state, 'yes'); state = answer(state, 'tie');
  assert.equal(state.result.reading, 'Possibly, depending on the design');
  state = ready('all-options-out');
  state = answer(state, 'yes'); state = answer(state, 'yes'); state = answer(state, 'all_out');
  assert.equal(state.result.reading, 'Not likely under the tested options');
});

test('editing an earlier answer clears later transitions and pause/resume preserves state', () => {
  let state = ready('clear-pathway');
  state = answer(state, 'yes'); state = answer(state, 'yes');
  state = engine.pause(state);
  assert.equal(state.stage, 'paused');
  state = engine.resume(state);
  assert.equal(state.stage, 'result');
  state = engine.editQuestion(state, 'b3_area');
  assert.equal(state.stage, 'questions');
  assert.equal(engine.questionFor(state).id, 'b3_area');
  assert.equal(state.history.length, 0);
});
