'use strict';

const assert = require('assert');
const {
  scanStructuredValue,
  scanSecretMaterial
} = require('./validate-public-safety');

function expectStructuredBlocked(payload, pattern) {
  const errors = scanStructuredValue(payload, '$fixture');
  assert.ok(errors.some((message) => pattern.test(message)), 'expected structured safety block matching ' + pattern);
}

function expectSecretBlocked(value, pattern) {
  const errors = scanSecretMaterial(value, 'synthetic-fixture.txt');
  assert.ok(errors.some((message) => pattern.test(message)), 'expected secret-material block matching ' + pattern);
}

const safeResearchPayload = {
  hypothesis_id: 'OS-TH-0001',
  summary: 'This is a research hypothesis and does not recommend that any patient start, stop or change treatment.',
  experimental_context: 'A preclinical study reported an experimental dose of 10 mg/kg daily in an animal model.',
  ranking: { meaning: 'Research priority only; never expected patient benefit.' },
  review_state: { scientific_review_required: true },
  clinical_use: false
};
assert.deepStrictEqual(scanStructuredValue(safeResearchPayload, '$fixture'), []);

expectStructuredBlocked({ patient_name: 'Synthetic Example' }, /patient_name/);
expectStructuredBlocked({ nested: { medical_record_number: 'synthetic-only' } }, /medical_record_number/);
expectStructuredBlocked({ nested: { api_key: 'synthetic-only' } }, /api_key/);
expectStructuredBlocked({ nested: { client_id: 'synthetic-only' } }, /client_id/);
expectStructuredBlocked({ nested: { EDULINKED_APP_ID: 'synthetic-only' } }, /EDULINKED_APP_ID/);
expectStructuredBlocked({ nested: { ENTERPRISE_APP_PRIVATE_KEY: 'synthetic-only' } }, /ENTERPRISE_APP_PRIVATE_KEY/);
expectStructuredBlocked({ recommendation: 'The patient should start methotrexate.' }, /patient-directed treatment instruction/);
expectStructuredBlocked({ recommendation: 'For this patient, recommend switching to regimen X.' }, /patient-specific treatment recommendation/);
expectStructuredBlocked({ dosing: 'You should take 10 mg daily.' }, /patient-directed dosing instruction/);
expectStructuredBlocked({ claim: 'This treatment will benefit the patient.' }, /claim of individual patient benefit/);

expectSecretBlocked('prefix ' + '-----BEGIN ' + 'PRIVATE KEY-----' + ' suffix', /PEM private key/);
expectSecretBlocked('prefix ' + 'ghp_' + 'A'.repeat(30) + ' suffix', /GitHub access token/);
expectSecretBlocked('prefix ' + 'sk-' + 'A'.repeat(30) + ' suffix', /OpenAI-style API key/);
expectSecretBlocked('prefix ' + 'AKIA' + 'A'.repeat(16) + ' suffix', /AWS access key/);

assert.deepStrictEqual(scanSecretMaterial('No credential material is present here.', 'synthetic-fixture.txt'), []);

console.log('Public safety payload tests passed: prohibited fields, high-confidence credential material and patient-directed clinical language fail closed.');
