'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { validateJsonSchema } = require('./lib/schema-lite');
const { validateEvidenceBindingIdentity, validateEvidenceContextIntegrity } = require('./lib/evidence-binding-integrity');
const { scanStructuredValue, scanSecretMaterial } = require('./validate-public-safety');
const { isPublicSourceUrl } = require('./lib/public-source-url');

const root = process.cwd();
const CONTRACT_ID = 'OSTEOSARCOMA-PUBLIC-PROJECTION-HANDOFF-001';
const CONTRACT_VERSION = '1.1.0';
const SUPPORTED_CONTRACT_VERSIONS = new Set(['1.0.0', CONTRACT_VERSION]);
const TARGET_REPOSITORY = 'EduLinked-coder/Osteosarcoma-Therapeutic-Hypotheses-Open-Machine-Readable-Research';
const ID = /^OS-TH-[0-9]{4}$/;
const GIT_SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const allowedEnvelopeKeys = new Set(['contract_id', 'contract_version', 'source', 'target', 'authority', 'public_projection', 'handoff_digest']);

const PROJECTION_RENDER_PIPELINE = Object.freeze([
  Object.freeze({ script: 'scripts/render-public-research.js', args: [] }),
  Object.freeze({ script: 'scripts/render-research-activity.js', args: [] }),
  Object.freeze({ script: 'scripts/render-public-research.js', args: [] }),
  Object.freeze({ script: 'scripts/render-structured-metadata.js', args: [] }),
  Object.freeze({ script: 'scripts/render-machine-manifest.js', args: [] })
]);

const POST_STAGE_VALIDATION_PIPELINE = Object.freeze([
  Object.freeze({ script: 'scripts/validate-schema.js', args: [] }),
  Object.freeze({ script: 'scripts/render-public-research.js', args: ['--check'] }),
  Object.freeze({ script: 'scripts/render-research-activity.js', args: ['--check'] }),
  Object.freeze({ script: 'scripts/render-structured-metadata.js', args: ['--check'] }),
  Object.freeze({ script: 'scripts/render-machine-manifest.js', args: ['--check'] }),
  Object.freeze({ script: 'scripts/validate-evidence-events.js', args: [] }),
  Object.freeze({ script: 'scripts/validate-lifecycle-bindings.js', args: [] }),
  Object.freeze({ script: 'scripts/validate-evidence-context.js', args: [] }),
  Object.freeze({ script: 'scripts/validate-evidence-relationship-consistency.js', args: [] }),
  Object.freeze({ script: 'scripts/validate-search.js', args: [] }),
  Object.freeze({ script: 'scripts/validate-public-interface.js', args: [] }),
  Object.freeze({ script: 'scripts/validate-public-safety.js', args: [] }),
  Object.freeze({ script: 'scripts/validate-public-research.js', args: [] })
]);

class PublicationTransactionBlocked extends Error {}

const readJson = (relativeOrAbsolute) => JSON.parse(fs.readFileSync(path.isAbsolute(relativeOrAbsolute) ? relativeOrAbsolute : path.join(root, relativeOrAbsolute), 'utf8'));

