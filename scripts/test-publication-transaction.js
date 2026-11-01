'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
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

const accessibilityMeaning = 'Accessibility projections derive from the canonical hypothesis object and do not add scientific facts or claim independent certification.';

function addCompleteCandidateContract(h) {
  h.disease_context = {
    disease: 'osteosarcoma',
    status: 'not-yet-assessed',
    context: null
  };
  h.research_classification = 'therapeutic-hypothesis';
  h.ranking.explanation = 'No numeric research-priority score is assigned while ranking is pending recalculation; this state does not imply expected patient benefit.';
  h.novelty.confidence = 'unverified';
  h.accessibility = {
    plain_language_summary: 'canonical',
    easy_read_projection: 'hypotheses/' + h.hypothesis_id + '/easy-read/',
    projection_status: 'generated',
    meaning: accessibilityMeaning
  };
  return h;
}

function fixture() {
  const publicHypothesis = addCompleteCandidateContract(clone(hypothesis));
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
      hypothesis: publicHypothesis,
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
  h.accessibility.easy_read_projection = 'hypotheses/' + hypothesisId + '/easy-read/';
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
 
// The publication handoff and public contribution intake must share the same
// public-source URL boundary. Only synthetic candidate objects are used here.
const publicSourceUrlCases = [
  ['https://pubmed.ncbi.nlm.nih.gov/25112408/', true],
  ['https://doi.org/10.1186/1746-1596-9-140', true],
  ['https://pubmed.ncbi.nlm.nih.gov/25112408/#findings', true],
  ['http://www.example.org/findings?pmid=25112408', true],
  ['https://pubmed.ncbi.nlm.nih.gov/?pmid=25112408&note=source%20metadata', true],
  ['https://pubmed.ncbi.nlm.nih.gov/#section%20two', true],
  ['https://alice:sample@pubmed.ncbi.nlm.nih.gov/25112408', false],
  ['https://@example.org/evidence', false],
  ['https://pubmed.ncbi.nlm.nih.gov/?access_token=sample', false],
  ['https://pubmed.ncbi.nlm.nih.gov/#api_key=sample', false],
  ['https://pubmed.ncbi.nlm.nih.gov/#section&access_token=sample', false],
  ['https://pubmed.ncbi.nlm.nih.gov/#/view?api_key=sample', false],
  ['https://pubmed.ncbi.nlm.nih.gov/#token%3Dsample', false],
  ['https://pubmed.ncbi.nlm.nih.gov/?pmid=25112408;access_token=synthetic', false],
  ['https://pubmed.ncbi.nlm.nih.gov/?pmid=25112408%26api_key%3Dsynthetic', false],
  ['https://pubmed.ncbi.nlm.nih.gov/?access%255Ftoken=synthetic', false],
  ['https://pubmed.ncbi.nlm.nih.gov/#section%2526access_token%253Dsynthetic', false],
  ['https://pubmed.ncbi.nlm.nih.gov/#section%252526access_token%25253Dsynthetic', false],
  ['https://pubmed.ncbi.nlm.nih.gov/#section%ZZ', false],
  ['http://127.0.0.1/evidence', false],
  ['http://127.1/evidence', false],
  ['http://[::1]/evidence', false],
  ['https://localhost/evidence', false],
  ['https://source.internal/evidence', false],
  ['https://host.home.arpa/evidence', false],
  ['ftp://pubmed.ncbi.nlm.nih.gov/evidence', false]
];
for (const [canonicalSourceUrl, allowed] of publicSourceUrlCases) {
  const candidate = rollbackFixture();
  candidate.public_projection.evidence_bindings[0].canonical_source_url = canonicalSourceUrl;
  candidate.handoff_digest = computeHandoffDigest(candidate);
  if (allowed) {
    assert.equal(validateHandoff(candidate).hypothesis.hypothesis_id, 'OS-TH-9999');
  } else {
    expectBlocked(
      () => validateHandoff(candidate),
      /canonical source must use a public http\(s\) URL without embedded credentials or non-public hosts/
    );
  }
}


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

const missingDiseaseContext = fixture();
delete missingDiseaseContext.public_projection.hypothesis.disease_context;
missingDiseaseContext.handoff_digest = computeHandoffDigest(missingDiseaseContext);
expectBlocked(() => validateHandoff(missingDiseaseContext), /explicitly preserve disease context/);

const missingResearchClassification = fixture();
delete missingResearchClassification.public_projection.hypothesis.research_classification;
missingResearchClassification.handoff_digest = computeHandoffDigest(missingResearchClassification);
expectBlocked(() => validateHandoff(missingResearchClassification), /explicitly set research classification/);

const missingRankingExplanation = fixture();
delete missingRankingExplanation.public_projection.hypothesis.ranking.explanation;
missingRankingExplanation.handoff_digest = computeHandoffDigest(missingRankingExplanation);
expectBlocked(() => validateHandoff(missingRankingExplanation), /explain its research-priority ranking state/);

const missingNoveltyConfidence = fixture();
delete missingNoveltyConfidence.public_projection.hypothesis.novelty.confidence;
missingNoveltyConfidence.handoff_digest = computeHandoffDigest(missingNoveltyConfidence);
expectBlocked(() => validateHandoff(missingNoveltyConfidence), /explicitly preserve novelty confidence/);

const missingAccessibility = fixture();
delete missingAccessibility.public_projection.hypothesis.accessibility;
missingAccessibility.handoff_digest = computeHandoffDigest(missingAccessibility);
expectBlocked(() => validateHandoff(missingAccessibility), /include accessibility projection metadata/);

const mismatchedAccessibilityPath = fixture();
mismatchedAccessibilityPath.public_projection.hypothesis.accessibility.easy_read_projection = 'hypotheses/OS-TH-9999/easy-read/';
mismatchedAccessibilityPath.handoff_digest = computeHandoffDigest(mismatchedAccessibilityPath);
expectBlocked(() => validateHandoff(mismatchedAccessibilityPath), /bind to its stable Easy Read projection/);

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

// Pre-existing material under an unused ID must never be deleted by rollback.
fs.mkdirSync(rollbackHypothesisDir);
const occupiedMarker = path.join(rollbackHypothesisDir, 'preexisting-note.txt');
fs.writeFileSync(occupiedMarker, 'synthetic pre-existing content', 'utf8');
try {
  expectBlocked(() => stageHandoff(rollback, {
    executePipeline: () => { throw new Error('occupied directory entered pipeline'); },
    restoreProjections: () => {}
  }), /directory already exists; refusing to modify or remove/);
  assert.equal(fs.readFileSync(occupiedMarker, 'utf8'), 'synthetic pre-existing content');
  assert.equal(fs.existsSync(rollbackEvidencePath), false);
} finally {
  fs.rmSync(rollbackHypothesisDir, { recursive: true, force: true });
}

// A dangling evidence-file symlink must not redirect a new binding write outside the checkout.
const outsideFixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'osteosarcoma-symlink-evidence-'));
const outsideEvidencePath = path.join(outsideFixtureDir, 'outside-evidence.json');
fs.symlinkSync(outsideEvidencePath, rollbackEvidencePath);
try {
  expectBlocked(() => stageHandoff(rollback, {
    executePipeline: () => { throw new Error('symlink evidence entered pipeline'); },
    restoreProjections: () => {}
  }), /not a regular file; symbolic links are blocked/);
  assert.equal(fs.existsSync(outsideEvidencePath), false, 'out-of-repository evidence destination must not be written');
  assert.equal(fs.existsSync(rollbackHypothesisDir), false, 'symlink must block before hypothesis creation');
} finally {
  fs.rmSync(rollbackEvidencePath, { force: true });
  fs.rmSync(outsideFixtureDir, { recursive: true, force: true });
}
// Partial writes must roll back owned files before any rendering begins.
function assertPartialWriteRollback(failAt) {
  const originalWrite = fs.writeFileSync;
  let writeCount = 0;
  let pipelineCalls = 0;
  let restorationCalls = 0;
  fs.writeFileSync = (file, ...args) => {
    if (typeof file === 'number') {
      writeCount += 1;
      if (writeCount === failAt) {
        originalWrite(file, 'synthetic partial bytes', 'utf8');
        throw new Error('synthetic write failure at staged file ' + failAt);
      }
    }
    return originalWrite(file, ...args);
  };
  try {
    expectBlocked(() => stageHandoff(rollback, {
      executePipeline: () => { pipelineCalls += 1; },
      restoreProjections: () => { restorationCalls += 1; }
    }), /initial candidate write failed; candidate staging was rolled back: synthetic write failure/);
  } finally {
    fs.writeFileSync = originalWrite;
  }
  assert.equal(writeCount, failAt, 'fault injection must hit the requested staged file');
  assert.equal(pipelineCalls, 0, 'partial writes must not start rendering or validation');
  assert.equal(restorationCalls, 0, 'no projections exist to restore before rendering');
  assert.equal(fs.existsSync(rollbackHypothesisDir), false, 'partial write must not retain staged hypothesis');
  assert.equal(fs.existsSync(rollbackEvidencePath), false, 'partial write must not retain staged evidence');
}
assertPartialWriteRollback(1); // hypothesis.json is partially written
assertPartialWriteRollback(2); // new evidence binding is partially written

