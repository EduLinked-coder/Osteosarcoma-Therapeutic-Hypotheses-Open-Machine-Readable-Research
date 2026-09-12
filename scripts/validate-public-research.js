const fs = require('fs');
const path = require('path');

const root = process.cwd();
const fail = (message) => {
  console.error('VALIDATION FAILED: ' + message);
  process.exitCode = 1;
};
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const idPattern = /^OS-TH-[0-9]{4}$/;

const resolveRef = (schema, ref) => {
  if (!ref.startsWith('#/$defs/')) throw new Error('Unsupported schema ref: ' + ref);
  return schema.$defs[ref.slice('#/$defs/'.length)];
};

const typeOk = (value, expected) => {
  if (expected === 'array') return Array.isArray(value);
  if (expected === 'null') return value === null;
  return typeof value === expected && !Array.isArray(value) && value !== null;
};

const validateNode = (schemaRoot, schema, value, where) => {
  if (schema.$ref) return validateNode(schemaRoot, resolveRef(schemaRoot, schema.$ref), value, where);
  if (schema.const !== undefined && value !== schema.const) fail(where + ' must equal ' + JSON.stringify(schema.const) + '.');
  if (schema.enum && !schema.enum.includes(value)) fail(where + ' has unsupported value ' + JSON.stringify(value) + '.');
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => typeOk(value, type))) fail(where + ' must be type ' + types.join(' or ') + '.');
  }
  if (typeof value === 'string') {
    if (schema.minLength && value.length < schema.minLength) fail(where + ' is shorter than minLength ' + schema.minLength + '.');
    if (schema.pattern && !(new RegExp(schema.pattern).test(value))) fail(where + ' does not match pattern ' + schema.pattern + '.');
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
    for (const required of schema.required || []) {
      if (!(required in value)) fail(where + ' missing required property ' + required + '.');
    }
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
const index = readJson('indexes/hypotheses.json');
if (!Array.isArray(index.hypotheses) || index.hypotheses.length === 0) {
  fail('indexes/hypotheses.json must list at least one canonical hypothesis.');
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
  if (h.clinical_use !== false || entry.clinical_use !== false) fail(entry.hypothesis_id + ' must explicitly set clinical_use:false.');
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
  if (!html.includes('<meta name="generator" content="scripts/render-public-research.js">')) fail(htmlPath + ' must be generated from its canonical JSON object.');
}

const homepage = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
if (!homepage.includes("fetch('indexes/hypotheses.json')")) fail('Homepage must derive object list from indexes/hypotheses.json.');
for (const required of ['repository-manifest.json', 'AGENTS.md', 'robots.txt', 'sitemap.xml']) {
  if (!fs.existsSync(path.join(root, required))) fail('Missing ' + required + '.');
}
if (!process.exitCode) console.log('Public research validation passed for ' + index.hypotheses.length + ' hypothesis object(s).');
