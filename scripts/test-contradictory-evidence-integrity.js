'use strict';

const assert = require('node:assert/strict');
const { validateContradictoryEvidenceIntegrity } = require('./lib/contradictory-evidence-integrity');

const item = { evidence_id: 'synthetic-evidence' };
const valid = [
  ['identified with evidence', { status: 'identified', items: [item] }],
  ['none-identified with no evidence', { status: 'none-identified', items: [] }],
  ['not-yet-assessed with no evidence', { status: 'not-yet-assessed', items: [] }]
];
for (const [name, state] of valid) {
  assert.deepEqual(validateContradictoryEvidenceIntegrity(state, name), [], name);
}

const invalid = [
  ['identified without evidence', { status: 'identified', items: [] }, /requires at least one/],
  ['none-identified with evidence', { status: 'none-identified', items: [item] }, /requires an empty items array/],
  ['not-yet-assessed with evidence', { status: 'not-yet-assessed', items: [item] }, /requires an empty items array/],
  ['unrecognised status', { status: 'unknown', items: [] }, /not supported/],
  ['missing items', { status: 'identified' }, /must be an array/],
  ['non-array items', { status: 'identified', items: {} }, /must be an array/],
  ['missing state', null, /not supported/]
];
for (const [name, state, message] of invalid) {
  const errors = validateContradictoryEvidenceIntegrity(state, name);
  assert.equal(errors.length, 1, name);
  assert.match(errors[0], message, name);
}

console.log('Contradictory-evidence state integrity fixtures passed: 3 valid, 7 invalid.');
