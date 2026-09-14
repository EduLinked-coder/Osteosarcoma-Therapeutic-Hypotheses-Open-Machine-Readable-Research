const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const validator = path.join(__dirname, 'validate-public-interface.js');
const siteBase = 'https://edulinked-coder.github.io/Osteosarcoma-Therapeutic-Hypotheses-Open-Machine-Readable-Research/';
let failed = false;

const fail = (message) => {
  console.error('PUBLIC INTERFACE TEST FAILED: ' + message);
  failed = true;
};

const validHtml = ({ href = 'data.json', img = '<img src="figure.png" alt="Decorative research diagram">', extra = '' } = {}) => `<!doctype html>
<html lang="en-AU">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fixture</title></head>
<body><main><h1>Fixture</h1><a href="${href}">Data</a>${img}${extra}</main></body>
</html>`;

const validDiscoveryFiles = () => ({
  'robots.txt': `User-agent: *\nAllow: /\n\nSitemap: ${siteBase}sitemap.xml\n`,
  'sitemap.xml': `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${siteBase}</loc></url>\n</urlset>\n`
});

const runFixture = (name, html, shouldPass, extraFiles = { 'data.json': '{}\n' }, discovery = false) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osteosarcoma-interface-'));
  try {
    fs.writeFileSync(path.join(dir, 'index.html'), html);
    for (const [file, content] of Object.entries(extraFiles)) {
      const target = path.join(dir, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
    const validatorArgs = [validator, '--root', dir];
    if (discovery) validatorArgs.push('--discovery');
    const result = spawnSync(process.execPath, validatorArgs, { encoding: 'utf8' });
    const passed = result.status === 0;
    if (passed !== shouldPass) {
      fail(name + ' expected ' + (shouldPass ? 'success' : 'failure') + ' but got exit ' + result.status + '. Output: ' + result.stdout + result.stderr);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

runFixture('valid accessible page', validHtml(), true);
runFixture('valid heading hierarchy', validHtml({ extra: '<section><h2>Section</h2><h3>Detail</h3></section>' }), true);
runFixture('skipped heading level', validHtml({ extra: '<h3>Skipped level</h3>' }), false);
runFixture('broken local link', validHtml({ href: 'missing.json' }), false, {});
runFixture('missing language', validHtml().replace(' lang="en-AU"', ''), false);
runFixture('missing image alt', validHtml({ img: '<img src="figure.png">' }), false);
runFixture('positive tabindex', validHtml({ extra: '<button tabindex="2">Unsafe order</button>' }), false);
runFixture('labelled form control', validHtml({ extra: '<label for="query">Search</label><input id="query" type="search">' }), true);
runFixture('aria-labelled form control', validHtml({ extra: '<span id="query-label">Search</span><input type="search" aria-labelledby="query-label">' }), true);
runFixture('direct aria-label form control', validHtml({ extra: '<select aria-label="Evidence stage"><option>All</option></select>' }), true);
runFixture('unlabelled form control', validHtml({ extra: '<input id="query" type="search">' }), false);
runFixture('missing aria-labelledby target', validHtml({ extra: '<input type="search" aria-labelledby="missing-label">' }), false);
runFixture('hidden input without label', validHtml({ extra: '<input type="hidden" value="state">' }), true);
runFixture('unnamed button', validHtml({ extra: '<button></button>' }), false);
runFixture('aria-labelled button', validHtml({ extra: '<button aria-label="Reset filters"></button>' }), true);
runFixture('unsafe new window', validHtml({ extra: '<a href="https://example.org" target="_blank">External</a>' }), false);
runFixture('safe new window', validHtml({ extra: '<a href="https://example.org" target="_blank" rel="noopener noreferrer">External</a>' }), true);

runFixture(
  'valid robots and sitemap discovery contract',
  validHtml(),
  true,
  { 'data.json': '{}\n', ...validDiscoveryFiles() },
  true
);

runFixture(
  'noncanonical robots sitemap directive',
  validHtml(),
  false,
  {
    'data.json': '{}\n',
    ...validDiscoveryFiles(),
    'robots.txt': 'User-agent: *\nAllow: /\n\nSitemap: https://example.org/sitemap.xml\n'
  },
  true
);

runFixture(
  'sitemap external location',
  validHtml(),
  false,
  {
    'data.json': '{}\n',
    ...validDiscoveryFiles(),
    'sitemap.xml': '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.org/</loc></url></urlset>\n'
  },
  true
);

runFixture(
  'sitemap missing local target',
  validHtml(),
  false,
  {
    'data.json': '{}\n',
    ...validDiscoveryFiles(),
    'sitemap.xml': `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${siteBase}missing/</loc></url></urlset>\n`
  },
  true
);

runFixture(
  'sitemap duplicate location',
  validHtml(),
  false,
  {
    'data.json': '{}\n',
    ...validDiscoveryFiles(),
    'sitemap.xml': `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${siteBase}</loc></url><url><loc>${siteBase}</loc></url></urlset>\n`
  },
  true
);

if (failed) {
  process.exitCode = 1;
} else {
  console.log('Public interface and discovery fail-closed fixture tests passed.');
}
