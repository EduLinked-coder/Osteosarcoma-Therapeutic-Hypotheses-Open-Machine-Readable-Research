'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const {
  TARGET_REPOSITORY,
  validateHandoff,
  stageHandoff
} = require('./publication-transaction');

const root = process.cwd();
const STABLE_ID = /^OS-TH-[0-9]{4}$/;
const DEFAULT_BASE_BRANCH = 'main';
const SHARED_GENERATED_PATHS = Object.freeze([
  'index.html',
  'evidence/index.html',
  'indexes/hypotheses.json',
  'activity/index.html',
  'indexes/evidence-events.json',
  'structured-data/hypotheses.jsonld',
  'manifest.json',
  'sitemap.xml'
]);

class PublicationReviewBlocked extends Error {}

function requireGate(condition, message) {
  if (!condition) throw new PublicationReviewBlocked(message);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
}

function sanitizeOperationalMessage(value) {
  return String(value || '')
    .replace(/https:\/\/[^@\s/]+@github\.com\//gi, 'https://github.com/')
    .replace(/(gh[pousr]_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{16,})/g, '[REDACTED_TOKEN]')
    .trim();
}

function exec(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options
    }).trim();
  } catch (error) {
    const detail = sanitizeOperationalMessage(error.stderr || error.message);
    throw new PublicationReviewBlocked(command + ' command failed' + (detail ? ': ' + detail : '.'));
  }
}

function git(args) {
  return exec('git', args);
}

function branchNameFor(hypothesisId) {
  requireGate(STABLE_ID.test(hypothesisId || ''), 'publication review requires a valid stable hypothesis ID');
  return 'publication/' + hypothesisId.toLowerCase() + '-candidate';
}

function buildPullRequestBody(hypothesisId) {
  requireGate(STABLE_ID.test(hypothesisId || ''), 'pull-request body requires a valid stable hypothesis ID');
  return [
    '## Candidate public research projection',
    '',
    'This draft pull request stages `' + hypothesisId + '` through the repository\'s existing fail-closed public handoff and deterministic projection transaction.',
    '',
    '### Authority boundary',
    '',
    '- candidate public research only; scientific review remains required;',
    '- `clinical_use:false` remains mandatory;',
    '- research priority is not expected patient benefit;',
    '- the private/source handoff envelope is not committed or copied into this public repository;',
    '- this draft PR grants no evidence acceptance, disclosure, clinical, merge or publication authority.',
    '',
    '### Review',
    '',
    'Review the canonical hypothesis object, public evidence bindings, generated human/machine projections, uncertainty and contradictory-evidence state. Merge remains an explicit human action.',
    ''
  ].join('\n');
}

function buildReviewPlan(envelope) {
  const { hypothesis, bindings } = validateHandoff(envelope);
  const hypothesisId = hypothesis.hypothesis_id;
  return {
    hypothesis_id: hypothesisId,
    branch: branchNameFor(hypothesisId),
    base: DEFAULT_BASE_BRANCH,
    title: 'Candidate public research hypothesis ' + hypothesisId,
    body: buildPullRequestBody(hypothesisId),
    evidence_binding_count: bindings.length,
    draft: true,
    merge_performed: false,
    publication_authority_granted: false
  };
}

function buildPullRequestArgs(plan) {
  return [
    'pr', 'create',
    '--draft',
    '--base', plan.base,
    '--head', plan.branch,
    '--title', plan.title,
    '--body', plan.body
  ];
}

function allowedReviewPaths(hypothesisId, newEvidenceIds = []) {
  requireGate(STABLE_ID.test(hypothesisId || ''), 'path allowlist requires a valid stable hypothesis ID');
  const paths = new Set(SHARED_GENERATED_PATHS);
  paths.add('hypotheses/' + hypothesisId + '/hypothesis.json');
  paths.add('hypotheses/' + hypothesisId + '/index.html');
  paths.add('hypotheses/' + hypothesisId + '/easy-read/index.html');
  for (const evidenceId of newEvidenceIds) {
    requireGate(typeof evidenceId === 'string' && evidenceId.length > 0 && !evidenceId.includes('/') && !evidenceId.includes('\\'), 'invalid evidence ID in publication review path allowlist');
    paths.add('evidence-bindings/' + evidenceId + '.json');
  }
  return paths;
}

function parseStatusPaths(statusText) {
  return String(statusText || '')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const value = line.slice(3);
      return value.includes(' -> ') ? value.split(' -> ').at(-1) : value;
    });
}

function assertAllowedChangedPaths(changedPaths, allowedPaths) {
  requireGate(changedPaths.length > 0, 'publication staging produced no repository changes');
  const unexpected = changedPaths.filter((item) => !allowedPaths.has(item));
  requireGate(unexpected.length === 0, 'publication staging changed non-allowlisted path(s): ' + unexpected.join(', '));
}

function assertCanonicalOrigin() {
  const origin = git(['remote', 'get-url', 'origin']);
  const https = 'https://github.com/' + TARGET_REPOSITORY + '.git';
  const httpsNoGit = 'https://github.com/' + TARGET_REPOSITORY;
  const ssh = 'git@github.com:' + TARGET_REPOSITORY + '.git';
  requireGate([https, httpsNoGit, ssh].includes(origin), 'origin must be the canonical target repository before publication review orchestration');
}

