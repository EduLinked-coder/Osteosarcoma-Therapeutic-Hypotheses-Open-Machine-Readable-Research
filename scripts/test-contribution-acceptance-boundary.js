'use strict';

const fs = require('fs');
const path = require('path');
const { validateJsonSchema } = require('./lib/schema-lite');

const root = process.cwd();
const schema = JSON.parse(fs.readFileSync(path.join(root, 'schemas/research-contribution.schema.json'), 'utf8'));
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'examples/contributions/submitted.example.json'), 'utf8'));

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

expectValid(fixture, 'current submitted contribution example');

const missingAcceptanceMeaning = structuredClone(fixture);
delete missingAcceptanceMeaning.acceptance_meaning;
expectInvalid(
  missingAcceptanceMeaning,
  'missing required property acceptance_meaning',
  'contribution without acceptance boundary'
);

const weakenedAcceptanceMeaning = structuredClone(fixture);
weakenedAcceptanceMeaning.acceptance_meaning = 'Contribution is accepted scientific evidence.';
expectInvalid(
  weakenedAcceptanceMeaning,
  'must equal',
  'contribution with weakened acceptance boundary'
);

console.log('Contribution acceptance-boundary schema fixtures passed.');
