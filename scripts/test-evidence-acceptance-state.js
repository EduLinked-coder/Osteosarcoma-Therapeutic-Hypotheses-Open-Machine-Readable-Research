'use strict';

const fs = require('fs');
const path = require('path');
const { validateJsonSchema } = require('./lib/schema-lite');

const root = process.cwd();
const schema = JSON.parse(fs.readFileSync(path.join(root, 'schemas/evidence-binding.schema.json'), 'utf8'));
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'evidence-bindings/PMID-42574989.json'), 'utf8'));

const expectValid = (value, label) => {
  const errors = validateJsonSchema(schema, schema, value, label);
  if (errors.length) throw new Error(label + ' should be valid: ' + errors.join(' | '));
};

const expectInvalid = (value, expectedFragment, label) => {
  const errors = validateJsonSchema(schema, schema, value, label);
  if (!errors.some((error) => error.includes(expectedFragment))) {
    throw new Error(label + ' should fail with ' + JSON.stringify(expectedFragment) + '; got: ' + errors.join(' | '));
  }
};

expectValid(fixture, 'current public evidence binding');

const missingAcceptanceState = structuredClone(fixture);
delete missingAcceptanceState.acceptance_state;
expectInvalid(
  missingAcceptanceState,
  'missing required property acceptance_state',
  'binding without acceptance state'
);

const missingAcceptanceMeaning = structuredClone(fixture);
delete missingAcceptanceMeaning.acceptance_state.meaning;
expectInvalid(
  missingAcceptanceMeaning,
  'missing required property meaning',
  'acceptance state without boundary meaning'
);

const weakenedMeaning = structuredClone(fixture);
weakenedMeaning.acceptance_state.meaning = 'Evidence is accepted.';
expectInvalid(
  weakenedMeaning,
  'must equal',
  'acceptance state with weakened meaning'
);

console.log('Evidence acceptance-state schema fixtures passed.');
