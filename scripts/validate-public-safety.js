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
  'evidence-events'
];

const STRUCTURED_DATA_ROOTS = [
  'manifest.json',
  'repository-manifest.json',
  'hypotheses',
  'indexes',
  'evidence-bindings',
  'contributions',
  'examples/contributions',
  'examples/evidence-bindings',
  'governance',
  'structured-data',
  'evidence-events'
];

const TEXT_EXTENSIONS = new Set(['.json', '.jsonld', '.html', '.md', '.txt', '.xml', '.yml', '.yaml']);
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

  for (const [key, child] of Object.entries(value)) {
    scanClinicalBoundaryLanguage(child, pointer + '.' + key, errors);
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

  for (const [key, child] of Object.entries(value)) {
    const normalised = normaliseKey(key);
    if (PROHIBITED_KEYS.has(normalised)) {
      errors.push(pointer + '.' + key + ' uses a prohibited public field name.');
    }
    scanStructuredValue(child, pointer + '.' + key, errors);
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

function collectFiles(root, relativeRoot, extensions = null) {
  const absolute = path.join(root, relativeRoot);
  if (!fs.existsSync(absolute)) return [];
  const stat = fs.statSync(absolute);
  if (stat.isFile()) {
    const ext = path.extname(relativeRoot).toLowerCase();
    if (!extensions || extensions.has(ext) || path.basename(relativeRoot) === 'robots.txt') return [relativeRoot];
    return [];
  }

  const files = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const child = path.join(relativeRoot, entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) files.push(...collectFiles(root, child, extensions));
    else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (!extensions || extensions.has(ext) || entry.name === 'robots.txt') files.push(child);
    }
  }
  return files;
}

function collectUnique(root, roots, extensions = null) {
  return [...new Set(roots.flatMap((relativeRoot) => collectFiles(root, relativeRoot, extensions)))].sort();
}

function validateRepositoryPublicSafety(root = DEFAULT_ROOT) {
  const errors = [];
  const textFiles = collectUnique(root, PUBLIC_TEXT_ROOTS, TEXT_EXTENSIONS);
  const structuredFiles = new Set(collectUnique(root, STRUCTURED_DATA_ROOTS, new Set(['.json', '.jsonld'])));

  for (const relativePath of textFiles) {
    const text = fs.readFileSync(path.join(root, relativePath), 'utf8');
    errors.push(...scanSecretMaterial(text, relativePath));

    if (structuredFiles.has(relativePath)) {
      let value;
      try {
        value = JSON.parse(text);
      } catch (error) {
        errors.push(relativePath + ' is not valid JSON: ' + error.message);
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

  return { errors, scannedFiles: textFiles };
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

if (require.main === module) run();

module.exports = {
  PROHIBITED_KEYS,
  SECRET_PATTERNS,
  CLINICAL_DIRECTIVE_PATTERNS,
  normaliseKey,
  scanClinicalBoundaryLanguage,
  scanStructuredValue,
  scanSecretMaterial,
  validateRepositoryPublicSafety,
  run
};
