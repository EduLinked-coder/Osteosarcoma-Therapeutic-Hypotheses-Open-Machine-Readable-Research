'use strict';

const fs = require('fs');
const path = require('path');
const { validateJsonSchema } = require('./lib/schema-lite');
const { discoverContributionFiles, validateContributionObjectIdentity } = require('./lib/contribution-object-integrity');

const root = process.cwd();
const schema = JSON.parse(fs.readFileSync(path.join(root, 'schemas/research-contribution.schema.json'), 'utf8'));
const finalStates = new Set(['ACCEPTED', 'REJECTED']);
const expectedAcceptanceMeaning = 'Contribution state records repository review only; it does not establish clinical benefit, treatment guidance or patient-specific applicability.';
const prohibitedKeys = new Set([
  'patient_name', 'patient_id', 'medical_record', 'medical_records', 'treatment_history',
  'clinical_notes', 'date_of_birth', 'dob', 'credential', 'credentials', 'token',
  'secret', 'secrets', 'private_key', 'api_key'
]);
let failed = false;
const liveIds = new Set();
const exampleIds = new Set();

function fail(message) {
  console.error('CONTRIBUTION VALIDATION FAILED: ' + message);
  failed = true;
}

function validateAcceptanceBoundaryContract() {
  if (!Array.isArray(schema.required) || !schema.required.includes('acceptance_meaning')) {
    fail('Canonical contribution schema must require acceptance_meaning.');
  }
  if (schema.properties?.acceptance_meaning?.const !== expectedAcceptanceMeaning) {
    fail('Canonical contribution schema must preserve the governed acceptance_meaning statement exactly.');
  }
}

function scan(value, pointer) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scan(item, pointer + '[' + index + ']'));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (prohibitedKeys.has(key.toLowerCase())) fail(pointer + ' contains prohibited public field ' + key + '.');
    scan(child, pointer + '.' + key);
  }
}

function publicHttp(value) {
  try {
    const parsed = new URL(String(value));
    return ['http:', 'https:'].includes(parsed.protocol) && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

function validateFile(relativePath) {
  let object;
  try {
    object = JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
  } catch (error) {
    fail(relativePath + (error instanceof SyntaxError ? ' has invalid JSON syntax.' : ' is not readable as JSON.'));
    return;
  }
  if (!object || typeof object !== 'object' || Array.isArray(object)) {
    fail(relativePath + ' contribution must be a JSON object.');
    return;
  }
  const errors = validateJsonSchema(schema, schema, object, relativePath);
  errors.forEach(fail);
  scan(object, relativePath);

  for (const error of validateContributionObjectIdentity({ root, relativePath, object, liveIds, exampleIds })) fail(error);

  if (object.acceptance_meaning !== expectedAcceptanceMeaning) {
    fail(relativePath + ' must preserve the governed acceptance_meaning boundary exactly.');
  }
  if (object.clinical_use !== false) fail(relativePath + ' must explicitly set clinical_use:false.');
  if (object.review?.scientific_review_required !== true) fail(relativePath + ' must preserve scientific review.');
  for (const sourceRef of object.proposal?.source_refs || []) {
    if (!publicHttp(sourceRef)) fail(relativePath + ' source_refs must use public http(s) URLs.');
  }
  if (finalStates.has(object.state)) {
    if (!object.review?.decision_reference || !object.review?.reviewed_at) {
      fail(relativePath + ' final state requires an attributable review decision and reviewed_at timestamp.');
    }
  } else if (object.review?.reviewed_at && !object.review?.decision_reference) {
    fail(relativePath + ' reviewed_at requires a decision_reference.');
  }
}

validateAcceptanceBoundaryContract();

const { files, errors: discoveryErrors } = discoverContributionFiles(root);
discoveryErrors.forEach(fail);

if (files.length === 0) fail('No research contribution examples or objects found.');
files.sort().forEach(validateFile);

if (failed) process.exitCode = 1;
else console.log('Research contribution validation passed for ' + files.length + ' object(s), including the mandatory acceptance boundary.');
