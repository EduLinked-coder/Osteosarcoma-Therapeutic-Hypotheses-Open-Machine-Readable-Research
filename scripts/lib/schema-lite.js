'use strict';

function resolveRef(schemaRoot, ref) {
  if (!ref.startsWith('#/$defs/')) throw new Error('Unsupported schema ref: ' + ref);
  return schemaRoot.$defs[ref.slice('#/$defs/'.length)];
}

function typeOk(value, expected) {
  if (expected === 'array') return Array.isArray(value);
  if (expected === 'null') return value === null;
  if (expected === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (expected === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === expected && !Array.isArray(value) && value !== null;
}

function validateJsonSchema(schemaRoot, schema, value, where = '$') {
  const errors = [];
  const fail = (message) => errors.push(message);

  const visit = (rule, current, pointer) => {
    if (rule.$ref) return visit(resolveRef(schemaRoot, rule.$ref), current, pointer);

    if (rule.const !== undefined && current !== rule.const) {
      fail(pointer + ' must equal ' + JSON.stringify(rule.const) + '.');
    }
    if (rule.enum && !rule.enum.includes(current)) {
      fail(pointer + ' has unsupported value ' + JSON.stringify(current) + '.');
    }
    if (rule.type) {
      const types = Array.isArray(rule.type) ? rule.type : [rule.type];
      if (!types.some((type) => typeOk(current, type))) {
        fail(pointer + ' must be type ' + types.join(' or ') + '.');
        return;
      }
    }

    if (typeof current === 'string') {
      if (rule.minLength && current.length < rule.minLength) fail(pointer + ' is shorter than minLength ' + rule.minLength + '.');
      if (rule.pattern && !(new RegExp(rule.pattern).test(current))) fail(pointer + ' does not match pattern ' + rule.pattern + '.');
      if (rule.format === 'date-time' && Number.isNaN(Date.parse(current))) fail(pointer + ' is not a valid date-time.');
      if (rule.format === 'uri') {
        try { new URL(current); } catch { fail(pointer + ' is not a valid URI.'); }
      }
    }

    if (typeof current === 'number') {
      if (rule.minimum !== undefined && current < rule.minimum) fail(pointer + ' is below minimum ' + rule.minimum + '.');
      if (rule.maximum !== undefined && current > rule.maximum) fail(pointer + ' is above maximum ' + rule.maximum + '.');
    }

    if (Array.isArray(current)) {
      if (rule.minItems && current.length < rule.minItems) fail(pointer + ' must contain at least ' + rule.minItems + ' item(s).');
      if (rule.items) current.forEach((item, index) => visit(rule.items, item, pointer + '[' + index + ']'));
    }

    if (current && typeof current === 'object' && !Array.isArray(current)) {
      for (const required of rule.required || []) {
        if (!(required in current)) fail(pointer + ' missing required property ' + required + '.');
      }
      if (rule.additionalProperties === false && rule.properties) {
        for (const key of Object.keys(current)) {
          if (!(key in rule.properties)) fail(pointer + ' has unsupported property ' + key + '.');
        }
      }
      for (const [key, child] of Object.entries(rule.properties || {})) {
        if (key in current) visit(child, current[key], pointer + '.' + key);
      }
      if (rule.additionalProperties && typeof rule.additionalProperties === 'object') {
        for (const [key, childValue] of Object.entries(current)) {
          if (!rule.properties || !(key in rule.properties)) visit(rule.additionalProperties, childValue, pointer + '.' + key);
        }
      }
    }
  };

  visit(schema, value, where);
  return errors;
}

module.exports = { validateJsonSchema };
