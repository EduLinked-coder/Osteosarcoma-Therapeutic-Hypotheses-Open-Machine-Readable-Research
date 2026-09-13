'use strict';

const fs = require('fs');
const path = require('path');
const { validateEvidenceContextIntegrity } = require('./lib/evidence-binding-integrity');

const root = process.cwd();
const evidenceDir = path.join(root, 'evidence-bindings');
let failures = 0;

for (const file of fs.readdirSync(evidenceDir).filter((name) => name.endsWith('.json')).sort()) {
  const relative = 'evidence-bindings/' + file;
  const binding = JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
  for (const error of validateEvidenceContextIntegrity(binding, relative)) {
    console.error('EVIDENCE CONTEXT VALIDATION FAILED: ' + error);
    failures += 1;
  }
}

if (failures > 0) {
  process.exitCode = 1;
} else {
  console.log('Evidence context validation passed: experimental-model, population/context and mechanism assessment states are explicit without inferred values.');
}
