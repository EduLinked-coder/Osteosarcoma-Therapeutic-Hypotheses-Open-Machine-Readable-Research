'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const sourceRoot = process.cwd();
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'osteosarcoma-evidence-events-'));

const copyFile = (rel) => {
  const source = path.join(sourceRoot, rel);
  const target = path.join(fixtureRoot, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
};

const writeJson = (rel, value) => {
  const target = path.join(fixtureRoot, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(value, null, 2) + '\n', 'utf8');
};

const runValidator = () => spawnSync(process.execPath, ['scripts/validate-evidence-events.js'], {
  cwd: fixtureRoot,
  encoding: 'utf8'
});

const expectPass = (label) => {
  const result = runValidator();
  assert.strictEqual(result.status, 0, label + ' should pass.\n' + result.stdout + result.stderr);
};

const expectFail = (label, expectedText) => {
  const result = runValidator();
  assert.notStrictEqual(result.status, 0, label + ' should fail.');
  const output = result.stdout + result.stderr;
  assert.ok(output.includes(expectedText), label + ' should report ' + JSON.stringify(expectedText) + '.\n' + output);
};

try {
  for (const rel of [
    'scripts/validate-evidence-events.js',
    'scripts/lib/schema-lite.js',
    'schemas/evidence-change-event.schema.json',
    'indexes/hypotheses.json',
    'hypotheses/OS-TH-0001/hypothesis.json',
    'evidence-bindings/PMID-42574989.json',
    'evidence-bindings/PMID-42577778.json'
  ]) copyFile(rel);

  const canonicalRel = 'hypotheses/OS-TH-0001/hypothesis.json';
  const canonicalRaw = fs.readFileSync(path.join(fixtureRoot, canonicalRel), 'utf8');
  const canonical = JSON.parse(canonicalRaw);
  const digest = crypto.createHash('sha256').update(canonicalRaw).digest('hex');
  const currentState = {
    canonical_object_sha256: digest,
    canonical_object_updated_at: canonical.provenance.updated_at,
    evidence_stage: canonical.evidence_stage,
    review_state: canonical.review_state.status,
    publication_class: canonical.review_state.publication_class,
    uncertainty_level: canonical.uncertainty.level,
    ranking_status: canonical.ranking.status,
    ranking_score: canonical.ranking.score,
    supersession_status: canonical.supersession.status
  };

  const validEvent = {
    event_schema_version: '1.0.0',
    event_id: 'OS-EVENT-0001',
    hypothesis_id: 'OS-TH-0001',
    event_type: 'EVIDENCE_ADDED',
    recorded_at: '2026-09-13T05:00:00+10:00',
    evidence_ids: ['PMID-42574989'],
    change_summary: 'Synthetic test fixture records an existing public evidence binding without changing scientific state.',
    previous_event_id: null,
    hypothesis_state_before: { ...currentState },
    hypothesis_state_after: { ...currentState },
    impact_assessment: {
      ranking_recalculation_required: false,
      uncertainty_review_required: false,
      review_state_review_required: false,
      supersession_review_required: false,
      withdrawal_review_required: false,
      reason: 'Test fixture exercises validator behaviour without representing a real scientific evidence change.'
    },
    scientific_decision: {
      status: 'NOT_REQUIRED',
      authority_reference: null,
      decision_summary: 'No scientific decision is represented by this temporary validator fixture.'
    },
    provenance: {
      recorded_from: 'repository-maintenance',
      source_refs: ['temporary-validator-test-fixture'],
      recorded_by: 'automated-validator-test'
    },
    append_only: true,
    publication_authority_transferred: false,
    clinical_use: false
  };

  writeJson('evidence-events/OS-EVENT-0001.json', validEvent);
  expectPass('valid public-safe event');

  writeJson('evidence-events/OS-EVENT-0001.json', { ...validEvent, clinical_use: true });
  expectFail('clinical-use escalation', 'must explicitly set clinical_use:false');

  const missingEvidence = { ...validEvent, evidence_ids: ['PMID-99999999'] };
  writeJson('evidence-events/OS-EVENT-0001.json', missingEvidence);
  expectFail('missing public evidence binding', 'references missing public evidence binding PMID-99999999');

  const protectedChange = JSON.parse(JSON.stringify(validEvent));
  protectedChange.event_type = 'HYPOTHESIS_REVISION_RECORDED';
  protectedChange.hypothesis_state_before.review_state = 'reviewed';
  protectedChange.hypothesis_state_before.publication_class = 'reviewed-public-hypothesis';
  protectedChange.scientific_decision = {
    status: 'PENDING_HUMAN_REVIEW',
    authority_reference: null,
    decision_summary: 'Protected lifecycle changes remain pending human scientific authority.'
  };
  writeJson('evidence-events/OS-EVENT-0001.json', protectedChange);
  expectFail('protected lifecycle change without human decision', 'changes a protected scientific/publication lifecycle state without a recorded human decision');

  const evidenceStageChange = JSON.parse(JSON.stringify(validEvent));
  evidenceStageChange.event_type = 'HYPOTHESIS_REVISION_RECORDED';
  evidenceStageChange.hypothesis_state_before.evidence_stage = 'computational';
  evidenceStageChange.scientific_decision = {
    status: 'PENDING_HUMAN_REVIEW',
    authority_reference: null,
    decision_summary: 'Evidence maturity change remains pending human scientific authority.'
  };
  writeJson('evidence-events/OS-EVENT-0001.json', evidenceStageChange);
  expectFail('evidence maturity change without human decision', 'changes a protected scientific/publication lifecycle state without a recorded human decision');

  const brokenChain = JSON.parse(JSON.stringify(validEvent));
  brokenChain.previous_event_id = 'OS-EVENT-9999';
  writeJson('evidence-events/OS-EVENT-0001.json', brokenChain);
  expectFail('missing previous event', 'references missing previous event OS-EVENT-9999');

  writeJson('evidence-events/OS-EVENT-0001.json', validEvent);
  const cycleEvent2 = JSON.parse(JSON.stringify(validEvent));
  cycleEvent2.event_id = 'OS-EVENT-0002';
  cycleEvent2.previous_event_id = 'OS-EVENT-0003';
  cycleEvent2.change_summary = 'Synthetic disconnected-cycle fixture event two.';
  const cycleEvent3 = JSON.parse(JSON.stringify(validEvent));
  cycleEvent3.event_id = 'OS-EVENT-0003';
  cycleEvent3.previous_event_id = 'OS-EVENT-0002';
  cycleEvent3.change_summary = 'Synthetic disconnected-cycle fixture event three.';
  writeJson('evidence-events/OS-EVENT-0002.json', cycleEvent2);
  writeJson('evidence-events/OS-EVENT-0003.json', cycleEvent3);
  expectFail('disconnected cyclic history', 'contains disconnected or cyclic events outside the terminal chain');

  console.log('Living evidence validator fail-closed tests passed.');
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