// lstat detects dangling symlinks that existsSync would incorrectly treat as absent.
function lstatIfPresent(targetPath) {
  try { return fs.lstatSync(targetPath); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

// Physical identity checks make rollback conservative when a staging path is
// replaced. These are bounded checks, not an atomic filesystem transaction.
function samePhysicalEntry(targetPath, identity, kind) {
  if (!identity) return false;
  const current = lstatIfPresent(targetPath);
  return Boolean(current && !current.isSymbolicLink()
    && (kind === 'directory' ? current.isDirectory() : current.isFile())
    && current.dev === identity.dev && current.ino === identity.ino);
}

// Track ownership immediately after exclusive creation, before any bytes are written.
function writeTrackedExclusiveFile(targetPath, content, createdFiles) {
  const descriptor = fs.openSync(targetPath, 'wx');
  const staged = { targetPath, identity: fs.fstatSync(descriptor), digest: null };
  createdFiles.push(staged);
  try {
    fs.writeFileSync(descriptor, content, 'utf8');
    // A completed write has known bytes. A later same-inode change is unowned.
    // Keep digest null for partial-write cleanup if the write itself throws.
    staged.digest = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  } finally {
    fs.closeSync(descriptor);
  }
}

// Only delete a renderer output whose physical identity was observed after a
// completed render and before validation. Unknown or replaced files are unowned.
// Retain even same-inode generated pages if their bytes changed after the
// completed-render checkpoint. Content checks remain best-effort, not atomic.
function removeKnownGeneratedHtml(targetPath, expectedSnapshot, cleanupErrors) {
  const entry = lstatIfPresent(targetPath);
  if (!entry) return;
  if (!expectedSnapshot || !samePhysicalEntry(targetPath, expectedSnapshot.identity, 'file')) {
    cleanupErrors.push('generated-page ownership unknown or changed; preserving ' + path.relative(root, targetPath));
    return;
  }
  const currentDigest = crypto.createHash('sha256').update(fs.readFileSync(targetPath)).digest('hex');
  if (currentDigest !== expectedSnapshot.digest) {
    cleanupErrors.push('generated-page contents changed after render; preserving ' + path.relative(root, targetPath));
    return;
  }
  fs.rmSync(targetPath, { force: true });
}

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

function validatePublicProjectionSafety(projection) {
  const errors = [
    ...scanStructuredValue(projection, 'public_projection'),
    ...scanSecretMaterial(JSON.stringify(projection), 'public_projection')
  ];
  requireGate(errors.length === 0, 'public projection safety validation failed: ' + errors.join(' | '));
}

function validateNewCandidateCanonicalContract(hypothesis) {
  requireGate(hypothesis.disease_context && typeof hypothesis.disease_context === 'object' && !Array.isArray(hypothesis.disease_context), 'new public candidate must explicitly preserve disease context');
  requireGate(hypothesis.research_classification === 'therapeutic-hypothesis', 'new public candidate must explicitly set research classification');
  requireGate(typeof hypothesis.ranking?.explanation === 'string' && hypothesis.ranking.explanation.trim().length >= 20, 'new public candidate must explain its research-priority ranking state');
  requireGate(typeof hypothesis.novelty?.confidence === 'string' && hypothesis.novelty.confidence.trim(), 'new public candidate must explicitly preserve novelty confidence');

  const accessibility = hypothesis.accessibility;
  requireGate(accessibility && typeof accessibility === 'object' && !Array.isArray(accessibility), 'new public candidate must include accessibility projection metadata');
  requireGate(accessibility.plain_language_summary === 'canonical', 'new public candidate accessibility metadata must bind to the canonical plain-language summary');
  requireGate(accessibility.easy_read_projection === 'hypotheses/' + hypothesis.hypothesis_id + '/easy-read/', 'new public candidate accessibility metadata must bind to its stable Easy Read projection');
}

function validateHandoff(envelope) {
  requireGate(envelope && typeof envelope === 'object' && !Array.isArray(envelope), 'handoff must be a JSON object');
  for (const key of Object.keys(envelope)) requireGate(allowedEnvelopeKeys.has(key), 'handoff has unsupported top-level property ' + key);
  requireGate(envelope.contract_id === CONTRACT_ID, 'unsupported handoff contract id');
  requireGate(SUPPORTED_CONTRACT_VERSIONS.has(envelope.contract_version), 'unsupported handoff contract version');
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
  const targetEvidenceBindingVersion = evidenceSchema.properties?.evidence_binding_version?.const;
  requireGate(target.repository === TARGET_REPOSITORY, 'handoff target repository mismatch');
  requireGate(target.hypothesis_schema === hypothesisSchema.$id, 'handoff target hypothesis schema mismatch');
  requireGate(target.evidence_binding_schema === evidenceSchema.$id, 'handoff target evidence schema mismatch');
  if (envelope.contract_version === CONTRACT_VERSION) {
    requireGate(target.evidence_binding_version === targetEvidenceBindingVersion, 'handoff target evidence binding version mismatch');
  } else if (target.evidence_binding_version !== undefined) {
    requireGate(target.evidence_binding_version === targetEvidenceBindingVersion, 'handoff target evidence binding version mismatch');
  }

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

  validateNewCandidateCanonicalContract(hypothesis);
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
    const contextErrors = validateEvidenceContextIntegrity(binding, where);
    requireGate(contextErrors.length === 0, 'public evidence context validation failed: ' + contextErrors.join(' | '));
    requireGate(!bindingIds.has(binding.evidence_id), 'duplicate evidence binding id ' + binding.evidence_id);
    bindingIds.add(binding.evidence_id);
    requireGate(binding.clinical_use === false, binding.evidence_id + ' must set clinical_use:false');
    requireGate(binding.acceptance_state?.status === 'candidate-public-evidence', binding.evidence_id + ' must remain candidate public evidence');
    requireGate(binding.provenance?.binding_generated_for === hypothesis.hypothesis_id, binding.evidence_id + ' is not bound to ' + hypothesis.hypothesis_id);
    requireGate(isPublicSourceUrl(binding.canonical_source_url), binding.evidence_id + ' canonical source must use a public http(s) URL without embedded credentials or non-public hosts');
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

function runNodePipeline(pipeline) {
  for (const { script, args } of pipeline) {
    execFileSync(process.execPath, [script, ...args], { cwd: root, stdio: 'inherit' });
  }
}

function restoreCanonicalProjections() {
  runNodePipeline(PROJECTION_RENDER_PIPELINE);
}

function runPostStagePipeline(recordRenderedHtml) {
  runNodePipeline(PROJECTION_RENDER_PIPELINE);
  if (recordRenderedHtml) recordRenderedHtml();
  runNodePipeline(POST_STAGE_VALIDATION_PIPELINE);
}

function stageHandoff(envelope, options = {}) {
  const { hypothesis, bindings } = validateHandoff(envelope);
  const hypothesisPath = path.join(root, 'hypotheses', hypothesis.hypothesis_id, 'hypothesis.json');
  const hypothesisDir = path.dirname(hypothesisPath);
  const directoryIdentity = {};
  for (const name of ['hypotheses', 'evidence-bindings']) {
    const entry = lstatIfPresent(path.join(root, name));
    requireGate(entry && entry.isDirectory() && !entry.isSymbolicLink(), name + ' must be a real repository directory');
    directoryIdentity[name] = entry;
  }
  requireGate(!lstatIfPresent(hypothesisDir), hypothesis.hypothesis_id + ' directory already exists; refusing to modify or remove pre-existing research files');

  const newEvidence = [];
  for (const binding of bindings) {
    const relative = path.join('evidence-bindings', binding.evidence_id + '.json');
    const targetPath = path.join(root, relative);
    const existingEntry = lstatIfPresent(targetPath);
    if (existingEntry) {
      requireGate(existingEntry.isFile() && !existingEntry.isSymbolicLink(), relative + ' is not a regular file; symbolic links are blocked');
      const existing = readJson(relative);
      requireGate(canonicalJson(existing) === canonicalJson(binding), binding.evidence_id + ' conflicts with existing public evidence binding');
    } else {
      newEvidence.push({ targetPath, binding });
    }
  }

  const executePipeline = options.executePipeline || runPostStagePipeline;
  const restoreProjections = options.restoreProjections || restoreCanonicalProjections;
  const createdFiles = [];
  let directoryCreated = false;
  let candidateDirectoryIdentity = null;
  let pipelineStarted = false;
  const generatedPages = new Map();
  let easyReadDirectoryIdentity = null;
  const generatedHypothesisPage = path.join(hypothesisDir, 'index.html');
  const generatedEasyReadDir = path.join(hypothesisDir, 'easy-read');
  const generatedEasyReadPage = path.join(generatedEasyReadDir, 'index.html');
  const recordRenderedHtml = () => {
    requireGate(samePhysicalEntry(hypothesisDir, candidateDirectoryIdentity, 'directory'),
      'candidate directory changed before generated-page ownership could be recorded');
    const easyReadEntry = lstatIfPresent(generatedEasyReadDir);
    requireGate(easyReadEntry && easyReadEntry.isDirectory() && !easyReadEntry.isSymbolicLink(),
      'generated Easy Read directory is missing or unsafe');
    for (const pagePath of [generatedHypothesisPage, generatedEasyReadPage]) {
      const entry = lstatIfPresent(pagePath);
      requireGate(entry && entry.isFile() && !entry.isSymbolicLink(),
        'generated page is missing or unsafe: ' + path.relative(root, pagePath));
      generatedPages.set(pagePath, {
        identity: entry,
        digest: crypto.createHash('sha256').update(fs.readFileSync(pagePath)).digest('hex')
      });
    }
    easyReadDirectoryIdentity = easyReadEntry;
  };
  try {
    fs.mkdirSync(hypothesisDir);
    directoryCreated = true;
    candidateDirectoryIdentity = fs.lstatSync(hypothesisDir);
    requireGate(candidateDirectoryIdentity.isDirectory() && !candidateDirectoryIdentity.isSymbolicLink(),
      'candidate directory must remain a physical directory after creation');
    // Preflight checks are not sufficient if a canonical parent was swapped during staging.
    requireGate(samePhysicalEntry(path.join(root, 'hypotheses'), directoryIdentity.hypotheses, 'directory'),
      'hypotheses repository directory changed before candidate write');
    writeTrackedExclusiveFile(hypothesisPath, JSON.stringify(hypothesis, null, 2) + '\n', createdFiles);
    for (const { targetPath, binding } of newEvidence) {
      requireGate(samePhysicalEntry(path.join(root, 'evidence-bindings'), directoryIdentity['evidence-bindings'], 'directory'),
        'evidence-bindings repository directory changed before staged evidence write');
      writeTrackedExclusiveFile(targetPath, JSON.stringify(binding, null, 2) + '\n', createdFiles);
    }
    pipelineStarted = true;
    executePipeline(recordRenderedHtml);
  } catch (error) {
    // A raced directory must never be deleted when mkdir itself failed.
    if (!directoryCreated) {
      throw new PublicationTransactionBlocked('candidate directory creation failed without staging files: ' + error.message);
    }

    const cleanupErrors = [];
    const hypothesesRootSafe = samePhysicalEntry(path.join(root, 'hypotheses'), directoryIdentity.hypotheses, 'directory');
    const evidenceRootSafe = samePhysicalEntry(path.join(root, 'evidence-bindings'), directoryIdentity['evidence-bindings'], 'directory');
    const candidateDirectorySafe = hypothesesRootSafe
      && samePhysicalEntry(hypothesisDir, candidateDirectoryIdentity, 'directory');

    // Never delete a file after another process has replaced its original inode.
    // Likewise, do not traverse a swapped parent directory or symbolic link.
    for (const staged of [...createdFiles].reverse()) {
      const parentSafe = staged.targetPath === hypothesisPath ? candidateDirectorySafe : evidenceRootSafe;
      if (!parentSafe) {
        cleanupErrors.push('staging parent changed; preserving ' + path.relative(root, staged.targetPath));
        continue;
      }
      try {
        const entry = lstatIfPresent(staged.targetPath);
        if (!entry) continue;
        if (!samePhysicalEntry(staged.targetPath, staged.identity, 'file')) {
          cleanupErrors.push('staged file identity changed; preserving ' + path.relative(root, staged.targetPath));
          continue;
        }
        if (staged.digest) {
          const currentDigest = crypto.createHash('sha256').update(fs.readFileSync(staged.targetPath)).digest('hex');
          if (currentDigest !== staged.digest) {
            cleanupErrors.push('staged file contents changed after write; preserving ' + path.relative(root, staged.targetPath));
            continue;
          }
        }
        fs.rmSync(staged.targetPath, { force: true });
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError.message);
      }
    }

    // A replaced candidate directory can redirect path-based cleanup outside
    // the checkout. Retain it for human inspection instead of following it.
    if (pipelineStarted) {
      if (!candidateDirectorySafe) {
        cleanupErrors.push('candidate directory identity changed; generated output cleanup skipped');
      } else {
        try {
          removeKnownGeneratedHtml(generatedHypothesisPage, generatedPages.get(generatedHypothesisPage), cleanupErrors);
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError.message);
        }
        const easyReadDir = generatedEasyReadDir;
        try {
          const easyReadEntry = lstatIfPresent(easyReadDir);
          if (easyReadEntry) {
            if (!easyReadDirectoryIdentity || !samePhysicalEntry(easyReadDir, easyReadDirectoryIdentity, 'directory')) {
              cleanupErrors.push('generated Easy Read directory ownership unknown or changed; preserving it');
            } else {
              removeKnownGeneratedHtml(generatedEasyReadPage, generatedPages.get(generatedEasyReadPage), cleanupErrors);
              fs.rmdirSync(easyReadDir);
            }
          }
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError.message);
        }
      }
    }
    if (candidateDirectorySafe) {
      try {
        // Removal fails closed when unrelated material remains.
        fs.rmdirSync(hypothesisDir);
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError.message);
      }
    } else {
      cleanupErrors.push('candidate directory identity changed; directory removal skipped');
    }

    // Re-rendering against a partially cleaned working tree could consume or
    // overwrite unowned data. Resume projections only after complete cleanup.
    let restorationError = null;
    if (pipelineStarted) {
      if (!hypothesesRootSafe || !evidenceRootSafe || !candidateDirectorySafe || cleanupErrors.length > 0) {
        restorationError = new Error(cleanupErrors.length > 0
          ? 'candidate cleanup incomplete; projection restoration skipped pending inspection'
          : 'canonical data directory identity changed; projection restoration skipped for safety');
      } else {
        try {
          restoreProjections();
        } catch (restoreError) {
          restorationError = restoreError;
        }
      }
    }

    const phase = pipelineStarted ? 'post-stage rendering or validation failed' : 'initial candidate write failed';
    const complete = cleanupErrors.length === 0 && !restorationError;
    const message = phase + (complete ? '; candidate staging was rolled back: ' : '; candidate cleanup incomplete: ')
      + error.message
      + (pipelineStarted && !restorationError ? ' Canonical generated projections were restored.' : '')
      + (cleanupErrors.length ? ' Cleanup errors: ' + cleanupErrors.join(' | ') : '')
      + (restorationError ? ' Projection restoration also failed: ' + restorationError.message : '');
    throw new PublicationTransactionBlocked(message);
  }

  return {
    hypothesis_id: hypothesis.hypothesis_id,
    hypothesis_path: path.relative(root, hypothesisPath),
    new_evidence_ids: newEvidence.map(({ binding }) => binding.evidence_id),
    reused_evidence_ids: bindings.filter((binding) => !newEvidence.some(({ binding: created }) => created.evidence_id === binding.evidence_id)).map((binding) => binding.evidence_id),
    projection_pipeline: PROJECTION_RENDER_PIPELINE.map(({ script, args }) => [script, ...args].join(' ')),
    validation_pipeline: POST_STAGE_VALIDATION_PIPELINE.map(({ script, args }) => [script, ...args].join(' '))
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
  console.log('Staged and validated public candidate ' + result.hypothesis_id + '. No merge or scientific approval was performed.');
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
  SUPPORTED_CONTRACT_VERSIONS,
  TARGET_REPOSITORY,
  PROJECTION_RENDER_PIPELINE,
  POST_STAGE_VALIDATION_PIPELINE,
  PublicationTransactionBlocked,
  canonicalJson,
  computeHandoffDigest,
  validatePublicProjectionSafety,
  validateNewCandidateCanonicalContract,
  validateHandoff,
  restoreCanonicalProjections,
  runPostStagePipeline,
  stageHandoff
};
