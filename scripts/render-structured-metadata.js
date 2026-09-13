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

const hasPart = hypotheses.map((h) => {
  if (h.hypothesis_id !== h.hypothesis_id.match(idPattern)?.[0]) throw new Error('Invalid stable hypothesis ID: ' + h.hypothesis_id);
  if (h.clinical_use !== false) throw new Error(h.hypothesis_id + ' must retain clinical_use:false.');
  if (!h.review_state || h.review_state.scientific_review_required !== true) throw new Error(h.hypothesis_id + ' must retain explicit scientific review requirement.');

  const evidenceIds = [...(h.supporting_evidence || []), ...((h.contradictory_evidence || {}).items || [])]
    .map((item) => item.evidence_id)
    .filter(Boolean);
  const citations = [...new Set(evidenceIds.map((id) => {
    if (!evidenceById.has(id)) throw new Error(h.hypothesis_id + ' references missing public evidence binding ' + id + '.');
    return evidenceById.get(id);
  }))];

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
    about: ['osteosarcoma', ...(h.targets_pathways || []).map((item) => item.name)],
    citation: citations,
    encoding: [{
      '@type': 'MediaObject',
      encodingFormat: 'application/json',
      contentUrl: siteBase + 'hypotheses/' + h.hypothesis_id + '/hypothesis.json'
    }],
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'evidenceStage', value: h.evidence_stage },
      { '@type': 'PropertyValue', name: 'reviewState', value: h.review_state.status },
      { '@type': 'PropertyValue', name: 'publicationClass', value: h.review_state.publication_class },
      { '@type': 'PropertyValue', name: 'scientificReviewRequired', value: h.review_state.scientific_review_required },
      { '@type': 'PropertyValue', name: 'uncertaintyLevel', value: h.uncertainty.level },
      { '@type': 'PropertyValue', name: 'contradictoryEvidenceStatus', value: h.contradictory_evidence.status },
      { '@type': 'PropertyValue', name: 'rankingMeaning', value: h.ranking.meaning },
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
else if (checkOnly) console.log('Structured metadata projection is current for ' + hypotheses.length + ' hypothesis object(s).');
