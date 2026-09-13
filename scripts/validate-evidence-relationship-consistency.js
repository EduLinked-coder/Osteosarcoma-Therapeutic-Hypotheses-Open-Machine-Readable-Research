const fs = require('fs');
const path = require('path');

const root = process.cwd();
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const exists = (file) => fs.existsSync(path.join(root, file));
let failed = false;

const fail = (message) => {
  console.error('EVIDENCE RELATIONSHIP VALIDATION FAILED: ' + message);
  failed = true;
};

const relationshipMap = {
  supports: 'SUPPORTS',
  contradicts: 'CONTRADICTS',
  contextualises: 'CONTEXTUALISES',
  limits: 'LIMITS',
  neutral: 'NEUTRAL'
};

const index = readJson('indexes/hypotheses.json');
const reviewRegisterPath = 'governance/evidence-relationship-review-exceptions.json';
if (!exists(reviewRegisterPath)) fail('Missing protected review register: ' + reviewRegisterPath);
const reviewRegister = exists(reviewRegisterPath) ? readJson(reviewRegisterPath) : { exceptions: [] };
const exceptions = Array.isArray(reviewRegister.exceptions) ? reviewRegister.exceptions : [];

if (reviewRegister.schema_version !== '1.0.0') fail('Protected review register must use schema_version 1.0.0.');
if (!Array.isArray(reviewRegister.exceptions)) fail('Protected review register exceptions must be an array.');

const exceptionKeys = new Set();
for (const exception of exceptions) {
  const key = `${exception.hypothesis_id}::${exception.evidence_id}`;
  if (exceptionKeys.has(key)) fail('Duplicate protected review exception for ' + key);
  exceptionKeys.add(key);
  if (exception.status !== 'HUMAN_SCIENTIFIC_REVIEW_REQUIRED') fail(key + ' must remain HUMAN_SCIENTIFIC_REVIEW_REQUIRED until resolved.');
  if (exception.clinical_use !== false) fail(key + ' must explicitly preserve clinical_use:false.');
  if (!/^https:\/\/github\.com\/EduLinked-coder\/Osteosarcoma-Therapeutic-Hypotheses-Open-Machine-Readable-Research\/issues\/[0-9]+$/.test(exception.review_issue || '')) {
    fail(key + ' must reference an attributable public repository scientific-review issue.');
  }
  if (!exception.resolution_rule || exception.resolution_rule.length < 30) fail(key + ' must state a resolution rule preserving scientific authority and provenance.');
}

const observedMismatches = new Set();
const observedPairs = new Set();

for (const entry of index.hypotheses || []) {
  const hypothesisId = entry.hypothesis_id;
  const objectPath = entry.canonical_object_path || `hypotheses/${hypothesisId}/hypothesis.json`;
  if (!exists(objectPath)) {
    fail('Missing canonical hypothesis object: ' + objectPath);
    continue;
  }
  const hypothesis = readJson(objectPath);
  const evidenceEntries = [
    ...(hypothesis.supporting_evidence || []),
    ...((hypothesis.contradictory_evidence && hypothesis.contradictory_evidence.items) || [])
  ];
  const seenEvidence = new Set();

  for (const evidence of evidenceEntries) {
    const evidenceId = evidence.evidence_id;
    const pairKey = `${hypothesisId}::${evidenceId}`;
    if (seenEvidence.has(evidenceId)) {
      fail(hypothesisId + ' contains duplicate canonical evidence relationship entry for ' + evidenceId + '.');
      continue;
    }
    seenEvidence.add(evidenceId);
    observedPairs.add(pairKey);

    const canonicalRelationship = relationshipMap[evidence.relationship];
    if (!canonicalRelationship) {
      fail(pairKey + ' uses unsupported canonical relationship ' + JSON.stringify(evidence.relationship) + '.');
      continue;
    }

    const bindingPath = `evidence-bindings/${evidenceId}.json`;
    if (!exists(bindingPath)) {
      fail(pairKey + ' is missing governed evidence binding ' + bindingPath + '.');
      continue;
    }
    const binding = readJson(bindingPath);
    if (binding.evidence_id !== evidenceId) fail(bindingPath + ' evidence_id does not match its canonical filename/reference.');
    if (!binding.provenance || binding.provenance.binding_generated_for !== hypothesisId) {
      fail(bindingPath + ' provenance.binding_generated_for must equal ' + hypothesisId + '.');
    }
    if (binding.clinical_use !== false) fail(bindingPath + ' must explicitly preserve clinical_use:false.');

    const bindingRelationship = binding.relationship_to_hypothesis;
    const exception = exceptions.find((item) => item.hypothesis_id === hypothesisId && item.evidence_id === evidenceId);

    if (canonicalRelationship === bindingRelationship) {
      if (exception) fail(pairKey + ' has a stale protected review exception even though relationship semantics now agree.');
      continue;
    }

    observedMismatches.add(pairKey);
    if (!exception) {
      fail(pairKey + ` relationship mismatch is ungoverned: canonical=${canonicalRelationship}, binding=${bindingRelationship}. Open an attributable scientific-review issue and register the exact unresolved mismatch; do not normalise it autonomously.`);
      continue;
    }
    if (exception.hypothesis_relationship !== canonicalRelationship || exception.binding_relationship !== bindingRelationship) {
      fail(pairKey + ' protected review exception does not exactly match the live relationship values.');
    }
  }
}

for (const exception of exceptions) {
  const key = `${exception.hypothesis_id}::${exception.evidence_id}`;
  if (!observedPairs.has(key)) fail(key + ' protected review exception references no current canonical evidence relationship.');
  if (!observedMismatches.has(key)) fail(key + ' protected review exception no longer corresponds to a live mismatch and must be removed through the reviewed resolution path.');
}

if (failed) process.exitCode = 1;
else console.log(`Evidence relationship consistency passed with ${observedMismatches.size} explicitly governed human-review exception(s).`);
