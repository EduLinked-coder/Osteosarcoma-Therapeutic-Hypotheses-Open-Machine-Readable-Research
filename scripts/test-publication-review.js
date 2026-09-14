'use strict';

const assert = require('assert');
const {
  branchNameFor,
  buildPullRequestBody,
  buildPullRequestArgs,
  allowedReviewPaths,
  parseStatusPaths,
  assertAllowedChangedPaths,
  sanitizeOperationalMessage
} = require('./publication-review');

const id = 'OS-TH-0002';
assert.strictEqual(branchNameFor(id), 'publication/os-th-0002-candidate');
assert.throws(() => branchNameFor('OS-TH-2'), /valid stable hypothesis ID/);

const body = buildPullRequestBody(id);
assert.match(body, /scientific review remains required/i);
assert.match(body, /clinical_use:false/);
assert.match(body, /grants no evidence acceptance, disclosure, clinical, merge or publication authority/i);
assert.match(body, /handoff envelope is not committed or copied/i);

const plan = {
  base: 'main',
  branch: branchNameFor(id),
  title: 'Candidate public research hypothesis ' + id,
  body
};
const args = buildPullRequestArgs(plan);
assert.deepStrictEqual(args.slice(0, 2), ['pr', 'create']);
assert.ok(!args.includes('--draft'), 'publication review PR must be ready for review');
assert.ok(!args.includes('merge'), 'publication review orchestration must not invoke merge');
assert.ok(!args.includes('--fill'), 'publication review PR body must remain explicitly bounded');
assert.ok(args.includes('--base') && args.includes('--head'), 'publication review PR must bind an explicit base and bounded branch');

const allowed = allowedReviewPaths(id, ['PMID-12345678', 'DOI-10.1000%2Fexample']);
const expected = [
  'hypotheses/OS-TH-0002/hypothesis.json',
  'hypotheses/OS-TH-0002/index.html',
  'hypotheses/OS-TH-0002/easy-read/index.html',
  'evidence-bindings/PMID-12345678.json',
  'evidence-bindings/DOI-10.1000%2Fexample.json',
  'index.html',
  'evidence/index.html',
  'indexes/hypotheses.json',
  'activity/index.html',
  'indexes/evidence-events.json',
  'structured-data/hypotheses.jsonld',
  'manifest.json',
  'sitemap.xml'
];
for (const item of expected) assert.ok(allowed.has(item), 'missing allowlisted publication path ' + item);
assert.ok(!allowed.has('repository-manifest.json'));
assert.ok(!allowed.has('README.md'));
assert.ok(!allowed.has('.github/workflows/pages.yml'));

assert.doesNotThrow(() => assertAllowedChangedPaths(expected, allowed));
assert.throws(
  () => assertAllowedChangedPaths([...expected, 'README.md'], allowed),
  /non-allowlisted path\(s\): README\.md/
);
assert.throws(() => assertAllowedChangedPaths([], allowed), /produced no repository changes/);
assert.throws(() => allowedReviewPaths(id, ['bad/id']), /invalid evidence ID/);

assert.deepStrictEqual(
  parseStatusPaths('?? hypotheses/OS-TH-0002/hypothesis.json\n M index.html\n'),
  ['hypotheses/OS-TH-0002/hypothesis.json', 'index.html']
);

assert.strictEqual(
  sanitizeOperationalMessage('fatal: https://secret-value@github.com/owner/repo.git ghp_abcdefghijklmnopqrstuvwxyz'),
  'fatal: https://github.com/owner/repo.git [REDACTED_TOKEN]'
);

console.log('Publication review orchestration authority, ready-for-review PR, path-allowlist and redaction checks passed.');
