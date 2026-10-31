'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_ROOT = process.cwd();

const PUBLIC_TEXT_ROOTS = [
  '.github/ISSUE_TEMPLATE',
  '.github/pull_request_template.md',
  'AGENTS.md',
  'README.md',
  'docs',
  'index.html',
  'sitemap.xml',
  'robots.txt',
  'manifest.json',
  'repository-manifest.json',
  'hypotheses',
  'evidence',
  'search',
  'activity',
  'review',
  'indexes',
  'evidence-bindings',
  'contributions',
  'examples',
  'governance',
  'structured-data',
  'evidence-events',
  'schemas'
];

// GitHub Pages only receives these already scanned, deliberately public roots.
// Repository tooling and GitHub workflow files must not enter the Pages artifact.
const PUBLIC_SITE_ROOTS = PUBLIC_TEXT_ROOTS.filter((root) =>
  root !== '.github/ISSUE_TEMPLATE' && root !== '.github/pull_request_template.md'
);

// Explicitly scan common public text assets; reject other file types instead of silently skipping them.
const TEXT_EXTENSIONS = new Set(['.json', '.jsonld', '.html', '.md', '.txt', '.xml', '.yml', '.yaml', '.csv', '.tsv', '.css', '.js', '.svg']);
const PROHIBITED_KEYS = new Set([
  'patientname',
  'patientfullname',
  'patientid',
  'patientidentifier',
  'medicalrecord',
  'medicalrecords',
  'medicalrecordnumber',
  'mrn',
  'treatmenthistory',
  'clinicalnotes',
  'privateclinicalnotes',
  'dateofbirth',
  'dob',
  'credential',
  'credentials',
  'password',
  'passphrase',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'secrets',
  'clientsecret',
  'privatekey',
  'apikey',
  'clientid',
  'edulinkedappid',
  'enterpriseappprivatekey'
]);

const SECRET_PATTERNS = [
  { label: 'PEM private key material', regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/i },
  { label: 'GitHub access token material', regex: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/ },
  { label: 'OpenAI-style API key material', regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
  { label: 'AWS access key material', regex: /\bAKIA[0-9A-Z]{16}\b/ }
];

const CLINICAL_DIRECTIVE_PATTERNS = [
  {
    label: 'patient-directed treatment instruction',
    regex: /\b(?:this|the)\s+patient\s+(?:should|must|needs?\s+to)\s+(?:start|stop|switch(?:\s+to)?|continue|take|receive|use)\b/i
  },
  {
    label: 'patient-specific treatment recommendation',
    regex: /\bfor\s+(?:this|the)\s+patient\b[\s\S]{0,120}\b(?:recommend(?:ed|ation)?|start|stop|switch(?:\s+to)?|take|receive|use)\b/i
  },
  {
    label: 'patient-directed dosing instruction',
    regex: /\b(?:you|this\s+patient|the\s+patient)\s+(?:should\s+|must\s+)?(?:take|use|receive)\s+\d+(?:\.\d+)?\s*(?:mg|g|mcg|ug|ml)\b/i
  },
  {
    label: 'claim of individual patient benefit',
    regex: /\b(?:this|the)\s+(?:treatment|therapy|regimen|intervention)\s+(?:will|is\s+expected\s+to)\s+(?:benefit|help|improve(?:\s+outcomes?\s+for)?)\s+(?:this|the)\s+patient\b/i
  }
];

function normaliseKey(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
}

// JSON keys are untrusted input. Never reproduce them in CI diagnostics:
// use a position, or a fixed allowlisted prohibited-key classification.
function safeFieldPointer(pointer, key, fieldIndex) {
  const normalised = normaliseKey(key);
  return pointer + '[' + (PROHIBITED_KEYS.has(normalised) ? normalised : 'field:' + fieldIndex) + ']';
}

function scanClinicalBoundaryLanguage(value, pointer = '$', errors = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanClinicalBoundaryLanguage(item, pointer + '[' + index + ']', errors));
    return errors;
  }
  if (typeof value === 'string') {
    for (const pattern of CLINICAL_DIRECTIVE_PATTERNS) {
      if (pattern.regex.test(value)) errors.push(pointer + ' contains ' + pattern.label + '.');
    }
    return errors;
  }
  if (!value || typeof value !== 'object') return errors;

  let fieldIndex = 0;
  for (const [key, child] of Object.entries(value)) {
    scanClinicalBoundaryLanguage(child, safeFieldPointer(pointer, key, fieldIndex++), errors);
  }
  return errors;
}

