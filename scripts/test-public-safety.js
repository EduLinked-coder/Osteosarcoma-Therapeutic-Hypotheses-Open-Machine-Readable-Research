'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  scanStructuredValue,
  scanClinicalBoundaryLanguage,
  scanSecretMaterial,
  scanDuplicateJsonMembers,
  validateRepositoryPublicSafety,
  stagePagesSite
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

expectStructuredBlocked({ patient_name: 'Synthetic Example' }, /patientname/);
expectStructuredBlocked({ nested: { medical_record_number: 'synthetic-only' } }, /medicalrecordnumber/);
expectStructuredBlocked({ nested: { api_key: 'synthetic-only' } }, /apikey/);
expectStructuredBlocked({ nested: { client_id: 'synthetic-only' } }, /clientid/);
expectStructuredBlocked({ nested: { EDULINKED_APP_ID: 'synthetic-only' } }, /edulinkedappid/);
expectStructuredBlocked({ nested: { ENTERPRISE_APP_PRIVATE_KEY: 'synthetic-only' } }, /enterpriseappprivatekey/);
expectStructuredBlocked({ recommendation: 'The patient should start methotrexate.' }, /patient-directed treatment instruction/);
expectStructuredBlocked({ recommendation: 'For this patient, recommend switching to regimen X.' }, /patient-specific treatment recommendation/);
expectStructuredBlocked({ dosing: 'You should take 10 mg daily.' }, /patient-directed dosing instruction/);
expectStructuredBlocked({ claim: 'This treatment will benefit the patient.' }, /claim of individual patient benefit/);

// An arbitrary JSON property name may itself contain private identifiers.
// Validation diagnostics must report an opaque position, not that input.
const syntheticPrivateFieldName = 'SYNTHETIC_PRIVATE_FIELD_NAME_DO_NOT_ECHO';
const unsafeKeyPayload = {
  [syntheticPrivateFieldName]: {
    patient_name: 'Synthetic Example',
    recommendation: 'The patient should start methotrexate.'
  }
};
const unsafeKeyErrors = scanStructuredValue(unsafeKeyPayload, '$fixture');
assert.ok(unsafeKeyErrors.some((message) => message.includes('prohibited public field name')));
assert.ok(unsafeKeyErrors.some((message) => message.includes('patient-directed treatment instruction')));
assert.ok(unsafeKeyErrors.every((message) => !message.includes(syntheticPrivateFieldName)),
  'structured public-safety diagnostics must not echo untrusted property names');

const directClinicalErrors = scanClinicalBoundaryLanguage({
  [syntheticPrivateFieldName]: 'The patient should start methotrexate.'
}, '$fixture');
assert.ok(directClinicalErrors.some((message) => message.includes('patient-directed treatment instruction')));
assert.ok(directClinicalErrors.every((message) => !message.includes(syntheticPrivateFieldName)),
  'standalone clinical-language diagnostics must not echo untrusted property names');

expectSecretBlocked('prefix ' + '-----BEGIN ' + 'PRIVATE KEY-----' + ' suffix', /PEM private key/);
expectSecretBlocked('prefix ' + 'ghp_' + 'A'.repeat(30) + ' suffix', /GitHub access token/);
expectSecretBlocked('prefix ' + 'sk-' + 'A'.repeat(30) + ' suffix', /OpenAI-style API key/);
expectSecretBlocked('prefix ' + 'AKIA' + 'A'.repeat(16) + ' suffix', /AWS access key/);

assert.deepStrictEqual(scanSecretMaterial('No credential material is present here.', 'synthetic-fixture.txt'), []);

const textFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'osteosarcoma-public-safety-'));
try {
  const docsDir = path.join(textFixtureRoot, 'docs');
  fs.mkdirSync(docsDir, { recursive: true });
  const fixturePath = path.join(docsDir, 'synthetic.md');
  fs.writeFileSync(fixturePath, '# Synthetic\n\nThe patient should start methotrexate.\n', 'utf8');
  const unsafeResult = validateRepositoryPublicSafety(textFixtureRoot);
  assert.ok(
    unsafeResult.errors.some((message) => message.includes('docs/synthetic.md') && message.includes('patient-directed treatment instruction')),
    'expected human-readable public text to fail closed on patient-directed treatment language'
  );

  fs.writeFileSync(
    fixturePath,
    '# Synthetic\n\nThis is a research hypothesis only and does not recommend treatment for any patient.\n',
    'utf8'
  );
  assert.deepStrictEqual(validateRepositoryPublicSafety(textFixtureRoot).errors, []);

  const reviewDir = path.join(textFixtureRoot, 'review');
  fs.mkdirSync(reviewDir, { recursive: true });
  const reviewPath = path.join(reviewDir, 'index.html');
  fs.writeFileSync(
    reviewPath,
    '<!doctype html><html><body><main><h1>Protected review</h1><p>The patient should start methotrexate.</p></main></body></html>\n',
    'utf8'
  );
  const unsafeReviewResult = validateRepositoryPublicSafety(textFixtureRoot);
  assert.ok(
    unsafeReviewResult.errors.some((message) => message.includes('review/index.html') && message.includes('patient-directed treatment instruction')),
    'expected protected review projection to be included in the public text safety boundary'
  );

  fs.writeFileSync(
    reviewPath,
    '<!doctype html><html><body><main><h1>Protected review</h1><p>Known disagreement remains under human scientific review and is not clinical guidance.</p></main></body></html>\n',
    'utf8'
  );
  assert.deepStrictEqual(validateRepositoryPublicSafety(textFixtureRoot).errors, []);

  // Public JSON outside canonical machine roots must also enforce field-level
  // privacy screening; these paths are included in the deployed public site.
  const reviewMetadataPath = path.join(reviewDir, 'metadata.json');
  fs.writeFileSync(reviewMetadataPath, JSON.stringify({ patient_name: 'Synthetic only' }), 'utf8');
  assert.ok(
    validateRepositoryPublicSafety(textFixtureRoot).errors.some((message) =>
      message.includes('review/metadata.json') && message.includes('prohibited public field name')),
    'public review JSON must not bypass prohibited-field screening'
  );
  fs.writeFileSync(reviewMetadataPath, JSON.stringify({ status: 'public-research-candidate' }), 'utf8');
  assert.deepStrictEqual(validateRepositoryPublicSafety(textFixtureRoot).errors, []);
  fs.unlinkSync(reviewMetadataPath);

  const docsMetadataPath = path.join(docsDir, 'invalid-metadata.json');
  const syntheticMetadataMarker = 'SYNTHETIC_PRIVATE_METADATA_DO_NOT_ECHO';
  fs.writeFileSync(docsMetadataPath, '{"patient_name":' + syntheticMetadataMarker, 'utf8');
  const invalidMetadataResult = validateRepositoryPublicSafety(textFixtureRoot);
  assert.ok(
    invalidMetadataResult.errors.some((message) =>
      message.includes('docs/invalid-metadata.json') && message.includes('not valid JSON')),
    'invalid documentation JSON must fail with bounded diagnostics'
  );
  assert.ok(
    invalidMetadataResult.errors.every((message) => !message.includes(syntheticMetadataMarker)),
    'invalid public JSON must not echo its contents in diagnostics'
  );
  fs.unlinkSync(docsMetadataPath);
  assert.deepStrictEqual(validateRepositoryPublicSafety(textFixtureRoot).errors, []);

  // JSON.parse discards an earlier value when a key is repeated, but the
  // original value remains in the publicly served JSON file.
  const overwrittenPath = path.join(docsDir, 'overwritten-description.json');
  const overwrittenJson = '{"description":"The patient should start methotrexate.",' +
    '"description":"Research hypothesis only."}';
  assert.deepStrictEqual(scanStructuredValue(JSON.parse(overwrittenJson)), []);
  fs.writeFileSync(overwrittenPath, overwrittenJson, 'utf8');
  const overwrittenResult = validateRepositoryPublicSafety(textFixtureRoot);
  assert.ok(
    overwrittenResult.errors.some((message) =>
      message.includes('docs/overwritten-description.json') &&
      message.includes('patient-directed treatment instruction')),
    'raw JSON must be screened even when duplicate keys hide unsafe values from JSON.parse'
  );
  assert.ok(
    overwrittenResult.errors.every((message) => !message.includes('The patient should start methotrexate.')),
    'raw JSON safety diagnostics must not reproduce untrusted values'
  );
  fs.unlinkSync(overwrittenPath);
  assert.deepStrictEqual(validateRepositoryPublicSafety(textFixtureRoot).errors, []);

  // JSON.parse can overwrite an earlier nested object holding restricted data.
  const overwrittenStructuredPath = path.join(docsDir, 'overwritten-structured.json');
  const overwrittenStructuredJson =
    '{"metadata":{"patient_name":"SYNTHETIC_PRIVATE_MARKER_DO_NOT_ECHO"},"metadata":{}}';
  assert.deepStrictEqual(scanStructuredValue(JSON.parse(overwrittenStructuredJson)), []);
  fs.writeFileSync(overwrittenStructuredPath, overwrittenStructuredJson, 'utf8');
  const overwrittenStructuredResult = validateRepositoryPublicSafety(textFixtureRoot);
  assert.ok(overwrittenStructuredResult.errors.some((message) =>
    message.includes('docs/overwritten-structured.json') && message.includes('duplicate JSON member key')),
    'raw JSON must fail closed on overwritten restricted nested structures');
  assert.ok(overwrittenStructuredResult.errors.every((message) =>
    !message.includes('SYNTHETIC_PRIVATE_MARKER_DO_NOT_ECHO')),
    'duplicate member diagnostics must not echo hidden values');
  fs.unlinkSync(overwrittenStructuredPath);

  const escapedDuplicateJson = '{"status":"candidate","\\u0073tatus":"approved"}';
  assert.ok(scanDuplicateJsonMembers(escapedDuplicateJson).some((message) =>
    message.includes('duplicate JSON member key')),
    'escaped equivalent property names must be treated as duplicate JSON keys');
  assert.deepStrictEqual(scanDuplicateJsonMembers(
    '{"left":{"status":"one"},"right":{"status":"two"}}'), [],
    'reusing a key in distinct objects is valid');

  const encodedCredentialPath = path.join(docsDir, 'encoded-credential.json');
  const syntheticCredential = 'ghp_' + 'A'.repeat(30);
  const encodedCredentialJson = JSON.stringify({ note: syntheticCredential })
    .replace('ghp_', '\\u0067hp_');
  assert.ok(!encodedCredentialJson.includes(syntheticCredential),
    'fixture must conceal credential-like material from raw-text scanning');
  fs.writeFileSync(encodedCredentialPath, encodedCredentialJson, 'utf8');
  const encodedCredentialResult = validateRepositoryPublicSafety(textFixtureRoot);
  assert.ok(encodedCredentialResult.errors.some((message) =>
    message.includes('docs/encoded-credential.json') && message.includes('GitHub access token material')),
    'parsed JSON must be rechecked for escaped credential-like material');
  assert.ok(encodedCredentialResult.errors.every((message) => !message.includes(syntheticCredential)),
    'credential detection must not reproduce credential-like material');
  fs.unlinkSync(encodedCredentialPath);
  assert.deepStrictEqual(validateRepositoryPublicSafety(textFixtureRoot).errors, []);

  // Public text directories are shipped with the site. Text extensions beyond
  // Markdown/JSON must be scanned, and unknown file types must fail closed.
  const csvPath = path.join(docsDir, 'candidate-data.csv');
  fs.writeFileSync(csvPath, 'note\nThe patient should start methotrexate.\n', 'utf8');
  assert.ok(
    validateRepositoryPublicSafety(textFixtureRoot).errors.some((message) =>
      message.includes('docs/candidate-data.csv') && message.includes('patient-directed treatment instruction')),
    'public CSV content must not bypass the clinical-language safety scan'
  );
  fs.writeFileSync(csvPath, 'note\nResearch hypothesis only.\n', 'utf8');
  assert.deepStrictEqual(validateRepositoryPublicSafety(textFixtureRoot).errors, []);
  fs.unlinkSync(csvPath);

  const svgPath = path.join(docsDir, 'diagram.svg');
  fs.writeFileSync(svgPath, '<svg><text>The patient should start methotrexate.</text></svg>', 'utf8');
  assert.ok(
    validateRepositoryPublicSafety(textFixtureRoot).errors.some((message) =>
      message.includes('docs/diagram.svg') && message.includes('patient-directed treatment instruction')),
    'public SVG text must receive public safety screening'
  );
  fs.unlinkSync(svgPath);

  const unsupportedPath = path.join(docsDir, 'unreviewed-evidence.pdf');
  fs.writeFileSync(unsupportedPath, 'synthetic placeholder, not a PDF', 'utf8');
  assert.ok(
    validateRepositoryPublicSafety(textFixtureRoot).errors.some((message) =>
      message.includes('docs/unreviewed-evidence.pdf') && message.includes('unscanned file type')),
    'an unsupported public asset must fail closed rather than be silently omitted'
  );
  fs.unlinkSync(unsupportedPath);
  assert.deepStrictEqual(validateRepositoryPublicSafety(textFixtureRoot).errors, []);

  // Public roots must not silently omit symlinks, including dangling links.
  // An external target is not scanned or copied into the public projection.
  const outside = path.join(textFixtureRoot, 'outside-public-roots.md');
  fs.writeFileSync(outside, 'Synthetic outside-public-roots content.', 'utf8');
  const linkedFile = path.join(docsDir, 'linked.md');
  fs.symlinkSync(outside, linkedFile);
  assert.ok(
    validateRepositoryPublicSafety(textFixtureRoot).errors.some((message) =>
      message.includes('docs/linked.md') && message.includes('symbolic link')),
    'a public file symlink must be a controlled validation failure'
  );
  fs.unlinkSync(linkedFile);

  const danglingLink = path.join(docsDir, 'dangling.md');
  fs.symlinkSync(path.join(textFixtureRoot, 'nonexistent'), danglingLink);
  assert.ok(
    validateRepositoryPublicSafety(textFixtureRoot).errors.some((message) => message.includes('docs/dangling.md')),
    'a dangling public file symlink must fail closed'
  );
  fs.unlinkSync(danglingLink);

  fs.rmSync(reviewDir, { recursive: true });
  fs.symlinkSync(docsDir, reviewDir, 'dir');
  assert.ok(
    validateRepositoryPublicSafety(textFixtureRoot).errors.some((message) =>
      message.includes('review is a symbolic link')),
    'a symlinked public root must not bypass public payload scanning'
  );
  fs.unlinkSync(reviewDir);

  // Malformed public JSON must fail closed without disclosing its raw contents.
  const malformedPath = path.join(textFixtureRoot, 'manifest.json');
  const syntheticPrivateMarker = 'SYNTHETIC_PRIVATE_TEXT_DO_NOT_ECHO';
  fs.writeFileSync(malformedPath, '{"source":' + syntheticPrivateMarker + '}', 'utf8');
  const malformedResult = validateRepositoryPublicSafety(textFixtureRoot);
  assert.ok(
    malformedResult.errors.some((message) => message.includes('manifest.json') && message.includes('not valid JSON')),
    'malformed public JSON must be rejected with a path-specific diagnostic'
  );
  assert.ok(
    malformedResult.errors.every((message) => !message.includes(syntheticPrivateMarker)),
    'invalid JSON contents must never appear in scanner diagnostics'
  );
  fs.unlinkSync(malformedPath);
  assert.deepStrictEqual(validateRepositoryPublicSafety(textFixtureRoot).errors, []);
} finally {
  fs.rmSync(textFixtureRoot, { recursive: true, force: true });
}

