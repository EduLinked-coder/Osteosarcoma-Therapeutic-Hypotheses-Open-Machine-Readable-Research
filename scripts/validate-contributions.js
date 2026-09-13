'use strict';

const fs = require('fs');
const path = require('path');
const { validateJsonSchema } = require('./lib/schema-lite');

const root = process.cwd();
const schema = JSON.parse(fs.readFileSync(path.join(root, 'schemas/research-contribution.schema.json'), 'utf8'));
const idPattern = /^OS-CONTRIB-[0-9]{4}$/;
const finalStates = new Set(['ACCEPTED', 'REJECTED']);
const prohibitedKeys = new Set([
  'patient_name', 'patient_id', 'medical_record', 'medical_records', 'treatment_history',
  'clinical_notes', 'date_of_birth', 'dob', 'credential', 'credentials', 'token',
  'secret', 'secrets', 'private_key', 'api_key'
]);
let failed = false;
const seen = new Set();

function fail(message) {
  console.error('CONTRIBUTION VALIDATION FAILED: ' + message);
  failed = true;
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
  const object = JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
  const errors = validateJsonSchema(schema, schema, object, relativePath);
  errors.forEach(fail);
  scan(object, relativePath);

  if (!idPattern.test(object.contribution_id || '')) fail(relativePath + ' has invalid contribution_id.');
  if (seen.has(object.contribution_id)) fail(relativePath + ' duplicates contribution_id ' + object.contribution_id + '.');
  seen.add(object.contribution_id);

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
  if (object.example === true && object.state !== 'SUBMITTED') {
    fail(relativePath + ' example objects must remain SUBMITTED so examples cannot imply scientific acceptance.');
  }
}

const roots = ['examples/contributions', 'contributions'];
const files = [];
for (const relativeRoot of roots) {
  const dir = path.join(root, relativeRoot);
  if (!fs.existsSync(dir)) continue;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.json')) files.push(relativeRoot + '/' + entry.name);
  }
}

if (files.length === 0) fail('No research contribution examples or objects found.');
files.sort().forEach(validateFile);

if (failed) process.exitCode = 1;
else console.log('Research contribution validation passed for ' + files.length + ' object(s).');
