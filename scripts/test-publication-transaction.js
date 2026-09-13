'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { validateEvidenceBindingIdentity } = require('./lib/evidence-binding-integrity');
const {
  CONTRACT_ID,
  CONTRACT_VERSION,
  TARGET_REPOSITORY,
  computeHandoffDigest,
  validateHandoff,
  stageHandoff
} = require('./publication-transaction');

const root = process.cwd();
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));

const hypothesis = readJson('hypotheses/OS-TH-0001/hypothesis.json');
const evidenceIds = [
  ...(hypothesis.supporting_evidence || []).map((item) => item.evidence_id),
  ...((hypothesis.contradictory_evidence || {}).items || []).map((item) => item.evidence_id),
  ...(hypothesis.mechanism?.relationships || []).flatMap((relationship) => relationship.evidence_refs || [])
].filter(Boolean);
const evidenceBindings = [...new Set(evidenceIds)].sort().map((id) => readJson('evidence-bindings/' + id + '.json'));
const hypothesisSchema = readJson('schemas/therapeutic-hypothesis.schema.json');
const evidenceSchema = readJson('schemas/evidence-binding.schema.json');

function fixture() {
  const envelope = {
    contract_id: CONTRACT_ID,
    contract_version: CONTRACT_VERSION,
    source: {
      repository: 'synthetic/test-source',
      revision: 'a'.repeat(40),
      report_digest: 'b'.repeat(64),
      object_ids: ['synthetic-object:OS-TH-0001']
    },
    target: {
      repository: TARGET_REPOSITORY,
      hypothesis_schema: hypothesisSchema.$id,
      evidence_binding_schema: evidenceSchema.$id
    },
    authority: {
      disclosure_authorised: true,
      disclosure_authority_reference: 'synthetic-authority:test-only',
      scientific_review_required: true,
      may_publish: false,
      meaning: 'Synthetic CI fixture only; this does not assert real disclosure or publication authority.'
    },
    public_projection: {
      hypothesis: clone(hypothesis),
      evidence_bindings: clone(evidenceBindings)
    }
  };
  envelope.handoff_digest = computeHandoffDigest(envelope);
  return envelope;
}

function expectBlocked(callback, pattern) {
  assert.throws(callback, (error) => pattern.test(error.message), 'expected fail-closed transaction block matching ' + pattern);
}

const valid = fixture();
const result = validateHandoff(valid);
assert.equal(result.hypothesis.hypothesis_id, 'OS-TH-0001');
assert.equal(result.bindings.length, evidenceBindings.length);

for (const binding of evidenceBindings) {
  assert.deepEqual(validateEvidenceBindingIdentity(binding, 'fixture'), []);
}

const digestTamper = fixture();
digestTamper.public_projection.hypothesis.title += ' tampered';
expectBlocked(() => validateHandoff(digestTamper), /digest does not match/);

const publishAuthority = fixture();
publishAuthority.authority.may_publish = true;
publishAuthority.handoff_digest = computeHandoffDigest(publishAuthority);
expectBlocked(() => validateHandoff(publishAuthority), /must not transfer publication authority/);

const clinicalUse = fixture();
clinicalUse.public_projection.hypothesis.clinical_use = true;
clinicalUse.handoff_digest = computeHandoffDigest(clinicalUse);
expectBlocked(() => validateHandoff(clinicalUse), /schema failed|clinical_use:false/);

const prohibitedField = fixture();
prohibitedField.public_projection.hypothesis.client_id = 'synthetic-variable-name-only';
prohibitedField.handoff_digest = computeHandoffDigest(prohibitedField);
expectBlocked(() => validateHandoff(prohibitedField), /public projection safety validation failed.*prohibited public field name/i);

const credentialMaterial = fixture();
credentialMaterial.public_projection.hypothesis.title += ' sk-proj-' + 'A'.repeat(24);
credentialMaterial.handoff_digest = computeHandoffDigest(credentialMaterial);
expectBlocked(() => validateHandoff(credentialMaterial), /public projection safety validation failed.*OpenAI-style API key material/i);

const mismatchedPmid = fixture();
mismatchedPmid.public_projection.evidence_bindings[0].pmid = '99999999';
mismatchedPmid.handoff_digest = computeHandoffDigest(mismatchedPmid);
expectBlocked(() => validateHandoff(mismatchedPmid), /public evidence identity validation failed.*pmid must exactly match/i);

const missingMechanismBinding = fixture();
missingMechanismBinding.public_projection.hypothesis.mechanism.relationships[0].evidence_refs = ['SOURCE-MISSING-MECHANISM'];
missingMechanismBinding.handoff_digest = computeHandoffDigest(missingMechanismBinding);
expectBlocked(() => validateHandoff(missingMechanismBinding), /hypothesis references evidence missing from handoff: SOURCE-MISSING-MECHANISM/i);

const unsafeEvidenceId = clone(evidenceBindings[0]);
unsafeEvidenceId.evidence_id = 'DOI-10.1000/example/../../outside';
unsafeEvidenceId.doi = '10.1000/example/../../outside';
assert.match(validateEvidenceBindingIdentity(unsafeEvidenceId, 'fixture').join(' | '), /path-safe stable identifier/i);

const validDoi = clone(evidenceBindings[0]);
validDoi.evidence_id = 'DOI-' + encodeURIComponent('10.1000/example*part');
validDoi.source_type = 'doi';
validDoi.doi = '10.1000/example*part';
validDoi.canonical_source_url = 'https://doi.org/10.1000/example*part';
delete validDoi.pmid;
assert.deepEqual(validateEvidenceBindingIdentity(validDoi, 'fixture'), []);

const nonCanonicalDoi = clone(validDoi);
nonCanonicalDoi.evidence_id = 'DOI-10.1000%2fexample*part';
assert.match(validateEvidenceBindingIdentity(nonCanonicalDoi, 'fixture').join(' | '), /encodeURIComponent\(lowercase doi\) exactly/i);

const mismatchedDoiUrl = clone(validDoi);
mismatchedDoiUrl.canonical_source_url = 'https://doi.org/10.1000/different';
assert.match(validateEvidenceBindingIdentity(mismatchedDoiUrl, 'fixture').join(' | '), /canonical_source_url must resolve the same DOI/i);

expectBlocked(() => stageHandoff(fixture()), /already exists/);

console.log('Publication transaction tests passed: integrity, authority, clinical-use, public-safety, canonical evidence-identity/reference and overwrite gates fail closed.');
