const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { isPathSafeEvidenceId, validateEvidenceBindingIdentity } = require('./lib/evidence-binding-integrity');

const root = process.cwd();
const fail = (message) => {
  console.error('VALIDATION FAILED: ' + message);
  process.exitCode = 1;
};
const readText = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const readJson = (file) => JSON.parse(readText(file));
const idPattern = /^OS-TH-[0-9]{4}$/;

const resolveRef = (schema, ref) => {
  if (!ref.startsWith('#/$defs/')) throw new Error('Unsupported schema ref: ' + ref);
  return schema.$defs[ref.slice('#/$defs/'.length)];
};

const typeOk = (value, expected) => {
  if (expected === 'array') return Array.isArray(value);
  if (expected === 'null') return value === null;
  if (expected === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  return typeof value === expected && !Array.isArray(value) && value !== null;
};

const validateNode = (schemaRoot, schema, value, where) => {
  if (schema.$ref) return validateNode(schemaRoot, resolveRef(schemaRoot, schema.$ref), value, where);
  if (schema.const !== undefined && value !== schema.const) fail(where + ' must equal ' + JSON.stringify(schema.const) + '.');
  if (schema.enum && !schema.enum.includes(value)) fail(where + ' has unsupported value ' + JSON.stringify(value) + '.');
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => typeOk(value, type))) {
      fail(where + ' must be type ' + types.join(' or ') + '.');
      return;
    }
  }
  if (typeof value === 'string') {
    if (schema.minLength && value.length < schema.minLength) fail(where + ' is shorter than minLength ' + schema.minLength + '.');
    if (schema.pattern && !(new RegExp(schema.pattern).test(value))) fail(where + ' does not match pattern ' + schema.pattern + '.');
    if (schema.format === 'date-time' && Number.isNaN(Date.parse(value))) fail(where + ' is not a valid date-time.');
    if (schema.format === 'uri') {
      try { new URL(value); } catch { fail(where + ' is not a valid URI.'); }
    }
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) fail(where + ' is below minimum ' + schema.minimum + '.');
    if (schema.maximum !== undefined && value > schema.maximum) fail(where + ' is above maximum ' + schema.maximum + '.');
  }
  if (Array.isArray(value)) {
    if (schema.minItems && value.length < schema.minItems) fail(where + ' must contain at least ' + schema.minItems + ' item(s).');
    if (schema.items) value.forEach((item, index) => validateNode(schemaRoot, schema.items, item, where + '[' + index + ']'));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const required of schema.required || []) if (!(required in value)) fail(where + ' missing required property ' + required + '.');
    if (schema.additionalProperties === false && schema.properties) {
      for (const key of Object.keys(value)) if (!(key in schema.properties)) fail(where + ' has unsupported property ' + key + '.');
    }
    for (const [key, child] of Object.entries(schema.properties || {})) {
      if (key in value) validateNode(schemaRoot, child, value[key], where + '.' + key);
    }
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      for (const [key, childValue] of Object.entries(value)) {
        if (!schema.properties || !(key in schema.properties)) validateNode(schemaRoot, schema.additionalProperties, childValue, where + '.' + key);
      }
    }
  }
};

const schema = readJson('schemas/therapeutic-hypothesis.schema.json');
const evidenceSchema = readJson('schemas/evidence-binding.schema.json');
const index = readJson('indexes/hypotheses.json');
if (!Array.isArray(index.hypotheses) || index.hypotheses.length === 0) fail('indexes/hypotheses.json must list at least one canonical hypothesis.');
if (index.hypothesis_count !== index.hypotheses.length) fail('Index hypothesis_count does not match hypotheses array length.');

