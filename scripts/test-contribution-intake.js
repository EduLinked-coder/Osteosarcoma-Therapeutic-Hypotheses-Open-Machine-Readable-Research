'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { CONTRIBUTION_TEMPLATE_MAP, validateContributionIntake } = require('./validate-contribution-intake');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

function writeTemplate(root, filename) {
  const filePath = path.join(root, '.github/ISSUE_TEMPLATE', filename);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, '---\nname: Test\nabout: Test template\ntitle: "[TEST] "\n---\n\n## Boundary\n\nSynthetic fixture.\n');
}

function fixtureRoot(types = Object.keys(CONTRIBUTION_TEMPLATE_MAP)) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'osteosarcoma-contribution-intake-'));
  writeJson(path.join(root, 'schemas/research-contribution.schema.json'), {
    properties: { contribution_type: { enum: types } }
  });
  for (const type of types) {
    const filename = CONTRIBUTION_TEMPLATE_MAP[type];
    if (filename) writeTemplate(root, filename);
  }
  return root;
}

function run() {
  const validRoot = fixtureRoot();
  try {
    const valid = validateContributionIntake(validRoot);
    assert.deepStrictEqual(valid.errors, [], 'complete governed intake mapping should pass');

    const missingRoot = fixtureRoot();
    try {
      fs.unlinkSync(path.join(missingRoot, '.github/ISSUE_TEMPLATE', CONTRIBUTION_TEMPLATE_MAP.NEW_HYPOTHESIS));
      const missing = validateContributionIntake(missingRoot);
      assert(missing.errors.some((error) => error.includes('NEW_HYPOTHESIS') && error.includes('missing governed public intake template')), 'missing template must fail closed');
    } finally {
      fs.rmSync(missingRoot, { recursive: true, force: true });
    }

    const unmappedRoot = fixtureRoot([...Object.keys(CONTRIBUTION_TEMPLATE_MAP), 'UNMAPPED_RESEARCH_TYPE']);
    try {
      const unmapped = validateContributionIntake(unmappedRoot);
      assert(unmapped.errors.some((error) => error.includes('No governed public intake template is mapped for contribution type UNMAPPED_RESEARCH_TYPE')), 'new schema type without a public intake mapping must fail closed');
    } finally {
      fs.rmSync(unmappedRoot, { recursive: true, force: true });
    }

    const boundaryRoot = fixtureRoot();
    try {
      const target = path.join(boundaryRoot, '.github/ISSUE_TEMPLATE', CONTRIBUTION_TEMPLATE_MAP.ERROR_REPORT);
      fs.writeFileSync(target, '---\nname: Error\nabout: Error report\ntitle: "[ERROR] "\n---\n');
      const boundary = validateContributionIntake(boundaryRoot);
      assert(boundary.errors.some((error) => error.includes('must expose an explicit Boundary section')), 'template without boundary section must fail closed');
    } finally {
      fs.rmSync(boundaryRoot, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(validRoot, { recursive: true, force: true });
  }

  console.log('Contribution intake fail-closed fixtures passed.');
}

if (require.main === module) run();
