'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const checkOnly = process.argv.includes('--check');
const siteBase = 'https://edulinked-coder.github.io/Osteosarcoma-Therapeutic-Hypotheses-Open-Machine-Readable-Research/';
const generatedBy = 'scripts/render-structured-metadata.js';
const idPattern = /^OS-TH-[0-9]{4}$/;
let stale = false;

const readText = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const readJson = (rel) => JSON.parse(readText(rel));
const writeProjection = (rel, content) => {
  const target = path.join(root, rel);
  const normalized = content.endsWith('\n') ? content : content + '\n';
  if (checkOnly) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== normalized) {
      console.error('STALE STRUCTURED METADATA: ' + rel);
      stale = true;
    }
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, normalized, 'utf8');
  console.log('Generated ' + rel);
};

const hypothesisIds = fs.readdirSync(path.join(root, 'hypotheses'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && idPattern.test(entry.name))
  .map((entry) => entry.name)
  .sort();
if (hypothesisIds.length === 0) throw new Error('No canonical hypothesis objects found.');

const evidenceById = new Map();
for (const filename of fs.readdirSync(path.join(root, 'evidence-bindings')).filter((name) => name.endsWith('.json')).sort()) {
  const binding = readJson('evidence-bindings/' + filename);
  if (!binding.evidence_id || !binding.canonical_source_url) throw new Error(filename + ' is missing evidence identity/source URL.');
  const source = new URL(binding.canonical_source_url);
  if (!['http:', 'https:'].includes(source.protocol)) throw new Error(filename + ' has a non-public URL scheme.');
  evidenceById.set(binding.evidence_id, source.toString());
}

const hypotheses = hypothesisIds.map((id) => readJson('hypotheses/' + id + '/hypothesis.json'));
const latestUpdatedAt = hypotheses.map((h) => h.provenance.updated_at).sort().at(-1);
const hypothesisIdSet = new Set(hypotheses.map((h) => h.hypothesis_id));
const protectedReviewRegisterPath = 'governance/evidence-relationship-review-exceptions.json';
const protectedReviewRegister = readJson(protectedReviewRegisterPath);
if (protectedReviewRegister.schema_version !== '1.0.0') throw new Error(protectedReviewRegisterPath + ' must retain schema_version 1.0.0.');
if (typeof protectedReviewRegister.authority_boundary !== 'string' || !protectedReviewRegister.authority_boundary.includes('does not decide which relationship is correct')) {
  throw new Error(protectedReviewRegisterPath + ' must retain the no-scientific-resolution authority boundary.');
}
if (!Array.isArray(protectedReviewRegister.exceptions)) throw new Error(protectedReviewRegisterPath + ' exceptions must be an array.');
const protectedReviewByHypothesis = new Map();
for (const [index, item] of protectedReviewRegister.exceptions.entries()) {
  const label = protectedReviewRegisterPath + ' exceptions[' + index + ']';
  if (!idPattern.test(String(item.hypothesis_id || ''))) throw new Error(label + ' must use a stable OS-TH-#### identifier.');
  if (!hypothesisIdSet.has(item.hypothesis_id)) throw new Error(label + ' references a hypothesis outside the canonical public set.');
  if (item.status !== 'HUMAN_SCIENTIFIC_REVIEW_REQUIRED') throw new Error(label + ' must remain HUMAN_SCIENTIFIC_REVIEW_REQUIRED until attributable scientific review resolves it.');
  if (item.clinical_use !== false) throw new Error(label + ' must preserve clinical_use:false.');
  if (typeof item.resolution_rule !== 'string' || !item.resolution_rule.includes('attributable scientific decision')) {
    throw new Error(label + ' must retain the attributable scientific-decision resolution rule.');
  }
  let reviewIssue;
  try {
    reviewIssue = new URL(String(item.review_issue || ''));
  } catch {
    throw new Error(label + ' must retain a valid protected-review issue URL.');
  }
  if (reviewIssue.protocol !== 'https:' || reviewIssue.hostname !== 'github.com') throw new Error(label + ' review issue must remain an HTTPS GitHub URL.');
  const grouped = protectedReviewByHypothesis.get(item.hypothesis_id) || [];
  grouped.push(item);
  protectedReviewByHypothesis.set(item.hypothesis_id, grouped);
}

const hasPart = hypotheses.map((h) => {
  if (h.hypothesis_id !== h.hypothesis_id.match(idPattern)?.[0]) throw new Error('Invalid stable hypothesis ID: ' + h.hypothesis_id);
  if (h.clinical_use !== false) throw new Error(h.hypothesis_id + ' must retain clinical_use:false.');
  if (!h.review_state || h.review_state.scientific_review_required !== true) throw new Error(h.hypothesis_id + ' must retain explicit scientific review requirement.');
  if (!h.disease_context || typeof h.disease_context !== 'object' || Array.isArray(h.disease_context)) throw new Error(h.hypothesis_id + ' must retain canonical disease_context metadata.');
  if (h.research_classification !== 'therapeutic-hypothesis') throw new Error(h.hypothesis_id + ' must retain canonical research_classification.');
  if (!h.ranking || typeof h.ranking.explanation !== 'string' || h.ranking.explanation.length === 0) throw new Error(h.hypothesis_id + ' must retain ranking.explanation.');
  if (!h.novelty || typeof h.novelty.confidence !== 'string' || h.novelty.confidence.length === 0) throw new Error(h.hypothesis_id + ' must retain novelty.confidence.');
  if (!h.accessibility || typeof h.accessibility !== 'object' || Array.isArray(h.accessibility)) throw new Error(h.hypothesis_id + ' must retain canonical accessibility metadata.');

  const easyReadPath = h.accessibility.easy_read_projection;
  const expectedEasyReadPath = 'hypotheses/' + h.hypothesis_id + '/easy-read/';
  if (easyReadPath !== expectedEasyReadPath) throw new Error(h.hypothesis_id + ' must bind structured metadata to its stable Easy Read projection.');

  const evidenceIds = [...(h.supporting_evidence || []), ...((h.contradictory_evidence || {}).items || [])]
    .map((item) => item.evidence_id)
    .filter(Boolean);
  const citations = [...new Set(evidenceIds.map((id) => {
    if (!evidenceById.has(id)) throw new Error(h.hypothesis_id + ' references missing public evidence binding ' + id + '.');
    return evidenceById.get(id);
  }))];

  const about = [...new Set([
    h.disease_context.disease,
    h.disease_context.context,
    ...(h.targets_pathways || []).map((item) => item.name)
  ].filter(Boolean))];
  const protectedReview = protectedReviewByHypothesis.get(h.hypothesis_id) || [];

  return {
    '@type': 'CreativeWork',
    '@id': siteBase + 'hypotheses/' + h.hypothesis_id + '/#research-hypothesis',
    additionalType: siteBase + 'schemas/therapeutic-hypothesis.schema.json',
    identifier: h.hypothesis_id,
    name: h.title,
    description: h.plain_language_summary,
    url: siteBase + 'hypotheses/' + h.hypothesis_id + '/',
    dateCreated: h.provenance.created_at,
    dateModified: h.provenance.updated_at,
    isAccessibleForFree: true,
    genre: 'Research hypothesis',
    about,
    citation: citations,
    encoding: [{
      '@type': 'MediaObject',
      encodingFormat: 'application/json',
      contentUrl: siteBase + 'hypotheses/' + h.hypothesis_id + '/hypothesis.json'
    }],
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'researchClassification', value: h.research_classification },
      { '@type': 'PropertyValue', name: 'disease', value: h.disease_context.disease },
      { '@type': 'PropertyValue', name: 'diseaseContextStatus', value: h.disease_context.status },
      { '@type': 'PropertyValue', name: 'diseaseContext', value: h.disease_context.context },
      { '@type': 'PropertyValue', name: 'evidenceStage', value: h.evidence_stage },
      { '@type': 'PropertyValue', name: 'reviewState', value: h.review_state.status },
      { '@type': 'PropertyValue', name: 'publicationClass', value: h.review_state.publication_class },
      { '@type': 'PropertyValue', name: 'scientificReviewRequired', value: h.review_state.scientific_review_required },
      { '@type': 'PropertyValue', name: 'protectedScientificReviewRequired', value: protectedReview.length > 0 },
      { '@type': 'PropertyValue', name: 'protectedScientificReviewExceptionCount', value: protectedReview.length },
      { '@type': 'PropertyValue', name: 'protectedScientificReviewRoute', value: siteBase + 'review/' },
      { '@type': 'PropertyValue', name: 'protectedScientificReviewRegister', value: siteBase + protectedReviewRegisterPath },
      { '@type': 'PropertyValue', name: 'protectedScientificReviewMeaning', value: 'A registered protected-review exception records unresolved scientific interpretation and requires attributable human scientific review; it does not resolve the relationship or grant clinical or publication authority.' },
      { '@type': 'PropertyValue', name: 'uncertaintyLevel', value: h.uncertainty.level },
      { '@type': 'PropertyValue', name: 'contradictoryEvidenceStatus', value: h.contradictory_evidence.status },
      { '@type': 'PropertyValue', name: 'rankingStatus', value: h.ranking.status },
      { '@type': 'PropertyValue', name: 'rankingMeaning', value: h.ranking.meaning },
      { '@type': 'PropertyValue', name: 'rankingExplanation', value: h.ranking.explanation },
      { '@type': 'PropertyValue', name: 'noveltyStatus', value: h.novelty.status },
      { '@type': 'PropertyValue', name: 'noveltyConfidence', value: h.novelty.confidence },
      { '@type': 'PropertyValue', name: 'plainLanguageSummarySource', value: h.accessibility.plain_language_summary },
      { '@type': 'PropertyValue', name: 'easyReadProjection', value: siteBase + easyReadPath },
      { '@type': 'PropertyValue', name: 'accessibilityProjectionStatus', value: h.accessibility.projection_status },
      { '@type': 'PropertyValue', name: 'accessibilityMeaning', value: h.accessibility.meaning },
      { '@type': 'PropertyValue', name: 'clinicalUse', value: false },
      { '@type': 'PropertyValue', name: 'researchBoundary', value: 'Research hypothesis only; not medical advice, a treatment recommendation, a dosing instruction or a claim of patient benefit.' }
    ]
  };
});

const projection = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  '@id': siteBase + '#research-hypothesis-collection',
  name: 'Osteosarcoma Therapeutic Hypotheses — Open Machine-Readable Research',
  description: 'Public discovery collection of governed osteosarcoma therapeutic research hypotheses. Research hypotheses only; not clinical recommendations.',
  url: siteBase,
  dateModified: latestUpdatedAt,
  isAccessibleForFree: true,
  generator: generatedBy,
  hasPart
};

writeProjection('structured-data/hypotheses.jsonld', JSON.stringify(projection, null, 2));
if (stale) process.exitCode = 1;
else if (checkOnly) console.log('Structured metadata projection is current for ' + hypotheses.length + ' hypothesis object(s), including governed protected-review discovery state.');
