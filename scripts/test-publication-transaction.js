'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { validateEvidenceBindingIdentity } = require('./lib/evidence-binding-integrity');
const {
  CONTRACT_ID,
  CONTRACT_VERSION,
  TARGET_REPOSITORY,
  PROJECTION_RENDER_PIPELINE,
  POST_STAGE_VALIDATION_PIPELINE,
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
const targetEvidenceBindingVersion = evidenceSchema.properties.evidence_binding_version.const;

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
      evidence_binding_schema: evidenceSchema.$id,
      evidence_binding_version: targetEvidenceBindingVersion
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

function rollbackFixture() {
  const envelope = fixture();
  const hypothesisId = 'OS-TH-9999';
  const evidenceId = 'SOURCE-SYNTHETIC-ROLLBACK';
  const h = envelope.public_projection.hypothesis;
  h.hypothesis_id = hypothesisId;
  h.provenance.generated_from = [evidenceId, 'synthetic rollback fixture'];
  h.supporting_evidence = [clone(h.supporting_evidence[0])];
  h.supporting_evidence[0].evidence_id = evidenceId;
  h.supporting_evidence[0].citation = 'Synthetic public-source rollback fixture for transaction testing';
  h.supporting_evidence[0].source_url = 'https://example.org/synthetic-rollback-evidence';
  delete h.supporting_evidence[0].pmid;
  delete h.supporting_evidence[0].doi;
  h.mechanism.relationships = [{
    subject: 'synthetic rollback subject',
    predicate: 'test-only',
    object: 'synthetic rollback object',
    evidence_refs: [evidenceId]
  }];
  h.contradictory_evidence.items = [];

  const binding = clone(evidenceBindings[0]);
  binding.evidence_id = evidenceId;
  binding.source_type = 'other-public-source';
  binding.canonical_source_url = 'https://example.org/synthetic-rollback-evidence';
  binding.citation = 'Synthetic public-source rollback fixture for transaction testing';
  binding.provenance.public_source = 'Synthetic CI-only public source';
  binding.provenance.binding_generated_for = hypothesisId;
  binding.acceptance_state = {
    status: 'candidate-public-evidence',
    meaning: 'Presence in this repository records a public evidence relationship; it does not establish accepted evidence or clinical benefit.',
    reviewed_at: null,
    review_note: 'Synthetic CI-only rollback fixture; not scientific evidence.'
  };
  delete binding.pmid;
  delete binding.doi;

  envelope.public_projection.evidence_bindings = [binding];
  envelope.source.object_ids = ['synthetic-object:' + hypothesisId];
  envelope.handoff_digest = computeHandoffDigest(envelope);
  return envelope;
}

function expectBlocked(callback, pattern) {
  assert.throws(callback, (error) => pattern.test(error.message), 'expected fail-closed transaction block matching ' + pattern);
}

assert.equal(CONTRACT_VERSION, '1.1.0');
const valid = fixture();
const result = validateHandoff(valid);
assert.equal(result.hypothesis.hypothesis_id, 'OS-TH-0001');
assert.equal(result.bindings.length, evidenceBindings.length);

assert.deepEqual(
  PROJECTION_RENDER_PIPELINE.map(({ script }) => script),
  [
    'scripts/render-public-research.js',
    'scripts/render-research-activity.js',
    'scripts/render-public-research.js',
    'scripts/render-structured-metadata.js',
    'scripts/render-machine-manifest.js'
  ]
);
const postStageValidationScripts = new Set(POST_STAGE_VALIDATION_PIPELINE.map(({ script }) => script));
for (const requiredScript of [
  'scripts/validate-schema.js',
  'scripts/render-public-research.js',
  'scripts/render-research-activity.js',
  'scripts/render-structured-metadata.js',
  'scripts/render-machine-manifest.js',
  'scripts/validate-evidence-events.js',
  'scripts/validate-lifecycle-bindings.js',
  'scripts/validate-evidence-context.js',
  'scripts/validate-evidence-relationship-consistency.js',
  'scripts/validate-search.js',
  'scripts/validate-public-interface.js',
  'scripts/validate-public-safety.js',
  'scripts/validate-public-research.js'
]) {
  assert(postStageValidationScripts.has(requiredScript), 'post-stage validation must include ' + requiredScript);
}

const legacyContract = fixture();
legacyContract.contract_version = '1.0.0';
delete legacyContract.target.evidence_binding_version;
legacyContract.handoff_digest = computeHandoffDigest(legacyContract);
assert.equal(validateHandoff(legacyContract).hypothesis.hypothesis_id, 'OS-TH-0001');

const missingTargetEvidenceVersion = fixture();
delete missingTargetEvidenceVersion.target.evidence_binding_version;
missingTargetEvidenceVersion.handoff_digest = computeHandoffDigest(missingTargetEvidenceVersion);
expectBlocked(() => validateHandoff(missingTargetEvidenceVersion), /target evidence binding version mismatch/);

const mismatchedTargetEvidenceVersion = fixture();
mismatchedTargetEvidenceVersion.target.evidence_binding_version = '1.0.0';
mismatchedTargetEvidenceVersion.handoff_digest = computeHandoffDigest(mismatchedTargetEvidenceVersion);
expectBlocked(() => validateHandoff(mismatchedTargetEvidenceVersion), /target evidence binding version mismatch/);

const unsupportedContract = fixture();
unsupportedContract.contract_version = '2.0.0';
unsupportedContract.handoff_digest = computeHandoffDigest(unsupportedContract);
expectBlocked(() => validateHandoff(unsupportedContract), /unsupported handoff contract version/);

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

const missingEvidenceContext = fixture();
delete missingEvidenceContext.public_projection.evidence_bindings[0].evidence_context;
missingEvidenceContext.handoff_digest = computeHandoffDigest(missingEvidenceContext);
expectBlocked(() => validateHandoff(missingEvidenceContext), /public evidence schema failed.*evidence_context/i);

const inventedEvidenceContext = fixture();
inventedEvidenceContext.public_projection.evidence_bindings[0].evidence_context.experimental_model = {
  status: 'not-yet-assessed',
  value: 'synthetic inferred model that must not be accepted'
};
inventedEvidenceContext.handoff_digest = computeHandoffDigest(inventedEvidenceContext);
expectBlocked(() => validateHandoff(inventedEvidenceContext), /public evidence context validation failed.*value must be null unless status is reported/i);

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

const rollback = rollbackFixture();
const rollbackHypothesisDir = path.join(root, 'hypotheses', rollback.public_projection.hypothesis.hypothesis_id);
const rollbackEvidencePath = path.join(root, 'evidence-bindings', rollback.public_projection.evidence_bindings[0].evidence_id + '.json');
assert.equal(fs.existsSync(rollbackHypothesisDir), false, 'synthetic rollback hypothesis must not exist before the test');
assert.equal(fs.existsSync(rollbackEvidencePath), false, 'synthetic rollback evidence must not exist before the test');
expectBlocked(
  () => stageHandoff(rollback, {
    executePipeline: () => { throw new Error('synthetic post-stage failure'); },
    restoreProjections: () => {}
  }),
  /post-stage rendering or validation failed; candidate staging was rolled back: synthetic post-stage failure/i
);
assert.equal(fs.existsSync(rollbackHypothesisDir), false, 'failed staging must remove the new hypothesis directory');
assert.equal(fs.existsSync(rollbackEvidencePath), false, 'failed staging must remove newly created evidence files');

console.log('Publication transaction tests passed: v1.1/current-target compatibility, bounded v1.0 fallback, integrity, authority, clinical-use, public-safety, explicit evidence-context, canonical evidence-identity/reference, full projection/validation coverage, transactional rollback and overwrite gates fail closed.');