// A file created by another writer after preflight must not be deleted by rollback.
const originalOpen = fs.openSync;
const racedEvidenceMarker = 'synthetic concurrent evidence - not owned by transaction';
fs.openSync = (targetPath, flags, ...args) => {
  if (targetPath === rollbackEvidencePath && flags === 'wx') {
    const descriptor = originalOpen(targetPath, 'wx');
    try { fs.writeSync(descriptor, racedEvidenceMarker, undefined, 'utf8'); }
    finally { fs.closeSync(descriptor); }
    const error = new Error('synthetic exclusive-create race');
    error.code = 'EEXIST';
    throw error;
  }
  return originalOpen(targetPath, flags, ...args);
};
try {
  expectBlocked(() => stageHandoff(rollback, {
    executePipeline: () => { throw new Error('raced file entered pipeline'); },
    restoreProjections: () => {}
  }), /initial candidate write failed; candidate staging was rolled back: synthetic exclusive-create race/);
  assert.equal(fs.readFileSync(rollbackEvidencePath, 'utf8'), racedEvidenceMarker, 'unowned raced file must be preserved');
  assert.equal(fs.existsSync(rollbackHypothesisDir), false, 'owned candidate directory must be removed');
} finally {
  fs.openSync = originalOpen;
  fs.rmSync(rollbackEvidencePath, { force: true });
}
// A staged evidence pathname can be replaced while rendering. Preserve the
// replacement rather than deleting a file that this transaction does not own.
const parkedEvidencePath = rollbackEvidencePath + '.owned-original-fixture';
const replacedEvidenceMarker = 'synthetic replacement evidence - not owned by transaction';
try {
  expectBlocked(() => stageHandoff(rollback, {
    executePipeline: () => {
      fs.renameSync(rollbackEvidencePath, parkedEvidencePath);
      fs.writeFileSync(rollbackEvidencePath, replacedEvidenceMarker, 'utf8');
      throw new Error('synthetic evidence replacement after staging');
    },
    restoreProjections: () => {}
  }), /post-stage rendering or validation failed; candidate cleanup incomplete: synthetic evidence replacement/);
  assert.equal(fs.readFileSync(rollbackEvidencePath, 'utf8'), replacedEvidenceMarker,
    'a replacement evidence file must survive rollback');
  assert.equal(fs.existsSync(parkedEvidencePath), true, 'the originally owned inode remains available for inspection');
  assert.equal(fs.existsSync(rollbackHypothesisDir), false, 'safe candidate directory can still be cleaned');
} finally {
  fs.rmSync(rollbackHypothesisDir, { recursive: true, force: true }); // synthetic test cleanup only
  fs.rmSync(rollbackEvidencePath, { force: true });
  fs.rmSync(parkedEvidencePath, { force: true });
}