const canonicalIds = fs.readdirSync(path.join(root, 'hypotheses'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && idPattern.test(entry.name) && fs.existsSync(path.join(root, 'hypotheses', entry.name, 'hypothesis.json')))
  .map((entry) => entry.name)
  .sort();
const indexedIds = (index.hypotheses || []).map((entry) => entry.hypothesis_id).sort();
if (canonicalIds.join('\n') !== indexedIds.join('\n')) fail('Generated index must cover every canonical hypothesis object exactly once.');
const expectedReviewCount = index.hypotheses.filter((entry) => entry.review_state.scientific_review_required && entry.review_state.status !== 'reviewed').length;
if (index.hypotheses_requiring_review !== expectedReviewCount) fail('Index hypotheses_requiring_review is stale.');

const evidenceDir = path.join(root, 'evidence-bindings');
const evidenceFiles = fs.readdirSync(evidenceDir).filter((file) => file.endsWith('.json')).sort();
if (evidenceFiles.length === 0) fail('evidence-bindings/ must contain at least one governed evidence binding.');
for (const file of evidenceFiles) {
  const relativePath = 'evidence-bindings/' + file;
  const binding = readJson(relativePath);
  validateNode(evidenceSchema, evidenceSchema, binding, relativePath);
  for (const identityError of validateEvidenceBindingIdentity(binding, relativePath)) fail(identityError);
  if (!isPathSafeEvidenceId(binding.evidence_id)) fail(relativePath + ' evidence_id is not safe for a single canonical evidence-binding path segment.');
  if (file !== binding.evidence_id + '.json') fail(relativePath + ' filename must match evidence_id.');
  if (binding.clinical_use !== false) fail(relativePath + ' must explicitly set clinical_use:false.');
  if (binding.acceptance_state && binding.acceptance_state.status !== 'candidate-public-evidence') fail(relativePath + ' must remain candidate evidence until reviewed.');
  if (!binding.provenance || !binding.provenance.retrieval_date) fail(relativePath + ' missing provenance retrieval date.');
  try {
    const url = new URL(binding.canonical_source_url);
    if (!['http:', 'https:'].includes(url.protocol)) fail(relativePath + ' canonical source must use http(s).');
  } catch { fail(relativePath + ' canonical source URL is invalid.'); }
}

const seen = new Set();
for (const entry of index.hypotheses) {
  if (!idPattern.test(entry.hypothesis_id || '')) fail('Invalid stable hypothesis ID in index: ' + entry.hypothesis_id);
  if (seen.has(entry.hypothesis_id)) fail('Duplicate hypothesis ID in index: ' + entry.hypothesis_id);
  seen.add(entry.hypothesis_id);

  const expectedPath = 'hypotheses/' + entry.hypothesis_id + '/hypothesis.json';
  if (entry.canonical_object_path !== expectedPath) fail(entry.hypothesis_id + ' canonical object path is not stable.');
  if (!fs.existsSync(path.join(root, expectedPath))) fail('Missing canonical object: ' + expectedPath);

  const h = readJson(expectedPath);
  validateNode(schema, schema, h, expectedPath);
  if (h.hypothesis_id !== entry.hypothesis_id) fail('Index/object ID mismatch for ' + entry.hypothesis_id);
  if (entry.title !== h.title || entry.plain_language_summary !== h.plain_language_summary || entry.hypothesis_statement !== h.hypothesis_statement) fail(entry.hypothesis_id + ' generated index content does not match canonical object.');
  if (h.clinical_use !== false || entry.clinical_use !== false) fail(entry.hypothesis_id + ' must explicitly set clinical_use:false.');
  if (!h.review_state || h.review_state.scientific_review_required !== true) fail(entry.hypothesis_id + ' must require scientific review until explicitly reviewed.');
  if (!h.ranking || h.ranking.meaning !== 'Research priority only; never expected patient benefit.') fail(entry.hypothesis_id + ' ranking meaning must preserve clinical boundary.');

  const evidenceItems = [...(h.supporting_evidence || []), ...((h.contradictory_evidence || {}).items || [])];
  for (const evidence of evidenceItems) {
    if (!isPathSafeEvidenceId(evidence.evidence_id)) {
      fail(entry.hypothesis_id + ' references an unsafe evidence_id path segment: ' + evidence.evidence_id);
      continue;
    }
    const bindingPath = 'evidence-bindings/' + evidence.evidence_id + '.json';
    if (!fs.existsSync(path.join(root, bindingPath))) fail(entry.hypothesis_id + ' missing evidence binding: ' + bindingPath);
    const binding = readJson(bindingPath);
    if (binding.evidence_id !== evidence.evidence_id) fail(bindingPath + ' evidence_id mismatch.');
    if (binding.provenance.binding_generated_for !== entry.hypothesis_id) fail(bindingPath + ' provenance does not bind to ' + entry.hypothesis_id + '.');
  }

  const mechanismEvidenceRefs = [...new Set((h.mechanism?.relationships || [])
    .flatMap((relationship) => relationship.evidence_refs || [])
    .filter(Boolean))];
  for (const evidenceId of mechanismEvidenceRefs) {
    if (!isPathSafeEvidenceId(evidenceId)) {
      fail(entry.hypothesis_id + ' mechanism references an unsafe evidence_id path segment: ' + evidenceId);
      continue;
    }
    const bindingPath = 'evidence-bindings/' + evidenceId + '.json';
    if (!fs.existsSync(path.join(root, bindingPath))) {
      fail(entry.hypothesis_id + ' mechanism references missing evidence binding: ' + bindingPath);
      continue;
    }
    const binding = readJson(bindingPath);
    if (binding.evidence_id !== evidenceId) fail(bindingPath + ' evidence_id mismatch for mechanism reference.');
    if (binding.provenance.binding_generated_for !== entry.hypothesis_id) fail(bindingPath + ' mechanism evidence provenance does not bind to ' + entry.hypothesis_id + '.');
  }

  const htmlPath = 'hypotheses/' + entry.hypothesis_id + '/index.html';
  if (!fs.existsSync(path.join(root, htmlPath))) fail('Missing human projection: ' + htmlPath);
  const html = readText(htmlPath);
  const digest = crypto.createHash('sha256').update(JSON.stringify(h)).digest('hex');
  if (!html.includes('GENERATED by scripts/render-public-research.js')) fail(htmlPath + ' must be a deterministic generated projection.');
  if (!html.includes('sha256:' + digest)) fail(htmlPath + ' canonical object digest is stale.');
  if (!html.includes('href="hypothesis.json"')) fail(htmlPath + ' must link to its canonical JSON object.');
  if (html.includes("fetch('hypothesis.json')")) fail(htmlPath + ' must not depend on runtime reconstruction from canonical JSON.');

  const easyReadPath = 'hypotheses/' + entry.hypothesis_id + '/easy-read/index.html';
  if (!fs.existsSync(path.join(root, easyReadPath))) fail('Missing Easy Read projection: ' + easyReadPath);
  const easyRead = readText(easyReadPath);
  if (!easyRead.includes('GENERATED by scripts/render-public-research.js')) fail(easyReadPath + ' must be a deterministic generated projection.');
  if (!easyRead.includes(h.plain_language_summary)) fail(easyReadPath + ' must preserve the canonical plain-language summary.');
  if (!easyRead.includes(h.uncertainty.summary)) fail(easyReadPath + ' must preserve canonical uncertainty.');
  if (!easyRead.includes('Status: ' + h.contradictory_evidence.status)) fail(easyReadPath + ' must preserve contradictory-evidence status.');
  if (!easyRead.includes('clinical_use: false')) fail(easyReadPath + ' must preserve the clinical-use boundary.');
  if (!easyRead.includes('not a claim of independent Easy Read certification')) fail(easyReadPath + ' must not imply independent Easy Read certification.');
}

const homepage = readText('index.html');
if (!homepage.includes('GENERATED by scripts/render-public-research.js')) fail('Homepage must be generated from canonical hypothesis objects.');
if (homepage.includes("fetch('indexes/hypotheses.json')")) fail('Homepage must not depend on runtime reconstruction from the generated index.');
const sitemap = readText('sitemap.xml');
for (const entry of index.hypotheses) {
  if (!sitemap.includes('/hypotheses/' + entry.hypothesis_id + '/')) fail('Sitemap missing ' + entry.hypothesis_id + '.');
  if (!sitemap.includes('/hypotheses/' + entry.hypothesis_id + '/easy-read/')) fail('Sitemap missing Easy Read projection for ' + entry.hypothesis_id + '.');
}
for (const required of ['manifest.json', 'repository-manifest.json', 'AGENTS.md', 'robots.txt', 'sitemap.xml', 'scripts/render-machine-manifest.js', 'scripts/render-public-research.js', 'docs/accessibility-projection.md']) {
  if (!fs.existsSync(path.join(root, required))) fail('Missing ' + required + '.');
}
if (!process.exitCode) console.log('Public research validation passed for ' + index.hypotheses.length + ' hypothesis object(s).');
