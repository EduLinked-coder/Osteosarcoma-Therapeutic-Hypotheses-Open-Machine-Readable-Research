'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const checkOnly = process.argv.includes('--check');
const generatedBy = 'scripts/render-research-activity.js';
let stale = false;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const writeProjection = (rel, content) => {
  const target = path.join(root, rel);
  const normalized = content.endsWith('\n') ? content : content + '\n';
  if (checkOnly) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== normalized) {
      console.error('STALE RESEARCH ACTIVITY PROJECTION: ' + rel);
      stale = true;
    }
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, normalized, 'utf8');
  console.log('Generated ' + rel);
};

const hypothesisIndex = readJson('indexes/hypotheses.json');
const hypotheses = (hypothesisIndex.hypotheses || []).map((entry) => readJson(entry.canonical_object_path));
const protectedReviewRegisterPath = 'governance/evidence-relationship-review-exceptions.json';
const protectedReviewRegister = readJson(protectedReviewRegisterPath);
if (protectedReviewRegister.schema_version !== '1.0.0') throw new Error(protectedReviewRegisterPath + ' must retain schema_version 1.0.0.');
if (!Array.isArray(protectedReviewRegister.exceptions)) throw new Error(protectedReviewRegisterPath + ' exceptions must be an array.');
const hypothesisIds = new Set(hypotheses.map((h) => h.hypothesis_id));
const protectedReviewExceptions = protectedReviewRegister.exceptions;
for (const [index, item] of protectedReviewExceptions.entries()) {
  const label = protectedReviewRegisterPath + ' exceptions[' + index + ']';
  if (!/^OS-TH-[0-9]{4}$/.test(String(item.hypothesis_id || ''))) throw new Error(label + ' must use a stable OS-TH-#### identifier.');
  if (!hypothesisIds.has(item.hypothesis_id)) throw new Error(label + ' references a hypothesis outside the canonical hypothesis index.');
  if (item.status !== 'HUMAN_SCIENTIFIC_REVIEW_REQUIRED') throw new Error(label + ' must remain HUMAN_SCIENTIFIC_REVIEW_REQUIRED until attributable scientific review resolves it.');
  if (item.clinical_use !== false) throw new Error(label + ' must preserve clinical_use:false.');
  if (typeof item.resolution_rule !== 'string' || !item.resolution_rule.includes('attributable scientific decision')) throw new Error(label + ' must retain the attributable scientific-decision resolution rule.');
}
const eventDir = path.join(root, 'evidence-events');
const eventFiles = fs.existsSync(eventDir)
  ? fs.readdirSync(eventDir).filter((name) => /^OS-EVENT-[0-9]{4}\.json$/.test(name)).sort()
  : [];
const events = eventFiles.map((name) => ({ path: 'evidence-events/' + name, object: readJson('evidence-events/' + name) }));

events.sort((a, b) => {
  const time = String(b.object.recorded_at).localeCompare(String(a.object.recorded_at));
  return time || String(b.object.event_id).localeCompare(String(a.object.event_id));
});

const rankingChanges = events.filter(({ object: event }) => {
  const before = event.hypothesis_state_before || {};
  const after = event.hypothesis_state_after || {};
  return before.ranking_status !== after.ranking_status || before.ranking_score !== after.ranking_score;
}).length;
const evidenceStageChanges = events.filter(({ object: event }) =>
  (event.hypothesis_state_before || {}).evidence_stage !== (event.hypothesis_state_after || {}).evidence_stage
).length;
const unresolvedEvidenceGaps = hypotheses.filter((h) =>
  (h.contradictory_evidence || {}).status === 'not-yet-assessed' ||
  (h.validation_requirements || []).some((item) => ['required', 'in-progress'].includes(item.status))
).length;
const metrics = {
  hypotheses_requiring_review: hypotheses.filter((h) => h.review_state && h.review_state.scientific_review_required === true).length,
  protected_scientific_review_exceptions: protectedReviewExceptions.length,
  new_evidence_events: events.filter(({ object }) => object.event_type === 'EVIDENCE_ADDED').length,
  ranking_changes: rankingChanges,
  evidence_stage_changes: evidenceStageChanges,
  superseded_hypotheses: hypotheses.filter((h) => h.supersession && h.supersession.status === 'superseded').length,
  withdrawn_hypotheses: hypotheses.filter((h) => h.supersession && h.supersession.status === 'withdrawn').length,
  unresolved_evidence_gaps: unresolvedEvidenceGaps
};