function scanStructuredValue(value, pointer = '$', errors = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanStructuredValue(item, pointer + '[' + index + ']', errors));
    return errors;
  }
  if (typeof value === 'string') {
    return scanClinicalBoundaryLanguage(value, pointer, errors);
  }
  if (!value || typeof value !== 'object') return errors;

  let fieldIndex = 0;
  for (const [key, child] of Object.entries(value)) {
    const normalised = normaliseKey(key);
    const childPointer = safeFieldPointer(pointer, key, fieldIndex++);
    if (PROHIBITED_KEYS.has(normalised)) {
      errors.push(childPointer + ' uses a prohibited public field name.');
    }
    scanStructuredValue(child, childPointer, errors);
  }
  return errors;
}

function scanSecretMaterial(text, relativePath) {
  const errors = [];
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.regex.test(text)) {
      errors.push(relativePath + ' contains ' + pattern.label + '.');
    }
  }
  return errors;
}

function collectFiles(root, relativeRoot, extensions = null, errors = []) {
  const absolute = path.join(root, relativeRoot);
  let stat;
  try {
    stat = fs.lstatSync(absolute, { throwIfNoEntry: false });
  } catch {
    errors.push(relativeRoot + ' cannot be inspected in the public safety scan.');
    return [];
  }
  if (!stat) return [];
  if (stat.isSymbolicLink()) {
    errors.push(relativeRoot + ' is a symbolic link in the public safety scan; links are prohibited.');
    return [];
  }
  if (stat.isFile()) {
    const ext = path.extname(relativeRoot).toLowerCase();
    if (!extensions || extensions.has(ext) || path.basename(relativeRoot) === 'robots.txt') return [relativeRoot];
    errors.push(relativeRoot + ' has an unscanned file type in a public safety root.');
    return [];
  }
  if (!stat.isDirectory()) {
    errors.push(relativeRoot + ' is not a regular file or directory in the public safety scan.');
    return [];
  }

  let entries;
  try {
    entries = fs.readdirSync(absolute, { withFileTypes: true });
  } catch {
    errors.push(relativeRoot + ' cannot be read during the public safety scan.');
    return [];
  }
  const files = [];
  for (const entry of entries) {
    const child = path.join(relativeRoot, entry.name).replace(/\\/g, '/');
    if (entry.isSymbolicLink()) {
      errors.push(child + ' is a symbolic link in the public safety scan; links are prohibited.');
    } else if (entry.isDirectory()) {
      files.push(...collectFiles(root, child, extensions, errors));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (!extensions || extensions.has(ext) || entry.name === 'robots.txt') files.push(child);
      else errors.push(child + ' has an unscanned file type in a public safety root.');
    } else {
      errors.push(child + ' is not a regular file or directory in the public safety scan.');
    }
  }
  return files;
}

function collectUnique(root, roots, extensions = null, errors = []) {
  return [...new Set(roots.flatMap((relativeRoot) => collectFiles(root, relativeRoot, extensions, errors)))].sort();
}

function validateRepositoryPublicSafety(root = DEFAULT_ROOT) {
  const errors = [];
  const textFiles = collectUnique(root, PUBLIC_TEXT_ROOTS, TEXT_EXTENSIONS, errors);
  // Scan every public JSON document for prohibited fields, including future
  // review, documentation and discovery payloads outside the canonical roots.
  const structuredFiles = new Set(
    textFiles.filter((relativePath) => {
      const extension = path.extname(relativePath).toLowerCase();
      return extension === '.json' || extension === '.jsonld';
    })
  );

  for (const relativePath of textFiles) {
    let text;
    try {
      text = fs.readFileSync(path.join(root, relativePath), 'utf8');
    } catch {
      errors.push(relativePath + ' could not be read during the public safety scan.');
      continue;
    }
    errors.push(...scanSecretMaterial(text, relativePath));

    if (structuredFiles.has(relativePath)) {
      // JSON.parse discards overwritten duplicate-key values, but those bytes
      // remain in the public file. Scan raw JSON for clinical directives too.
      // The parsed scan below still catches escaped JSON string content.
      for (const message of scanClinicalBoundaryLanguage(text, '$raw-json')) {
        errors.push(relativePath + ' ' + message);
      }
      let value;
      try {
        value = JSON.parse(text);
      } catch {
        // JSON parser errors can include excerpts of malformed, potentially private input.
        errors.push(relativePath + ' is not valid JSON; contents omitted from diagnostics.');
        continue;
      }
      for (const message of scanStructuredValue(value)) {
        errors.push(relativePath + ' ' + message);
      }
    } else {
      for (const message of scanClinicalBoundaryLanguage(text, '$text')) {
        errors.push(relativePath + ' ' + message);
      }
    }
  }

  return { errors: [...new Set(errors)], scannedFiles: textFiles };
}

