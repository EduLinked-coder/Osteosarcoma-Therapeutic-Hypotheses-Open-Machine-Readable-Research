'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { discoverContributionFiles, validateContributionObjectIdentity } = require('./lib/contribution-object-integrity');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'osteosarcoma-contribution-object-'));
const target = path.join(root, 'hypotheses/OS-TH-0001/hypothesis.json');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify({ hypothesis_id: 'OS-TH-0001' }));

function check(relativePath, object, liveIds = new Set(), exampleIds = new Set()) {
  return validateContributionObjectIdentity({ root, relativePath, object, liveIds, exampleIds });
}
function expectFailure(label, relativePath, object, text) {
  const errors = check(relativePath, object);
  assert.ok(errors.some((error) => error.includes(text)), label + ': ' + errors.join(' | '));
}

try {
  const live = { contribution_id: 'OS-CONTRIB-0001', target_hypothesis_id: 'OS-TH-0001', state: 'SUBMITTED' };
  const example = { ...live, example: true };
  const liveIds = new Set();
  const exampleIds = new Set();
  assert.deepStrictEqual(check('examples/contributions/submitted.example.json', example, liveIds, exampleIds), []);
  assert.deepStrictEqual(check('contributions/OS-CONTRIB-0001.json', live, liveIds, exampleIds), [], 'template example must not reserve the first live stable ID');
  assert.deepStrictEqual(check('contributions/OS-CONTRIB-0002.json', { ...live, contribution_id: 'OS-CONTRIB-0002', target_hypothesis_id: null }), [], 'new hypothesis proposal may have an unresolved target');
  assert.ok(check('contributions/OS-CONTRIB-0001.json', live, liveIds, exampleIds).some((error) => error.includes('duplicates contribution_id')), 'duplicate live stable ID must fail');
  expectFailure('filename mismatch', 'contributions/wrong.json', live, 'filename must match contribution_id');
  expectFailure('nested live filename path', 'contributions/nested/OS-CONTRIB-0001.json', live, 'filename must match contribution_id');
  expectFailure('orphaned target', 'contributions/OS-CONTRIB-0001.json', { ...live, target_hypothesis_id: 'OS-TH-9999' }, 'references missing canonical hypothesis');
  expectFailure('live example leakage', 'contributions/OS-CONTRIB-0001.json', example, 'live contribution must not be marked example:true');
  expectFailure('template lacks example marker', 'examples/contributions/submitted.example.json', live, 'template example must explicitly set example:true');
  expectFailure('template falsely reviewed', 'examples/contributions/submitted.example.json', { ...example, state: 'ACCEPTED' }, 'template example must remain SUBMITTED');
  expectFailure('malformed contribution ID', 'contributions/OS-CONTRIB-0001.json', { ...live, contribution_id: '../../secret' }, 'invalid contribution_id');
  expectFailure('non-object contribution', 'contributions/OS-CONTRIB-0001.json', null, 'must be a JSON object');

  const exampleDir = path.join(root, 'examples/contributions');
  const liveDir = path.join(root, 'contributions');
  fs.mkdirSync(exampleDir, { recursive: true });
  fs.mkdirSync(liveDir, { recursive: true });
  fs.writeFileSync(path.join(exampleDir, 'submitted.example.json'), '{}');
  fs.writeFileSync(path.join(liveDir, 'OS-CONTRIB-0001.json'), '{}');
  assert.deepStrictEqual(discoverContributionFiles(root), {
    files: ['contributions/OS-CONTRIB-0001.json', 'examples/contributions/submitted.example.json'],
    errors: []
  }, 'only direct governed JSON files are discovered');
  fs.mkdirSync(path.join(liveDir, 'nested'));
  assert.ok(discoverContributionFiles(root).errors.some((error) => error.includes('contributions/nested')), 'nested live contribution directory must fail');
  fs.rmdirSync(path.join(liveDir, 'nested'));
  fs.symlinkSync(target, path.join(liveDir, 'alias.json'));
  assert.ok(discoverContributionFiles(root).errors.some((error) => error.includes('contributions/alias.json')), 'symbolic-link contribution must fail');
  fs.unlinkSync(path.join(liveDir, 'alias.json'));
  fs.writeFileSync(path.join(liveDir, 'unreviewed.txt'), 'unguarded contribution');
  assert.ok(discoverContributionFiles(root).errors.some((error) => error.includes('unvalidated non-JSON file')), 'unvalidated direct non-JSON contribution must fail');
  fs.unlinkSync(path.join(liveDir, 'unreviewed.txt'));
  fs.rmSync(liveDir, { recursive: true });
  fs.symlinkSync(exampleDir, liveDir, 'dir');
  assert.ok(discoverContributionFiles(root).errors.some((error) => error.includes('contributions must be a real directory')), 'symlinked live contribution root must fail');
  fs.unlinkSync(liveDir);
  fs.mkdirSync(liveDir);

  fs.writeFileSync(target, JSON.stringify({ hypothesis_id: 'OS-TH-0002' }));
  expectFailure('mismatched canonical target ID', 'contributions/OS-CONTRIB-0001.json', live, 'does not match canonical hypothesis_id');
  fs.writeFileSync(target, '{bad-json');
  expectFailure('unreadable canonical target', 'contributions/OS-CONTRIB-0001.json', live, 'not readable JSON');
  fs.unlinkSync(target);
  fs.symlinkSync(path.join(exampleDir, 'submitted.example.json'), target);
  expectFailure('symlinked canonical target', 'contributions/OS-CONTRIB-0001.json', live, 'must be a regular non-symlink file');

  // Test the actual CLI. A malformed or non-object public contribution must
  // fail with a path-specific diagnostic, not an uncaught Node exception.
  const schemaDir = path.join(root, 'schemas');
  fs.mkdirSync(schemaDir, { recursive: true });
  fs.copyFileSync(
    path.join(__dirname, '../schemas/research-contribution.schema.json'),
    path.join(schemaDir, 'research-contribution.schema.json')
  );
  for (const [payload, expected] of [
    ['{broken', 'has invalid JSON syntax.'],
    ['null', 'contribution must be a JSON object.'],
    ['[]', 'contribution must be a JSON object.']
  ]) {
    fs.writeFileSync(path.join(liveDir, 'OS-CONTRIB-0001.json'), payload);
    const result = spawnSync(process.execPath, [path.join(__dirname, 'validate-contributions.js')], {
      cwd: root, encoding: 'utf8'
    });
    assert.strictEqual(result.status, 1, 'invalid contribution content must fail closed');
    assert.ok(
      result.stderr.includes('CONTRIBUTION VALIDATION FAILED: contributions/OS-CONTRIB-0001.json ' + expected),
      'invalid contribution must produce a bounded path-specific diagnostic: ' + result.stderr
    );
    assert.ok(!/\n\s+at /.test(result.stderr), 'invalid contribution must not cause an uncaught stack trace');
  }
  // Schema-invalid source_refs used to raise an uncaught TypeError for
  // numbers and objects, despite the schema error already being recorded.
  // The CLI must instead provide a controlled path-specific diagnostic.
  const malformedRefsContribution = JSON.parse(fs.readFileSync(
    path.join(__dirname, '../examples/contributions/submitted.example.json'), 'utf8'
  ));
  delete malformedRefsContribution.example;
  malformedRefsContribution.target_hypothesis_id = null;
  for (const malformedRefs of [42, { url: 'https://example.org' }, 'https://example.org']) {
    malformedRefsContribution.proposal.source_refs = malformedRefs;
    fs.writeFileSync(path.join(liveDir, 'OS-CONTRIB-0001.json'), JSON.stringify(malformedRefsContribution));
    const result = spawnSync(process.execPath, [path.join(__dirname, 'validate-contributions.js')], {
      cwd: root, encoding: 'utf8'
    });
    assert.strictEqual(result.status, 1, 'invalid source_refs type must fail closed');
    assert.ok(
      result.stderr.includes('CONTRIBUTION VALIDATION FAILED: contributions/OS-CONTRIB-0001.json proposal.source_refs must be an array of public http(s) URLs.'),
      'invalid source_refs type must produce a bounded path-specific diagnostic: ' + result.stderr
    );
    assert.ok(!/\n\s+at /.test(result.stderr), 'invalid source_refs type must not produce a Node exception stack');
  }
  console.log('Contribution identity and path-integrity fail-closed fixtures passed (26 checks).');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
