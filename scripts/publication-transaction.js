'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { validateJsonSchema } = require('./lib/schema-lite');
const { validateEvidenceBindingIdentity } = require('./lib/evidence-binding-integrity');
const { scanStructuredValue, scanSecretMaterial } = require('./validate-public-safety');

const root = process.cwd();
const CONTRACT_ID = 'OSTEOSARCOMA-PUBLIC-PROJECTION-HANDOFF-001';
const CONTRACT_VERSION = '1.0.0';
const TARGET_REPOSITORY = 'EduLinked-coder/Osteosarcoma-Therapeutic-Hypotheses-Open-Machine-Readable-Research';
const ID = /^OS-TH-[0-9]{4}$/;
const GIT_SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const allowedEnvelopeKeys = new Set(['contract_id', 'contract_version', 'source', 'target', 'authority', 'public_projection', 'handoff_digest']);

class PublicationTransactionBlocked extends Error {}

const readJson = (relativeOrAbsolute) => JSON.parse(fs.readFileSync(path.isAbsolute(relativeOrAbsolute) ? relativeOrAbsolute : path.join(root, relativeOrAbsolute), 'utf8'));

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function computeHandoffDigest(envelope) {
  const payload = { ...envelope };
  delete payload.handoff_digest;
  return crypto.createHash('sha256').update(canonicalJson(payload)).digest('hex');
}

function requireGate(condition, message) {
  if (!condition) throw new PublicationTransactionBlocked(message);
}

