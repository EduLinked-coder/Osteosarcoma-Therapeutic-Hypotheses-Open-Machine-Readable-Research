'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_ROOT = process.cwd();

const CONTRIBUTION_TEMPLATE_MAP = Object.freeze({
  NEW_EVIDENCE: 'new-evidence.md',
  CONTRADICTORY_EVIDENCE: 'contradictory-evidence.md',
  FAILED_REPLICATION: 'failed-replication.md',
  NEW_HYPOTHESIS: 'new-hypothesis.md',
  MECHANISM_PROPOSAL: 'mechanism-proposal.md',
  FALSIFICATION_EXPERIMENT: 'falsification-experiment.md',
  ERROR_REPORT: 'error-report.md',
  SUCCESSOR_HYPOTHESIS: 'successor-hypothesis.md'
});

function validateContributionIntake(root = DEFAULT_ROOT) {
  const errors = [];
  const schemaPath = path.join(root, 'schemas/research-contribution.schema.json');
  if (!fs.existsSync(schemaPath)) {
    return { errors: ['Missing schemas/research-contribution.schema.json.'], checkedTemplates: [] };
  }

  let schema;
  try {
    schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  } catch (error) {
    return { errors: ['Research contribution schema is not valid JSON: ' + error.message], checkedTemplates: [] };
  }

  const contributionTypes = schema.properties?.contribution_type?.enum;
  if (!Array.isArray(contributionTypes) || contributionTypes.length === 0) {
    errors.push('Research contribution schema must define a non-empty contribution_type enum.');
    return { errors, checkedTemplates: [] };
  }

  const schemaTypes = new Set(contributionTypes);
  for (const contributionType of contributionTypes) {
    if (!CONTRIBUTION_TEMPLATE_MAP[contributionType]) {
      errors.push('No governed public intake template is mapped for contribution type ' + contributionType + '.');
    }
  }
  for (const contributionType of Object.keys(CONTRIBUTION_TEMPLATE_MAP)) {
    if (!schemaTypes.has(contributionType)) {
      errors.push('Contribution intake mapping contains stale type ' + contributionType + ' that is absent from the schema.');
    }
  }

  const checkedTemplates = [];
  for (const contributionType of contributionTypes) {
    const filename = CONTRIBUTION_TEMPLATE_MAP[contributionType];
    if (!filename) continue;
    const relativePath = '.github/ISSUE_TEMPLATE/' + filename;
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
      errors.push(contributionType + ' is missing governed public intake template ' + relativePath + '.');
      continue;
    }

    const text = fs.readFileSync(absolutePath, 'utf8');
    checkedTemplates.push(relativePath);
    if (!text.startsWith('---\n')) errors.push(relativePath + ' must retain GitHub issue-template frontmatter.');
    if (!/^name:\s*.+$/m.test(text)) errors.push(relativePath + ' is missing a frontmatter name.');
    if (!/^about:\s*.+$/m.test(text)) errors.push(relativePath + ' is missing a frontmatter about description.');
    if (!/^title:\s*.+$/m.test(text)) errors.push(relativePath + ' is missing a frontmatter title prefix.');
    if (!/^## Boundary\s*$/m.test(text)) errors.push(relativePath + ' must expose an explicit Boundary section.');
  }

  return { errors, checkedTemplates };
}

function run(root = DEFAULT_ROOT) {
  const result = validateContributionIntake(root);
  if (result.errors.length) {
    for (const error of result.errors) console.error('CONTRIBUTION INTAKE VALIDATION FAILED: ' + error);
    process.exitCode = 1;
    return result;
  }
  console.log('Contribution intake validation passed for ' + result.checkedTemplates.length + ' governed template(s).');
  return result;
}

if (require.main === module) run();

module.exports = {
  CONTRIBUTION_TEMPLATE_MAP,
  validateContributionIntake,
  run
};