// A candidate-directory symlink replacement must not redirect cleanup into
// an external directory or permit projection restoration from that directory.
const replacedCandidateDir = rollbackHypothesisDir + '-owned-original-fixture';
const externalCandidateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'osteosarcoma-candidate-dir-swap-'));
const externalCandidatePage = path.join(externalCandidateDir, 'index.html');
fs.writeFileSync(externalCandidatePage, 'synthetic external page - keep', 'utf8');
let unsafeRestorationCalls = 0;
try {
  expectBlocked(() => stageHandoff(rollback, {
    executePipeline: () => {
      fs.renameSync(rollbackHypothesisDir, replacedCandidateDir);
      fs.symlinkSync(externalCandidateDir, rollbackHypothesisDir, 'dir');
      throw new Error('synthetic candidate directory replacement');
    },
    restoreProjections: () => { unsafeRestorationCalls += 1; }
  }), /post-stage rendering or validation failed; candidate cleanup incomplete: synthetic candidate directory replacement/);
  assert.equal(fs.readFileSync(externalCandidatePage, 'utf8'), 'synthetic external page - keep',
    'rollback must not follow a replaced candidate-directory symlink');
  assert.equal(fs.lstatSync(rollbackHypothesisDir).isSymbolicLink(), true,
    'replacement symlink must remain for inspection');
  assert.equal(unsafeRestorationCalls, 0, 'unsafe candidate paths must block projection restoration');
  assert.equal(fs.existsSync(rollbackEvidencePath), false, 'owned evidence may still be removed under an unchanged parent');
} finally {
  fs.rmSync(rollbackHypothesisDir, { force: true }); // remove only the synthetic symlink
  fs.rmSync(replacedCandidateDir, { recursive: true, force: true }); // synthetic test cleanup only
  fs.rmSync(rollbackEvidencePath, { force: true });
  fs.rmSync(externalCandidateDir, { recursive: true, force: true });
}

