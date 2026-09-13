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
    console.log(outputPath + ' matches ' + sourcePath + '.');
  }
} else {
  fs.writeFileSync(target, rendered, 'utf8');
  console.log('Generated ' + outputPath + ' from ' + sourcePath + '.');
}
