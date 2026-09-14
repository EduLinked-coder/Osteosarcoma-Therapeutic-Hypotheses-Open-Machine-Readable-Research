const fs = require('fs');
const path = require('path');

const root = process.cwd();
const searchPath = path.join(root, 'search', 'index.html');
const indexPath = path.join(root, 'indexes', 'hypotheses.json');
const reviewRegisterPath = path.join(root, 'governance', 'evidence-relationship-review-exceptions.json');
const stableIdPattern = /^OS-TH-[0-9]{4}$/;
let failed = false;

const fail = (message) => {
  console.error('SEARCH VALIDATION FAILED: ' + message);
  failed = true;
};
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

if (!fs.existsSync(searchPath)) {
  fail('Missing search/index.html.');
} else {
  const html = fs.readFileSync(searchPath, 'utf8');
  const requiredFragments = [
    "const indexPath = '../indexes/hypotheses.json';",
    "const reviewRegisterPath = '../governance/evidence-relationship-review-exceptions.json';",
    'const safeCanonicalPath = /^hypotheses\\/OS-TH-[0-9]{4}\\/hypothesis\\.json$/;',
    'id="disease-context"',
    'id="research-classification"',
    'id="protected-review"',
    "protectedReview: document.getElementById('protected-review')",
    'const diseaseContextValues = (h) => [text(h.disease_context?.disease), text(h.disease_context?.context)].filter(Boolean);',
    'controls.diseaseContext.value && !diseaseContextValues(h).includes(controls.diseaseContext.value)',
    'controls.researchClassification.value && h.research_classification !== controls.researchClassification.value',
    "controls.protectedReview.value === 'required' && protectedReview.length === 0",
    "controls.protectedReview.value === 'none' && protectedReview.length !== 0",
    'addOptions(controls.diseaseContext, records.flatMap(diseaseContextValues));',
    'addOptions(controls.researchClassification, records.map((h) => h.research_classification));',
    'Disease context is research-object metadata, not patient-specific clinical information.',
    'Protected-review filtering derives only from the governed evidence-relationship review-exception register.',
    'A registered exception records an unresolved interpretation and does not decide which relationship is correct.',
    "fetch(reviewRegisterPath, { cache: 'no-store' })",
    "exception.status !== 'HUMAN_SCIENTIFIC_REVIEW_REQUIRED'",
    'exception.clinical_use !== false',
    "reviewLink.href = '../review/';",
    'A registered disagreement is not scientific resolution.',
    'id="updated-since" type="date"',
    'id="updated-before" type="date"',
    "const canonicalUpdateDate = (h) => text(h.provenance?.updated_at).slice(0, 10);",
    'updateDate < controls.updatedSince.value',
    'updateDate > controls.updatedBefore.value',
    'They do not imply that literature searches are complete through that date.',
    'not medical advice, treatment recommendations, dosing instructions or claims of patient benefit'
  ];

  for (const fragment of requiredFragments) {
    if (!html.includes(fragment)) fail('search/index.html is missing required canonical-search fragment: ' + fragment);
  }

  if (html.includes('const records = [') || html.includes('window.__HYPOTHESES__')) {
    fail('Search must not embed a second hypothesis database.');
  }
  if (html.includes('const protectedReview = [') || html.includes('window.__REVIEW_EXCEPTIONS__')) {
    fail('Search must not embed a second protected-review register.');
  }
  if (!html.includes("fetch('../' + canonicalPath")) {
    fail('Search must load each canonical hypothesis object through its validated canonical path.');
  }
  if (!html.includes("if (object.hypothesis_id !== entry.hypothesis_id)")) {
    fail('Search must fail closed on index/object identifier mismatch.');
  }

  if (!fs.existsSync(indexPath)) {
    fail('Missing indexes/hypotheses.json for protected-review search binding validation.');
  }
  if (!fs.existsSync(reviewRegisterPath)) {
    fail('Missing governed evidence-relationship review-exception register.');
  }

  if (fs.existsSync(indexPath) && fs.existsSync(reviewRegisterPath)) {
    let index;
    let reviewRegister;
    try {
      index = readJson(indexPath);
    } catch (error) {
      fail('Hypothesis index is not valid JSON: ' + error.message);
    }
    try {
      reviewRegister = readJson(reviewRegisterPath);
    } catch (error) {
      fail('Protected-review register is not valid JSON: ' + error.message);
    }

    if (index && reviewRegister) {
      if (!Array.isArray(index.hypotheses)) {
        fail('Hypothesis index must contain a hypotheses array.');
      }
      if (!Array.isArray(reviewRegister.exceptions)) {
        fail('Protected-review register must contain an exceptions array.');
      }
      if (typeof reviewRegister.authority_boundary !== 'string' || !reviewRegister.authority_boundary.trim()) {
        fail('Protected-review register must retain an explicit authority boundary.');
      }

      if (Array.isArray(index.hypotheses) && Array.isArray(reviewRegister.exceptions)) {
        const indexedIds = new Set(index.hypotheses.map((entry) => entry.hypothesis_id));
        for (const exception of reviewRegister.exceptions) {
          if (!stableIdPattern.test(exception.hypothesis_id || '')) {
            fail('Protected-review exception has invalid stable hypothesis ID: ' + exception.hypothesis_id);
          }
          if (!indexedIds.has(exception.hypothesis_id)) {
            fail('Protected-review exception references hypothesis outside canonical index: ' + exception.hypothesis_id);
          }
          if (exception.status !== 'HUMAN_SCIENTIFIC_REVIEW_REQUIRED') {
            fail('Protected-review exception must remain HUMAN_SCIENTIFIC_REVIEW_REQUIRED for ' + exception.hypothesis_id + '.');
          }
          if (exception.clinical_use !== false) {
            fail('Protected-review exception must preserve clinical_use:false for ' + exception.hypothesis_id + '.');
          }

          for (const field of ['evidence_id', 'hypothesis_relationship', 'binding_relationship']) {
            const value = exception[field];
            if (typeof value === 'string' && value.trim() && html.includes(value)) {
              fail('Search must derive protected-review scientific value ' + field + ' from the governed register rather than embed ' + JSON.stringify(value) + '.');
            }
          }
        }
      }
    }
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log('Search contract validation passed, including governed protected-review discovery.');
}