// Renderer rollback may remove only known generated HTML, not unrelated files
// added under the new candidate directory while projection work was running.
function assertBoundedProjectionRollback(injectUnexpectedFile) {
  const canonicalPage = path.join(rollbackHypothesisDir, 'index.html');
  const easyReadDir = path.join(rollbackHypothesisDir, 'easy-read');
  const easyReadPage = path.join(easyReadDir, 'index.html');
  const unexpected = path.join(rollbackHypothesisDir, 'unowned-note.txt');
  let restorationCalls = 0;
  try {
    expectBlocked(() => stageHandoff(rollback, {
      executePipeline: () => {
        fs.writeFileSync(canonicalPage, 'synthetic generated public HTML', 'utf8');
        fs.mkdirSync(easyReadDir);
        fs.writeFileSync(easyReadPage, 'synthetic generated Easy Read HTML', 'utf8');
        if (injectUnexpectedFile) fs.writeFileSync(unexpected, 'synthetic unowned material', 'utf8');
        throw new Error('synthetic post-render validation failure');
      },
      restoreProjections: () => { restorationCalls += 1; }
    }), injectUnexpectedFile
      ? /post-stage rendering or validation failed; candidate cleanup incomplete: synthetic post-render validation failure/
      : /post-stage rendering or validation failed; candidate staging was rolled back: synthetic post-render validation failure/);
    assert.equal(restorationCalls, 1, 'canonical projections must still be restored');
    assert.equal(fs.existsSync(canonicalPage), false, 'generated hypothesis page must be removed');
    assert.equal(fs.existsSync(easyReadDir), false, 'generated Easy Read directory must be removed');
    assert.equal(fs.existsSync(rollbackEvidencePath), false, 'owned evidence binding must be removed');
    if (injectUnexpectedFile) {
      assert.equal(fs.readFileSync(unexpected, 'utf8'), 'synthetic unowned material', 'unowned content must survive');
      assert.equal(fs.existsSync(rollbackHypothesisDir), true, 'nonempty candidate directory must survive for inspection');
    } else {
      assert.equal(fs.existsSync(rollbackHypothesisDir), false, 'fully owned candidate directory must be removed');
    }
  } finally {
    fs.rmSync(rollbackHypothesisDir, { recursive: true, force: true }); // synthetic test cleanup only
    fs.rmSync(rollbackEvidencePath, { force: true });
  }
}
assertBoundedProjectionRollback(false);
assertBoundedProjectionRollback(true);