function prepareCleanMain() {
  assertCanonicalOrigin();
  requireGate(git(['branch', '--show-current']) === DEFAULT_BASE_BRANCH, 'publication review must start on main');
  requireGate(git(['status', '--porcelain=v1', '--untracked-files=all']) === '', 'publication review requires a clean working tree; keep the handoff envelope outside the repository checkout');
  exec('git', ['fetch', '--quiet', 'origin', DEFAULT_BASE_BRANCH]);
  const localHead = git(['rev-parse', 'HEAD']);
  const remoteHead = git(['rev-parse', 'origin/' + DEFAULT_BASE_BRANCH]);
  requireGate(localHead === remoteHead, 'local main must exactly match origin/main before publication review orchestration');
  return localHead;
}

function assertBranchAvailable(branch) {
  const local = spawnSync('git', ['show-ref', '--verify', '--quiet', 'refs/heads/' + branch], { cwd: root });
  requireGate(local.status !== 0, 'local publication branch already exists: ' + branch);
  const remote = git(['ls-remote', '--heads', 'origin', 'refs/heads/' + branch]);
  requireGate(remote === '', 'remote publication branch already exists: ' + branch);
}

function cleanupUncommittedCandidate(baseSha, branch, result) {
  try {
    execFileSync('git', ['reset', '--hard', baseSha], { cwd: root, stdio: 'ignore' });
    const removable = ['hypotheses/' + result.hypothesis_id, ...(result.new_evidence_ids || []).map((id) => 'evidence-bindings/' + id + '.json')];
    execFileSync('git', ['clean', '-fd', '--', ...removable], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['switch', DEFAULT_BASE_BRANCH], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['branch', '-D', branch], { cwd: root, stdio: 'ignore' });
  } catch {
    // Cleanup is best-effort. The caller reports the blocked transaction without exposing command output.
  }
}

function openDraftPullRequest(envelope) {
  const plan = buildReviewPlan(envelope);
  const baseSha = prepareCleanMain();
  assertBranchAvailable(plan.branch);
  git(['switch', '-c', plan.branch]);

  let result = null;
  let committed = false;
  try {
    result = stageHandoff(envelope);
    const changedPaths = parseStatusPaths(git(['status', '--porcelain=v1', '--untracked-files=all']));
    const allowed = allowedReviewPaths(result.hypothesis_id, result.new_evidence_ids);
    assertAllowedChangedPaths(changedPaths, allowed);

    exec('git', ['add', '--', ...changedPaths]);
    const stagedPaths = git(['diff', '--cached', '--name-only']).split(/\r?\n/).filter(Boolean);
    assertAllowedChangedPaths(stagedPaths, allowed);
    requireGate(stagedPaths.length === changedPaths.length && stagedPaths.every((item) => changedPaths.includes(item)), 'staged publication review paths do not match validated working-tree paths');

    exec('git', ['commit', '-m', 'Stage public research candidate ' + result.hypothesis_id]);
    committed = true;
    exec('git', ['push', '--set-upstream', 'origin', plan.branch]);
    const prUrl = exec('gh', buildPullRequestArgs(plan));
    requireGate(/^https:\/\/github\.com\/.+\/pull\/[0-9]+$/.test(prUrl), 'GitHub did not return a pull-request URL');

    return {
      ...plan,
      base_sha: baseSha,
      commit_sha: git(['rev-parse', 'HEAD']),
      pull_request_url: prUrl,
      staged_paths: stagedPaths,
      new_evidence_ids: result.new_evidence_ids,
      reused_evidence_ids: result.reused_evidence_ids
    };
  } catch (error) {
    if (!committed && result) cleanupUncommittedCandidate(baseSha, plan.branch, result);
    throw error;
  }
}

function cli() {
  const [mode, envelopePath] = process.argv.slice(2);
  requireGate(['--plan', '--open-draft-pr'].includes(mode) && envelopePath, 'usage: node scripts/publication-review.js --plan|--open-draft-pr <public-safe-handoff.json>');
  const envelope = readJson(envelopePath);

  if (mode === '--plan') {
    const plan = buildReviewPlan(envelope);
    console.log(JSON.stringify({
      hypothesis_id: plan.hypothesis_id,
      branch: plan.branch,
      base: plan.base,
      title: plan.title,
      evidence_binding_count: plan.evidence_binding_count,
      draft: true,
      merge_performed: false,
      publication_authority_granted: false
    }, null, 2));
    return;
  }

  const result = openDraftPullRequest(envelope);
  console.log('Opened bounded draft publication review for ' + result.hypothesis_id + '. No merge or publication approval was performed.');
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  try {
    cli();
  } catch (error) {
    console.error('PUBLICATION REVIEW BLOCKED: ' + sanitizeOperationalMessage(error.message));
    process.exitCode = 1;
  }
}

module.exports = {
  PublicationReviewBlocked,
  SHARED_GENERATED_PATHS,
  branchNameFor,
  buildPullRequestBody,
  buildReviewPlan,
  buildPullRequestArgs,
  allowedReviewPaths,
  parseStatusPaths,
  assertAllowedChangedPaths,
  sanitizeOperationalMessage,
  openDraftPullRequest
};