function isPublicHttpUrl(value) {
  try {
    const parsed = new URL(String(value));
    return ['http:', 'https:'].includes(parsed.protocol) && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

function validatePublicProjectionSafety(projection) {
  const errors = [
    ...scanStructuredValue(projection, 'public_projection'),
    ...scanSecretMaterial(JSON.stringify(projection), 'public_projection')
  ];
  requireGate(errors.length === 0, 'public projection safety validation failed: ' + errors.join(' | '));
}

function validateHandoff(envelope) {
  requireGate(envelope && typeof envelope === 'object' && !Array.isArray(envelope), 'handoff must be a JSON object');
  for (const key of Object.keys(envelope)) requireGate(allowedEnvelopeKeys.has(key), 'handoff has unsupported top-level property ' + key);
  requireGate(envelope.contract_id === CONTRACT_ID, 'unsupported handoff contract id');
  requireGate(envelope.contract_version === CONTRACT_VERSION, 'unsupported handoff contract version');
  requireGate(typeof envelope.handoff_digest === 'string' && SHA256.test(envelope.handoff_digest), 'handoff digest must be sha256');
  requireGate(computeHandoffDigest(envelope) === envelope.handoff_digest, 'handoff digest does not match payload');

  const source = envelope.source || {};
  requireGate(typeof source.repository === 'string' && source.repository.trim().length > 0, 'source repository is required');
  requireGate(typeof source.revision === 'string' && GIT_SHA.test(source.revision), 'source revision must be a full git sha');
  requireGate(typeof source.report_digest === 'string' && SHA256.test(source.report_digest), 'source report digest must be sha256');
  requireGate(Array.isArray(source.object_ids) && source.object_ids.length > 0 && source.object_ids.every((value) => typeof value === 'string' && value.trim()), 'source object ids are required');

  const target = envelope.target || {};
  const hypothesisSchema = readJson('schemas/therapeutic-hypothesis.schema.json');
  const evidenceSchema = readJson('schemas/evidence-binding.schema.json');
  requireGate(target.repository === TARGET_REPOSITORY, 'handoff target repository mismatch');
  requireGate(target.hypothesis_schema === hypothesisSchema.$id, 'handoff target hypothesis schema mismatch');
  requireGate(target.evidence_binding_schema === evidenceSchema.$id, 'handoff target evidence schema mismatch');

  const authority = envelope.authority || {};
  requireGate(authority.disclosure_authorised === true, 'explicit disclosure authority is required');
  requireGate(typeof authority.disclosure_authority_reference === 'string' && authority.disclosure_authority_reference.trim(), 'attributable disclosure authority reference is required');
  requireGate(authority.scientific_review_required === true, 'scientific review requirement must be preserved');
  requireGate(authority.may_publish === false, 'candidate handoff must not transfer publication authority');

  const projection = envelope.public_projection || {};
  const hypothesis = projection.hypothesis;
  const bindings = projection.evidence_bindings;
  requireGate(hypothesis && typeof hypothesis === 'object' && !Array.isArray(hypothesis), 'public hypothesis is required');
  requireGate(Array.isArray(bindings) && bindings.length > 0, 'at least one public evidence binding is required');
  validatePublicProjectionSafety(projection);

  const hypothesisErrors = validateJsonSchema(hypothesisSchema, hypothesisSchema, hypothesis, 'public_projection.hypothesis');
  requireGate(hypothesisErrors.length === 0, 'public hypothesis schema failed: ' + hypothesisErrors.join(' | '));
  requireGate(ID.test(hypothesis.hypothesis_id || ''), 'public hypothesis id is invalid');
  requireGate(hypothesis.clinical_use === false, 'public hypothesis must set clinical_use:false');
  requireGate(hypothesis.review_state?.scientific_review_required === true, 'public hypothesis must preserve scientific review');
  requireGate(hypothesis.review_state?.publication_class === 'public-research-candidate', 'automatic transaction is limited to public-research-candidate objects');
  requireGate(Boolean(hypothesis.uncertainty?.summary), 'public hypothesis must preserve uncertainty');
  requireGate(Boolean(hypothesis.contradictory_evidence?.status) && Boolean(hypothesis.contradictory_evidence?.assessment), 'public hypothesis must preserve contradictory-evidence assessment');

  const bindingIds = new Set();
  for (const binding of bindings) {
    const where = 'public_projection.evidence_bindings[' + bindingIds.size + ']';
    const errors = validateJsonSchema(evidenceSchema, evidenceSchema, binding, where);
    requireGate(errors.length === 0, 'public evidence schema failed: ' + errors.join(' | '));
    const identityErrors = validateEvidenceBindingIdentity(binding, where);
    requireGate(identityErrors.length === 0, 'public evidence identity validation failed: ' + identityErrors.join(' | '));
    requireGate(!bindingIds.has(binding.evidence_id), 'duplicate evidence binding id ' + binding.evidence_id);
    bindingIds.add(binding.evidence_id);
    requireGate(binding.clinical_use === false, binding.evidence_id + ' must set clinical_use:false');
    requireGate(binding.acceptance_state?.status === 'candidate-public-evidence', binding.evidence_id + ' must remain candidate public evidence');
    requireGate(binding.provenance?.binding_generated_for === hypothesis.hypothesis_id, binding.evidence_id + ' is not bound to ' + hypothesis.hypothesis_id);
    requireGate(isPublicHttpUrl(binding.canonical_source_url), binding.evidence_id + ' canonical source must be public http(s)');
  }

  const mechanismEvidenceRefs = (hypothesis.mechanism?.relationships || [])
    .flatMap((relationship) => relationship.evidence_refs || [])
    .filter(Boolean);
  const referencedIds = new Set([
    ...(hypothesis.supporting_evidence || []).map((item) => item.evidence_id),
    ...((hypothesis.contradictory_evidence || {}).items || []).map((item) => item.evidence_id),
    ...mechanismEvidenceRefs
  ].filter(Boolean));
  for (const evidenceId of referencedIds) requireGate(bindingIds.has(evidenceId), 'hypothesis references evidence missing from handoff: ' + evidenceId);
  for (const evidenceId of bindingIds) requireGate(referencedIds.has(evidenceId), 'handoff contains unreferenced evidence binding: ' + evidenceId);

  return { hypothesis, bindings };
}

function stageHandoff(envelope) {
  const { hypothesis, bindings } = validateHandoff(envelope);
  const hypothesisPath = path.join(root, 'hypotheses', hypothesis.hypothesis_id, 'hypothesis.json');
  requireGate(!fs.existsSync(hypothesisPath), hypothesis.hypothesis_id + ' already exists; autonomous overwrite/revision is blocked');

  const newEvidence = [];
  for (const binding of bindings) {
    const relative = path.join('evidence-bindings', binding.evidence_id + '.json');
    const targetPath = path.join(root, relative);
    if (fs.existsSync(targetPath)) {
      const existing = readJson(relative);
      requireGate(canonicalJson(existing) === canonicalJson(binding), binding.evidence_id + ' conflicts with existing public evidence binding');
    } else {
      newEvidence.push({ targetPath, binding });
    }
  }

  fs.mkdirSync(path.dirname(hypothesisPath), { recursive: true });
  fs.writeFileSync(hypothesisPath, JSON.stringify(hypothesis, null, 2) + '\n', 'utf8');
  for (const { targetPath, binding } of newEvidence) fs.writeFileSync(targetPath, JSON.stringify(binding, null, 2) + '\n', 'utf8');

  execFileSync(process.execPath, ['scripts/render-public-research.js'], { cwd: root, stdio: 'inherit' });
  execFileSync(process.execPath, ['scripts/validate-schema.js'], { cwd: root, stdio: 'inherit' });
  execFileSync(process.execPath, ['scripts/render-public-research.js', '--check'], { cwd: root, stdio: 'inherit' });
  execFileSync(process.execPath, ['scripts/validate-public-safety.js'], { cwd: root, stdio: 'inherit' });
  execFileSync(process.execPath, ['scripts/validate-public-research.js'], { cwd: root, stdio: 'inherit' });

  return {
    hypothesis_id: hypothesis.hypothesis_id,
    hypothesis_path: path.relative(root, hypothesisPath),
    new_evidence_ids: newEvidence.map(({ binding }) => binding.evidence_id),
    reused_evidence_ids: bindings.filter((binding) => !newEvidence.some(({ binding: created }) => created.evidence_id === binding.evidence_id)).map((binding) => binding.evidence_id)
  };
}

function cli() {
  const [mode, envelopePath] = process.argv.slice(2);
  requireGate(['--check', '--stage'].includes(mode) && envelopePath, 'usage: node scripts/publication-transaction.js --check|--stage <handoff.json>');
  const envelope = readJson(envelopePath);
  if (mode === '--check') {
    const { hypothesis, bindings } = validateHandoff(envelope);
    console.log('Public handoff validation passed for ' + hypothesis.hypothesis_id + ' with ' + bindings.length + ' evidence binding(s). No repository files were changed.');
    return;
  }
  const result = stageHandoff(envelope);
  console.log('Staged public candidate ' + result.hypothesis_id + '. No merge or scientific approval was performed.');
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  try { cli(); }
  catch (error) {
    console.error('PUBLICATION TRANSACTION BLOCKED: ' + error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  CONTRACT_ID,
  CONTRACT_VERSION,
  TARGET_REPOSITORY,
  PublicationTransactionBlocked,
  canonicalJson,
  computeHandoffDigest,
  validatePublicProjectionSafety,
  validateHandoff,
  stageHandoff
};