// If a renderer output path contains an unexpected symlink, rollback must
// preserve the link as unowned material, without following or deleting its target.
function assertGeneratedPageSymlinkPreserved(whichPage) {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'osteosarcoma-unowned-html-'));
  const outsideFile = path.join(outside, 'external.html');
  const pagePath = whichPage === 'easy-read'
    ? path.join(rollbackHypothesisDir, 'easy-read', 'index.html')
    : path.join(rollbackHypothesisDir, 'index.html');
  fs.writeFileSync(outsideFile, 'synthetic external file - preserve', 'utf8');
  try {
    expectBlocked(() => stageHandoff(rollback, {
      executePipeline: () => {
        if (whichPage === 'easy-read') fs.mkdirSync(path.dirname(pagePath));
        fs.symlinkSync(outsideFile, pagePath);
        throw new Error('synthetic generated-page symlink failure');
      },
      restoreProjections: () => {}
    }), /post-stage rendering or validation failed; candidate cleanup incomplete: synthetic generated-page symlink failure/);
    assert.equal(fs.lstatSync(pagePath).isSymbolicLink(), true, 'unowned generated-page symlink must survive for inspection');
    assert.equal(fs.readFileSync(outsideFile, 'utf8'), 'synthetic external file - preserve', 'outside file must not be touched');
    assert.equal(fs.existsSync(rollbackEvidencePath), false, 'owned evidence must still be removed');
  } finally {
    fs.rmSync(rollbackHypothesisDir, { recursive: true, force: true }); // synthetic test cleanup only
    fs.rmSync(rollbackEvidencePath, { force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
}
assertGeneratedPageSymlinkPreserved('hypothesis');
assertGeneratedPageSymlinkPreserved('easy-read');

// An unexpected Easy Read symlink must never make rollback delete outside files.
const outsideRenderDir = fs.mkdtempSync(path.join(os.tmpdir(), 'osteosarcoma-rollback-outside-'));
const outsideRenderPage = path.join(outsideRenderDir, 'index.html');
const candidateEasyReadDir = path.join(rollbackHypothesisDir, 'easy-read');
fs.writeFileSync(outsideRenderPage, 'synthetic external file', 'utf8');
try {
  expectBlocked(() => stageHandoff(rollback, {
    executePipeline: () => {
      fs.symlinkSync(outsideRenderDir, candidateEasyReadDir);
      throw new Error('synthetic symlink rendering failure');
    },
    restoreProjections: () => {}
  }), /post-stage rendering or validation failed; candidate cleanup incomplete: synthetic symlink rendering failure/);
  assert.equal(fs.readFileSync(outsideRenderPage, 'utf8'), 'synthetic external file', 'rollback must not follow Easy Read symlink');
  assert.equal(fs.lstatSync(candidateEasyReadDir).isSymbolicLink(), true, 'unexpected symlink must remain for inspection');
  assert.equal(fs.existsSync(rollbackEvidencePath), false, 'owned evidence must still be removed');
} finally {
  fs.rmSync(rollbackHypothesisDir, { recursive: true, force: true }); // synthetic test cleanup only
  fs.rmSync(rollbackEvidencePath, { force: true });
  fs.rmSync(outsideRenderDir, { recursive: true, force: true });
}

expectBlocked(
  () => stageHandoff(rollback, {
    executePipeline: () => { throw new Error('synthetic post-stage failure'); },
    restoreProjections: () => {}
  }),
  /post-stage rendering or validation failed; candidate staging was rolled back: synthetic post-stage failure/i
);
assert.equal(fs.existsSync(rollbackHypothesisDir), false, 'failed staging must remove the new hypothesis directory');
assert.equal(fs.existsSync(rollbackEvidencePath), false, 'failed staging must remove newly created evidence files');


/**
 * Exercise the actual committed-state validator command, not only the shared
 * URL helper or the pre-staging handoff path. The copied test worktree contains
 * public repository files only; no canonical objects are mutated by this test.
 */
function testCommittedBindingSourceUrlCli() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'osteosarcoma-committed-url-'));
  try {
    for (const rel of [
      'hypotheses', 'evidence-bindings', 'indexes', 'schemas', 'scripts', 'docs',
      'index.html', 'sitemap.xml', 'manifest.json', 'repository-manifest.json',
      'AGENTS.md', 'robots.txt'
    ]) {
      fs.cpSync(path.join(root, rel), path.join(fixtureRoot, rel), { recursive: true });
    }
    const validate = () => spawnSync(process.execPath, ['scripts/validate-public-research.js'], {
      cwd: fixtureRoot, encoding: 'utf8', timeout: 20000
    });
    const baseline = validate();
    assert.ifError(baseline.error);
    assert.equal(baseline.status, 0, 'unchanged public fixture must pass the committed-state CLI');

    const id = evidenceBindings[0].evidence_id;
    const rel = 'evidence-bindings/' + id + '.json';
    const bindingPath = path.join(fixtureRoot, rel);
    const original = JSON.parse(fs.readFileSync(bindingPath, 'utf8'));
    for (const unsafeUrl of [
      'https://pubmed.ncbi.nlm.nih.gov/?access_token=synthetic-only',
      'https://pubmed.ncbi.nlm.nih.gov/#section&access_token=synthetic-only',
      'http://127.0.0.1/synthetic-evidence',
      'https://source.internal/synthetic-evidence'
    ]) {
      const candidate = { ...original, canonical_source_url: unsafeUrl };
      fs.writeFileSync(bindingPath, JSON.stringify(candidate, null, 2) + '\n', 'utf8');
      const run = validate();
      assert.ifError(run.error);
      assert.notEqual(run.status, 0, 'committed-state validator must reject unsafe source URL');
      const diagnostic = (run.stdout || '') + (run.stderr || '');
      assert.ok(
        diagnostic.includes(rel + ' canonical source must use a public http(s) URL'),
        'expected evidence-path-specific shared URL policy failure'
      );
      assert.ok(!diagnostic.includes(unsafeUrl), 'validator must not echo rejected source URL');
    }
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}
testCommittedBindingSourceUrlCli();

console.log('Publication transaction tests passed (18 handoff URL fixtures and 4 committed-state CLI negatives): v1.1/current-target compatibility, bounded v1.0 fallback, integrity, authority, clinical-use, complete new-candidate contract metadata, public-safety, explicit evidence-context, canonical evidence-identity/reference, full projection/validation coverage, transactional rollback and overwrite gates fail closed.');