'use strict';

const assert = require('assert');
const { validateEvidenceContextIntegrity } = require('./lib/evidence-binding-integrity');

function bindingWith(context) {
  return { evidence_context: context };
}

const validUnknown = bindingWith({
  experimental_model: { status: 'not-yet-assessed', value: null },
  population_context: { status: 'not-reported-in-public-source', value: null },
  mechanism: { status: 'not-applicable', value: null }
});
assert.deepEqual(validateEvidenceContextIntegrity(validUnknown, 'fixture'), []);

const validReported = bindingWith({
  experimental_model: { status: 'reported', value: 'public-source model description' },
  population_context: { status: 'reported', value: 'public-source population description' },
  mechanism: { status: 'reported', value: 'public-source mechanism description' }
});
assert.deepEqual(validateEvidenceContextIntegrity(validReported, 'fixture'), []);

const missingContext = {};
assert.match(
  validateEvidenceContextIntegrity(missingContext, 'fixture').join(' | '),
  /must explicitly assess experimental_model, population_context and mechanism/i
);

const inventedUnknownValue = bindingWith({
  experimental_model: { status: 'not-yet-assessed', value: 'invented model detail' },
  population_context: { status: 'not-yet-assessed', value: null },
  mechanism: { status: 'not-yet-assessed', value: null }
});
assert.match(
  validateEvidenceContextIntegrity(inventedUnknownValue, 'fixture').join(' | '),
  /value must be null unless status is reported/i
);

const missingReportedValue = bindingWith({
  experimental_model: { status: 'reported', value: null },
  population_context: { status: 'not-yet-assessed', value: null },
  mechanism: { status: 'not-yet-assessed', value: null }
});
assert.match(
  validateEvidenceContextIntegrity(missingReportedValue, 'fixture').join(' | '),
  /must contain the reported public-source context/i
);

console.log('Evidence context fail-closed fixtures passed: unknown context stays explicit and cannot carry inferred values.');
