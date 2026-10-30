'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
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

  fs.writeFileSync(target, JSON.stringify({ hypothesis_id: 'OS-TH-0002' }));
  expectFailure('mismatched canonical target ID', 'contributions/OS-CONTRIB-0001.json', live, 'does not match canonical hypothesis_id');
  fs.writeFileSync(target, '{bad-json');
  expectFailure('unreadable canonical target', 'contributions/OS-CONTRIB-0001.json', live, 'not readable JSON');

  console.log('Contribution object identity, direct-path and target-reference fail-closed fixtures passed (16 checks).');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
