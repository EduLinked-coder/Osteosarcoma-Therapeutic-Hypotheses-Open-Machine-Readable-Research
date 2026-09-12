const fs = require('fs');
const path = require('path');

const root = process.cwd();
const schema = JSON.parse(fs.readFileSync(path.join(root, 'schemas/therapeutic-hypothesis.schema.json'), 'utf8'));
const index = JSON.parse(fs.readFileSync(path.join(root, 'indexes/hypotheses.json'), 'utf8'));
let failed = false;

const fail = (message) => {
  console.error('SCHEMA VALIDATION FAILED: ' + message);
  failed = true;
};

const typeMatches = (value, type) => {
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === type;
};

const validate = (value, rule, pointer, rootSchema) => {
  if (rule.$ref) {
    const parts = rule.$ref.replace(/^#\//, '').split('/');
    let resolved = rootSchema;
    for (const part of parts) resolved = resolved[part];
    return validate(value, resolved, pointer, rootSchema);
  }
  if (rule.const !== undefined && value !== rule.const) fail(pointer + ' must equal ' + JSON.stringify(rule.const));
  if (rule.enum && !rule.enum.includes(value)) fail(pointer + ' must be one of ' + rule.enum.join(', '));
  if (rule.type) {
    const types = Array.isArray(rule.type) ? rule.type : [rule.type];
    if (!types.some((type) => typeMatches(value, type))) {
      fail(pointer + ' has invalid type; expected ' + types.join('|'));
      return;
    }
  }
  if (typeof value === 'string') {
    if (rule.minLength && value.length < rule.minLength) fail(pointer + ' is shorter than ' + rule.minLength + ' characters');
    if (rule.pattern && !(new RegExp(rule.pattern)).test(value)) fail(pointer + ' does not match ' + rule.pattern);
    if (rule.format === 'date-time' && Number.isNaN(Date.parse(value))) fail(pointer + ' is not a valid date-time');
    if (rule.format === 'uri') {
      try { new URL(value); } catch { fail(pointer + ' is not a valid URI'); }
    }
  }
  if (typeof value === 'number') {
    if (rule.minimum !== undefined && value < rule.minimum) fail(pointer + ' is below minimum ' + rule.minimum);
    if (rule.maximum !== undefined && value > rule.maximum) fail(pointer + ' is above maximum ' + rule.maximum);
  }
  if (Array.isArray(value)) {
    if (rule.minItems && value.length < rule.minItems) fail(pointer + ' must contain at least ' + rule.minItems + ' item(s)');
    if (rule.items) value.forEach((item, i) => validate(item, rule.items, pointer + '/' + i, rootSchema));
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of rule.required || []) if (!(key in value)) fail(pointer + ' missing required property ' + key);
    if (rule.additionalProperties === false && rule.properties) {
      for (const key of Object.keys(value)) if (!(key in rule.properties)) fail(pointer + ' contains unsupported property ' + key);
    }
    for (const [key, child] of Object.entries(rule.properties || {})) if (key in value) validate(value[key], child, pointer + '/' + key, rootSchema);
    if (rule.additionalProperties && typeof rule.additionalProperties === 'object' && !rule.properties) {
      for (const [key, childValue] of Object.entries(value)) validate(childValue, rule.additionalProperties, pointer + '/' + key, rootSchema);
    }
  }
};

for (const entry of index.hypotheses || []) {
  const file = entry.canonical_object_path;
  const object = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  validate(object, schema, file, schema);
}

if (failed) process.exitCode = 1;
else console.log('Therapeutic hypothesis schema validation passed for ' + (index.hypotheses || []).length + ' object(s).');