// Package only the files that passed the existing public-payload scan.
// Never upload the whole repository checkout to GitHub Pages.
function stagePagesSite(root = DEFAULT_ROOT) {
  const sourceRoot = path.resolve(root);
  const outputDir = path.join(sourceRoot, '_pages_site');
  const scan = validateRepositoryPublicSafety(sourceRoot);
  const result = { errors: [...scan.errors], scannedFiles: scan.scannedFiles, stagedFiles: [], outputDir };

  // A failed re-stage must not leave an earlier, apparently valid artifact.
  try {
    fs.rmSync(outputDir, { recursive: true, force: true });
  } catch {
    result.errors.push('Existing Pages staging directory could not be cleared safely.');
    return result;
  }
  if (result.errors.length) return result;

  const selectedFiles = scan.scannedFiles.filter((relativePath) =>
    PUBLIC_SITE_ROOTS.some((siteRoot) =>
      relativePath === siteRoot || relativePath.startsWith(siteRoot + '/'))
  );
  const requiredFiles = [
    'index.html',
    'manifest.json',
    'robots.txt',
    'sitemap.xml',
    'schemas/therapeutic-hypothesis.schema.json'
  ];
  for (const required of requiredFiles) {
    if (!selectedFiles.includes(required)) {
      result.errors.push(required + ' is required in the Pages artifact but was not safely scanned.');
    }
  }
  if (result.errors.length) return result;

  for (const relativePath of selectedFiles) {
    try {
      const source = path.join(sourceRoot, relativePath);
      const target = path.join(outputDir, relativePath);
      // Check the concrete file again immediately before copy.
      if (!fs.lstatSync(source).isFile()) {
        result.errors.push(relativePath + ' is not a regular file for Pages staging.');
        break;
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
      result.stagedFiles.push(relativePath);
    } catch {
      result.errors.push(relativePath + ' could not be copied into the public Pages artifact.');
      break;
    }
  }

  if (result.errors.length) {
    try {
      fs.rmSync(outputDir, { recursive: true, force: true });
    } catch {
      result.errors.push('Incomplete Pages staging directory could not be cleared safely.');
    }
    result.stagedFiles = [];
  }
  return result;
}

function runStagePagesSite(root = DEFAULT_ROOT) {
  const result = stagePagesSite(root);
  if (result.errors.length) {
    for (const error of result.errors) console.error('PUBLIC PAGES STAGING FAILED: ' + error);
    process.exitCode = 1;
    return result;
  }
  console.log('Staged ' + result.stagedFiles.length + ' scanned public files for GitHub Pages.');
  return result;
}

function run(root = DEFAULT_ROOT) {
  const result = validateRepositoryPublicSafety(root);
  if (result.errors.length) {
    for (const error of result.errors) console.error('PUBLIC SAFETY VALIDATION FAILED: ' + error);
    process.exitCode = 1;
    return result;
  }
  console.log('Public safety payload validation passed for ' + result.scannedFiles.length + ' public text file(s).');
  return result;
}

if (require.main === module) {
  if (process.argv.length === 2) run();
  else if (process.argv.length === 3 && process.argv[2] === '--stage-pages-site') runStagePagesSite();
  else { console.error('Unsupported public-safety command.'); process.exitCode = 1; }
}

module.exports = {
  PROHIBITED_KEYS,
  SECRET_PATTERNS,
  CLINICAL_DIRECTIVE_PATTERNS,
  normaliseKey,
  scanClinicalBoundaryLanguage,
  scanStructuredValue,
  scanSecretMaterial,
  validateRepositoryPublicSafety,
  PUBLIC_SITE_ROOTS,
  stagePagesSite,
  runStagePagesSite,
  run
};
