const fs = require('fs');
const path = require('path');

const root = process.cwd();
const checkOnly = process.argv.includes('--check');
const sourcePath = 'repository-manifest.json';
const outputPath = 'manifest.json';

const source = JSON.parse(fs.readFileSync(path.join(root, sourcePath), 'utf8'));
if (source.clinical_use !== false) throw new Error(sourcePath + ' must preserve clinical_use:false.');
if (!source.manifest_projection || source.manifest_projection.contract_entry_point !== outputPath) {
  throw new Error(sourcePath + ' must declare ' + outputPath + ' as the contract entry point.');
}
if (source.manifest_projection.canonical_source !== sourcePath) {
  throw new Error(sourcePath + ' must remain the canonical manifest source.');
}
if (source.manifest_projection.manual_edit_allowed !== false) {
  throw new Error(sourcePath + ' must prohibit independent manual maintenance of ' + outputPath + '.');
}

const reviewRegister = 'governance/evidence-relationship-review-exceptions.json';
const reviewProjection = 'review/';
if (source.canonical_object_locations?.protected_review_register !== reviewRegister) {
  throw new Error(sourcePath + ' must expose the governed protected-review register.');
}
if (source.canonical_object_locations?.protected_review_projection !== reviewProjection) {
  throw new Error(sourcePath + ' must expose the human protected-review projection.');
}
if (!Array.isArray(source.machine_entry_points) || !source.machine_entry_points.includes(reviewRegister)) {
  throw new Error(sourcePath + ' machine_entry_points must expose the governed protected-review register.');
}
if (!Array.isArray(source.human_entry_points) || !source.human_entry_points.includes(reviewProjection)) {
  throw new Error(sourcePath + ' human_entry_points must expose the protected-review projection.');
}
const reviewBoundary = source.protected_review_boundary || {};
if (reviewBoundary.source_of_truth !== reviewRegister || reviewBoundary.human_projection !== reviewProjection) {
  throw new Error(sourcePath + ' protected_review_boundary must bind the review projection to the governed register.');
}
if (reviewBoundary.scientific_resolution_created_by_projection !== false ||
    reviewBoundary.registered_exception_allows_autonomous_normalisation !== false ||
    reviewBoundary.requires_attributable_scientific_decision !== true ||
    reviewBoundary.clinical_use_authority_transferred !== false ||
    reviewBoundary.publication_authority_transferred !== false) {
  throw new Error(sourcePath + ' protected_review_boundary must preserve human scientific authority and prohibit autonomous normalisation.');
}

const rendered = JSON.stringify(source, null, 2) + '\n';
const target = path.join(root, outputPath);

if (checkOnly) {
  if (!fs.existsSync(target)) {
    console.error('STALE GENERATED MANIFEST: missing ' + outputPath);
    process.exitCode = 1;
  } else if (fs.readFileSync(target, 'utf8') !== rendered) {
    console.error('STALE GENERATED MANIFEST: ' + outputPath + ' does not match ' + sourcePath);
    process.exitCode = 1;
  } else {
    console.log(outputPath + ' matches ' + sourcePath + ', including protected-review discovery boundaries.');
  }
} else {
  fs.writeFileSync(target, rendered, 'utf8');
  console.log('Generated ' + outputPath + ' from ' + sourcePath + '.');
}
