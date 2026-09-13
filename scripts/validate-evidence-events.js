'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { validateJsonSchema } = require('./lib/schema-lite');

const root = process.cwd();
const schema = JSON.parse(fs.readFileSync(path.join(root, 'schemas/evidence-change-event.schema.json'), 'utf8'));
const index = JSON.parse(fs.readFileSync(path.join(root, 'indexes/hypotheses.json'), 'utf8'));
const eventDir = path.join(root, 'evidence-events');
let failed = false;

const fail = (message) => {
  console.error('EVIDENCE EVENT VALIDATION FAILED: ' + message);
  failed = true;
};

const hypothesisFiles = new Map();
for (const entry of index.hypotheses || []) {
  hypothesisFiles.set(entry.hypothesis_id, entry.canonical_object_path);
}

const evidenceIds = new Set();
const evidenceDir = path.join(root, 'evidence-bindings');
if (fs.existsSync(evidenceDir)) {
  for (const filename of fs.readdirSync(evidenceDir).filter((name) => name.endsWith('.json'))) {
    const binding = JSON.parse(fs.readFileSync(path.join(evidenceDir, filename), 'utf8'));
    if (binding.evidence_id) evidenceIds.add(binding.evidence_id);
  }
}

const eventFiles = fs.existsSync(eventDir)
  ? fs.readdirSync(eventDir).filter((name) => name.endsWith('.json')).sort()
  : [];
const events = new Map();

for (const filename of eventFiles) {
  const filepath = path.join(eventDir, filename);
  let event;
  try {
    event = JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch (error) {
    fail(filename + ' is not valid JSON: ' + error.message);
    continue;
  }

  for (const error of validateJsonSchema(schema, schema, event, filename)) fail(error);
  if (!event.event_id) continue;
  if (events.has(event.event_id)) fail('Duplicate event ID: ' + event.event_id + '.');
  events.set(event.event_id, event);

  if (filename !== event.event_id + '.json') fail(filename + ' must be named ' + event.event_id + '.json.');
  if (!hypothesisFiles.has(event.hypothesis_id)) fail(event.event_id + ' references unknown hypothesis ' + event.hypothesis_id + '.');
  for (const evidenceId of event.evidence_ids || []) {
    if (!evidenceIds.has(evidenceId)) fail(event.event_id + ' references missing public evidence binding ' + evidenceId + '.');
  }
  if (event.previous_event_id === event.event_id) fail(event.event_id + ' cannot reference itself as previous_event_id.');
  if (event.append_only !== true) fail(event.event_id + ' must explicitly set append_only:true.');
  if (event.publication_authority_transferred !== false) fail(event.event_id + ' must not transfer publication authority.');
  if (event.clinical_use !== false) fail(event.event_id + ' must explicitly set clinical_use:false.');

  const decision = event.scientific_decision || {};
  const authorityReference = typeof decision.authority_reference === 'string' ? decision.authority_reference.trim() : '';
  if (decision.status === 'RECORDED_HUMAN_DECISION' && !authorityReference) {
    fail(event.event_id + ' records a human scientific decision without an attributable authority_reference.');
  }
  if (decision.status !== 'RECORDED_HUMAN_DECISION' && authorityReference) {
    fail(event.event_id + ' has an authority_reference without RECORDED_HUMAN_DECISION status.');
  }

  const before = event.hypothesis_state_before || {};
  const after = event.hypothesis_state_after || {};
  const protectedFields = ['evidence_stage', 'review_state', 'publication_class', 'supersession_status'];
  const protectedChanged = protectedFields.some((field) => before[field] !== after[field]);
  if (protectedChanged && decision.status !== 'RECORDED_HUMAN_DECISION') {
    fail(event.event_id + ' changes a protected scientific/publication lifecycle state without a recorded human decision.');
  }
  if (['SUPERSESSION_RECORDED', 'WITHDRAWAL_RECORDED'].includes(event.event_type) && decision.status !== 'RECORDED_HUMAN_DECISION') {
    fail(event.event_id + ' records supersession/withdrawal without attributable human scientific authority.');
  }
}

for (const event of events.values()) {
  if (event.previous_event_id !== null) {
    const previous = events.get(event.previous_event_id);
    if (!previous) {
      fail(event.event_id + ' references missing previous event ' + event.previous_event_id + '.');
    } else if (previous.hypothesis_id !== event.hypothesis_id) {
      fail(event.event_id + ' previous_event_id crosses hypothesis boundaries.');
    }
  }
}

const eventsByHypothesis = new Map();
for (const event of events.values()) {
  if (!eventsByHypothesis.has(event.hypothesis_id)) eventsByHypothesis.set(event.hypothesis_id, []);
  eventsByHypothesis.get(event.hypothesis_id).push(event);
}

for (const [hypothesisId, hypothesisEvents] of eventsByHypothesis.entries()) {
  const referenced = new Set(hypothesisEvents.map((event) => event.previous_event_id).filter(Boolean));
  const terminals = hypothesisEvents.filter((event) => !referenced.has(event.event_id));
  const roots = hypothesisEvents.filter((event) => event.previous_event_id === null);
  if (roots.length !== 1) fail(hypothesisId + ' evidence event history must have exactly one root event.');
  if (terminals.length !== 1) fail(hypothesisId + ' evidence event history must have exactly one terminal event.');
  if (terminals.length !== 1) continue;

  const visited = new Set();
  let cursor = terminals[0];
  while (cursor) {
    if (visited.has(cursor.event_id)) {
      fail(hypothesisId + ' evidence event history contains a cycle at ' + cursor.event_id + '.');
      break;
    }
    visited.add(cursor.event_id);
    if (cursor.previous_event_id === null) break;
    const previous = events.get(cursor.previous_event_id);
    if (!previous || previous.hypothesis_id !== hypothesisId) break;
    cursor = previous;
  }
  if (visited.size !== hypothesisEvents.length) {
    fail(hypothesisId + ' evidence event history contains disconnected or cyclic events outside the terminal chain.');
  }

  const canonicalPath = hypothesisFiles.get(hypothesisId);
  if (!canonicalPath) continue;
  const raw = fs.readFileSync(path.join(root, canonicalPath), 'utf8');
  const canonical = JSON.parse(raw);
  const digest = crypto.createHash('sha256').update(raw).digest('hex');
  const terminal = terminals[0].hypothesis_state_after || {};
  const expected = {
    canonical_object_sha256: digest,
    canonical_object_updated_at: canonical.provenance && canonical.provenance.updated_at,
    evidence_stage: canonical.evidence_stage,
    review_state: canonical.review_state && canonical.review_state.status,
    publication_class: canonical.review_state && canonical.review_state.publication_class,
    uncertainty_level: canonical.uncertainty && canonical.uncertainty.level,
    ranking_status: canonical.ranking && canonical.ranking.status,
    ranking_score: canonical.ranking && canonical.ranking.score,
    supersession_status: canonical.supersession && canonical.supersession.status
  };
  for (const [field, value] of Object.entries(expected)) {
    if (terminal[field] !== value) fail(hypothesisId + ' terminal evidence event is stale: ' + field + ' does not match the canonical object.');
  }
}

if (failed) process.exitCode = 1;
else console.log('Living evidence event validation passed for ' + events.size + ' event(s).');