const index = {
  schema_version: '1.0.0',
  generated_by: generatedBy,
  source: 'Append-only public evidence events plus canonical hypothesis objects and the governed protected scientific-review exception register. This is a discovery projection, not a scientific authority surface.',
  clinical_use_boundary: 'Research activity only. Not medical advice, treatment recommendations or claims of patient benefit.',
  event_count: events.length,
  latest_event_at: events.length ? events[0].object.recorded_at : null,
  metrics,
  events: events.map(({ path: eventPath, object: event }) => ({
    event_id: event.event_id,
    hypothesis_id: event.hypothesis_id,
    event_type: event.event_type,
    recorded_at: event.recorded_at,
    evidence_ids: event.evidence_ids,
    change_summary: event.change_summary,
    event_path: eventPath,
    ranking_changed: (event.hypothesis_state_before || {}).ranking_status !== (event.hypothesis_state_after || {}).ranking_status ||
      (event.hypothesis_state_before || {}).ranking_score !== (event.hypothesis_state_after || {}).ranking_score,
    evidence_stage_changed: (event.hypothesis_state_before || {}).evidence_stage !== (event.hypothesis_state_after || {}).evidence_stage,
    scientific_decision_status: (event.scientific_decision || {}).status,
    clinical_use: event.clinical_use
  }))
};
writeProjection('indexes/evidence-events.json', JSON.stringify(index, null, 2));

const metricCards = [
  ['Evidence events', events.length],
  ['Need scientific review', metrics.hypotheses_requiring_review],
  ['Protected review exceptions', metrics.protected_scientific_review_exceptions],
  ['New evidence events', metrics.new_evidence_events],
  ['Ranking changes', metrics.ranking_changes],
  ['Evidence-stage changes', metrics.evidence_stage_changes],
  ['Superseded', metrics.superseded_hypotheses],
  ['Withdrawn', metrics.withdrawn_hypotheses],
  ['Unresolved evidence gaps', metrics.unresolved_evidence_gaps]
].map(([label, value]) => '<div class="metric"><strong>' + esc(value) + '</strong><span>' + esc(label) + '</span></div>').join('');

const eventRows = events.length
  ? events.map(({ object: event }) => '<tr><td><a href="../evidence-events/' + esc(event.event_id) + '.json">' + esc(event.event_id) + '</a></td><td><a href="../hypotheses/' + esc(event.hypothesis_id) + '/">' + esc(event.hypothesis_id) + '</a></td><td>' + esc(event.event_type) + '</td><td>' + esc(event.recorded_at) + '</td><td>' + esc(event.change_summary) + '</td></tr>').join('')
  : '<tr><td colspan="5">No public evidence-change events have been recorded yet. The absence of events must not be interpreted as evidence that no new literature exists; it means no material public event has yet been recorded in this repository.</td></tr>';

const html = '<!doctype html>\n<!-- GENERATED by ' + generatedBy + '. Do not edit this projection by hand. -->\n<html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="generator" content="' + generatedBy + '"><title>Research activity — Osteosarcoma open research</title><meta name="description" content="Generated living-evidence activity view for the public osteosarcoma research repository."><style>body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;margin:0;color:#172033;line-height:1.6;background:#f7f5ff}main{width:min(100% - 2rem,78rem);margin:auto;padding:3rem 0}h1{font-size:clamp(2rem,6vw,3.5rem);line-height:1.1}.lead{font-size:1.15rem;color:#42526e;max-width:72ch}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(10rem,1fr));gap:1rem;margin:2rem 0}.metric{background:#fff;border:1px solid #c9c3e6;border-radius:1rem;padding:1rem}.metric strong{display:block;font-size:2rem}.panel{background:#fff;border:1px solid #c9c3e6;border-radius:1rem;padding:1.25rem;margin:1.5rem 0;overflow:auto}table{width:100%;border-collapse:collapse;min-width:52rem}th,td{padding:.8rem;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}a{color:#2349a6}.warning{border-left:6px solid #dea93f;background:#fff8e6;padding:1rem;border-radius:.75rem}</style></head><body><main><p><a href="../">← Repository home</a></p><h1>Living research activity</h1><p class="lead">This page is generated from canonical hypothesis objects, the append-only public evidence-event ledger, and the governed protected scientific-review exception register. It surfaces repository activity without creating a second scientific record.</p><div class="metrics">' + metricCards + '</div><div class="warning"><strong>Research boundary:</strong> activity, ranking and evidence-stage changes are research metadata. They are not clinical recommendations, expected patient benefit or authority to publish a scientific conclusion. Known protected scientific-review exceptions remain unresolved and require attributable human scientific decisions. <a href="../review/">Open protected scientific review</a>.</div><section class="panel"><h2>Recent evidence events</h2><table><thead><tr><th>Event</th><th>Hypothesis</th><th>Type</th><th>Recorded</th><th>Summary</th></tr></thead><tbody>' + eventRows + '</tbody></table></section><section class="panel"><h2>Machine access</h2><p><a href="../indexes/evidence-events.json">Evidence-event index (JSON)</a> · <a href="../indexes/hypotheses.json">Hypothesis index (JSON)</a> · <a href="../governance/evidence-relationship-review-exceptions.json">Protected review register (JSON)</a></p></section></main></body></html>';
writeProjection('activity/index.html', html);

if (stale) process.exitCode = 1;
else if (checkOnly) console.log('Research activity projections are current.');