// The Pages upload must be a strict, safety-scanned public-only projection.
const pagesFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'osteosarcoma-pages-fixture-'));
try {
  fs.mkdirSync(path.join(pagesFixtureRoot, 'schemas'), { recursive: true });
  fs.mkdirSync(path.join(pagesFixtureRoot, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(pagesFixtureRoot, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(pagesFixtureRoot, '.github', 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(pagesFixtureRoot, 'index.html'), '<main><h1>Research hypotheses</h1></main>\n');
  fs.writeFileSync(path.join(pagesFixtureRoot, 'manifest.json'), '{"purpose":"public research"}\n');
  fs.writeFileSync(path.join(pagesFixtureRoot, 'robots.txt'), 'User-agent: *\nAllow: /\n');
  fs.writeFileSync(path.join(pagesFixtureRoot, 'sitemap.xml'), '<urlset></urlset>\n');
  fs.writeFileSync(path.join(pagesFixtureRoot, 'schemas', 'therapeutic-hypothesis.schema.json'), '{"type":"object"}\n');
  fs.writeFileSync(path.join(pagesFixtureRoot, 'docs', 'public.md'), 'Public hypothesis only.\n');
  fs.writeFileSync(path.join(pagesFixtureRoot, 'scripts', 'internal-tool.js'), 'internal source, not a Pages asset\n');
  fs.writeFileSync(path.join(pagesFixtureRoot, '.github', 'workflows', 'private-automation.yml'), 'not a Pages asset\n');

  const staged = stagePagesSite(pagesFixtureRoot);
  assert.deepStrictEqual(staged.errors, [], 'valid public assets should stage without errors');
  assert.ok(staged.stagedFiles.includes('schemas/therapeutic-hypothesis.schema.json'),
    'machine-readable research schemas must remain available through Pages');
  assert.ok(fs.existsSync(path.join(staged.outputDir, 'docs', 'public.md')),
    'public documentation must be copied');
  assert.ok(!fs.existsSync(path.join(staged.outputDir, 'scripts')),
    'executable repository tooling must not be uploaded to Pages');
  assert.ok(!fs.existsSync(path.join(staged.outputDir, '.github')),
    'GitHub workflow and issue configuration must not be uploaded to Pages');

  // Simulate content changing after the source scan, during the copy operation.
  // A source-only scan would miss the unsafe bytes in the Pages artifact.
  const originalCopyFileSync = fs.copyFileSync;
  try {
    fs.copyFileSync = (...args) => {
      originalCopyFileSync(...args);
      if (args[1] === path.join(pagesFixtureRoot, '_pages_site', 'docs', 'public.md')) {
        fs.writeFileSync(args[1], 'The patient should start methotrexate.\n');
      }
    };
    const tampered = stagePagesSite(pagesFixtureRoot);
    assert.ok(tampered.errors.some((message) =>
      message.includes('Staged Pages artifact:') && message.includes('patient-directed treatment instruction')),
    'post-copy public-safety scan must reject content altered after the source scan');
    assert.ok(!fs.existsSync(tampered.outputDir),
      'post-copy safety failure must remove the incomplete Pages artifact');
  } finally {
    fs.copyFileSync = originalCopyFileSync;
  }

  // Pages uploads the entire staged directory. An unexpected root asset must
  // fail even though it is outside the public-root scanner's normal traversal.
  const copyBeforeUnexpectedAsset = fs.copyFileSync;
  try {
    fs.copyFileSync = (...args) => {
      copyBeforeUnexpectedAsset(...args);
      if (args[1] === path.join(pagesFixtureRoot, '_pages_site', 'docs', 'public.md')) {
        fs.writeFileSync(
          path.join(pagesFixtureRoot, '_pages_site', 'unapproved-artifact.bin'),
          'Synthetic unapproved asset; no private data.\n'
        );
      }
    };
    const unexpectedAsset = stagePagesSite(pagesFixtureRoot);
    assert.ok(unexpectedAsset.errors.some((message) =>
      message.includes('unapproved file')),
      'a root-level unscanned asset must block the Pages upload');
    assert.ok(!fs.existsSync(unexpectedAsset.outputDir),
      'unexpected Pages files must cause the entire staged artifact to be cleared');
  } finally {
    fs.copyFileSync = copyBeforeUnexpectedAsset;
  }

  fs.writeFileSync(path.join(pagesFixtureRoot, 'docs', 'unsafe.md'),
    'The patient should start methotrexate.\n');
  const blocked = stagePagesSite(pagesFixtureRoot);
  assert.ok(blocked.errors.some((message) => message.includes('patient-directed treatment instruction')),
    'unsafe public material must block staging');
  assert.ok(!fs.existsSync(blocked.outputDir),
    'failed staging must clear any previously produced public artifact');
} finally {
  fs.rmSync(pagesFixtureRoot, { recursive: true, force: true });
}

console.log('Public safety payload tests passed: prohibited fields, high-confidence credential material and patient-directed clinical language fail closed across structured and human-readable public surfaces, including the protected review projection.');
