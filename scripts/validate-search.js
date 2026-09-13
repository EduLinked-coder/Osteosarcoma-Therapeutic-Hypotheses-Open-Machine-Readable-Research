const fs = require('fs');
const path = require('path');

const root = process.cwd();
const searchPath = path.join(root, 'search', 'index.html');
let failed = false;

const fail = (message) => {
  console.error('SEARCH VALIDATION FAILED: ' + message);
  failed = true;
};

if (!fs.existsSync(searchPath)) {
  fail('Missing search/index.html.');
} else {
  const html = fs.readFileSync(searchPath, 'utf8');
  const requiredFragments = [
    "const indexPath = '../indexes/hypotheses.json';",
    'const safeCanonicalPath = /^hypotheses\\/OS-TH-[0-9]{4}\\/hypothesis\\.json$/;',
    'id="updated-since" type="date"',
    'id="updated-before" type="date"',
    "const canonicalUpdateDate = (h) => text(h.provenance?.updated_at).slice(0, 10);",
    'updateDate < controls.updatedSince.value',
    'updateDate > controls.updatedBefore.value',
    'They do not imply that literature searches are complete through that date.',
    'Research priority only'
  ];

  for (const fragment of requiredFragments) {
    if (!html.includes(fragment)) fail('search/index.html is missing required canonical-search fragment: ' + fragment);
  }

  if (html.includes('const records = [') || html.includes('window.__HYPOTHESES__')) {
    fail('Search must not embed a second hypothesis database.');
  }
  if (!html.includes("fetch('../' + canonicalPath")) {
    fail('Search must load each canonical hypothesis object through its validated canonical path.');
  }
  if (!html.includes("if (object.hypothesis_id !== entry.hypothesis_id)")) {
    fail('Search must fail closed on index/object identifier mismatch.');
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log('Search contract validation passed.');
}
