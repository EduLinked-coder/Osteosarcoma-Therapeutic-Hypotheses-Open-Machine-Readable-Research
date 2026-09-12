const fs = require('fs');
const path = require('path');
const root = process.cwd();
const fail = (message) => { console.error('VALIDATION FAILED: ' + message); process.exitCode = 1; };
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const idPattern = /^OS-TH-[0-9]{4}$/;
const index = readJson('indexes/hypotheses.json');
if (!Array.isArray(index.hypotheses) || index.hypotheses.length === 0) fail('indexes/hypotheses.json must list at least one canonical hypothesis.');
const seen = new Set();
for (const entry of index.hypotheses) {
  if (!idPattern.test(entry.hypothesis_id || '')) fail('Invalid stable hypothesis ID in index: ' + entry.hypothesis_id);
  if (seen.has(entry.hypothesis_id)) fail('Duplicate hypothesis ID in index: ' + entry.hypothesis_id);
  seen.add(entry.hypothesis_id);
  const expectedPath = 'hypotheses/' + entry.hypothesis_id + '/hypothesis.json';
  if (entry.canonical_object_path !== expectedPath) fail(entry.hypothesis_id + ' canonical object path is not stable.');
  if (!fs.existsSync(path.join(root, expectedPath))) fail('Missing canonical object: ' + expectedPath);
  const h = readJson(expectedPath);
  if (h.hypothesis_id !== entry.hypothesis_id) fail('Index/object ID mismatch for ' + entry.hypothesis_id);
  if (h.clinical_use !== false || entry.clinical_use !== false) fail(entry.hypothesis_id + ' must explicitly set clinical_use:false.');
  if (!h.uncertainty || !h.uncertainty.summary) fail(entry.hypothesis_id + ' missing uncertainty summary.');
  if (!h.contradictory_evidence || !h.contradictory_evidence.status || !h.contradictory_evidence.assessment) fail(entry.hypothesis_id + ' missing contradictory evidence assessment.');
  if (!h.review_state || h.review_state.scientific_review_required !== true) fail(entry.hypothesis_id + ' must require scientific review until explicitly reviewed.');
  if (!h.ranking || h.ranking.meaning !== 'Research priority only; never expected patient benefit.') fail(entry.hypothesis_id + ' ranking meaning must preserve clinical boundary.');
  for (const evidence of h.supporting_evidence || []) {
    const bindingPath = 'evidence-bindings/' + evidence.evidence_id + '.json';
    if (!fs.existsSync(path.join(root, bindingPath))) fail(entry.hypothesis_id + ' missing evidence binding: ' + bindingPath);
    const binding = readJson(bindingPath);
    if (binding.clinical_use !== false) fail(bindingPath + ' must explicitly set clinical_use:false.');
    if (!binding.provenance || !binding.provenance.retrieval_date) fail(bindingPath + ' missing provenance retrieval date.');
  }
  const htmlPath = 'hypotheses/' + entry.hypothesis_id + '/index.html';
  if (!fs.existsSync(path.join(root, htmlPath))) fail('Missing human projection: ' + htmlPath);
  const html = fs.readFileSync(path.join(root, htmlPath), 'utf8');
  if (!html.includes("fetch('hypothesis.json')")) fail(htmlPath + ' must load its canonical JSON object.');
}
const homepage = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
if (!homepage.includes("fetch('indexes/hypotheses.json')")) fail('Homepage must derive object list from indexes/hypotheses.json.');
for (const required of ['repository-manifest.json', 'AGENTS.md', 'robots.txt', 'sitemap.xml']) if (!fs.existsSync(path.join(root, required))) fail('Missing ' + required + '.');
if (!process.exitCode) console.log('Public research validation passed for ' + index.hypotheses.length + ' hypothesis object(s).');
