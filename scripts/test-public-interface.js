const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const validator = path.join(__dirname, 'validate-public-interface.js');
const siteBase = 'https://edulinked-coder.github.io/Osteosarcoma-Therapeutic-Hypotheses-Open-Machine-Readable-Research/';
const requiredDiscoveryRoutes = ['', 'search/', 'activity/', 'docs/quickstart/', 'evidence/', 'review/'];
let failed = false;

const fail = (message) => {
  console.error('PUBLIC INTERFACE TEST FAILED: ' + message);
  failed = true;
};

const validHtml = ({ href = 'data.json', img = '<img src="https://example.org/figure.png" alt="Decorative research diagram">', extra = '' } = {}) => `<!doctype html>
<html lang="en-AU">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fixture</title></head>
<body><main><h1>Fixture</h1><a href="${href}">Data</a>${img}${extra}</main></body>
</html>`;

const discoverySitemap = (routes = requiredDiscoveryRoutes) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes.map((route) => `  <url><loc>${siteBase}${route}</loc></url>`).join('\n')}
</urlset>
`;

const validDiscoveryFiles = () => ({
  'robots.txt': `User-agent: *\nAllow: /\n\nSitemap: ${siteBase}sitemap.xml\n`,
  'sitemap.xml': discoverySitemap(),
  'search/index.html': validHtml({ href: 'https://example.org/data' }),
  'activity/index.html': validHtml({ href: 'https://example.org/data' }),
  'docs/quickstart/index.html': validHtml({ href: 'https://example.org/data' }),
  'evidence/index.html': validHtml({ href: 'https://example.org/data' }),
  'review/index.html': validHtml({ href: 'https://example.org/data' })
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
runFixture('literal JavaScript anchor is blocked', validHtml({ href: 'javascript:alert(1)' }), false, {});
runFixture('encoded JavaScript anchor is blocked', validHtml({ href: 'java&#x73;cript:alert(1)' }), false, {});
runFixture('tab-obfuscated JavaScript anchor is blocked', validHtml({ href: 'java&#x09;script:alert(1)' }), false, {});
runFixture('inline HTML data anchor is blocked', validHtml({ href: 'data:text/html,unsafe' }), false, {});
runFixture('safe external HTTPS anchor', validHtml({ href: 'https://example.org/research' }), true, {});
runFixture('safe fragment anchor', validHtml({ href: '#summary' }), true, {});
runFixture('missing language', validHtml().replace(' lang="en-AU"', ''), false);
runFixture('missing image alt', validHtml({ img: '<img src="figure.png">' }), false);

runFixture('missing local image resource', validHtml({ img: '<img src="missing.svg" alt="Synthetic figure">' }), false);
runFixture('existing local image resource', validHtml({ img: '<img src="figure.svg" alt="Synthetic figure">' }), true,
  { 'data.json': '{}\\n', 'figure.svg': '<svg></svg>' });
runFixture('missing local JavaScript resource', validHtml({ extra: '<script src="missing.js"></script>' }), false);
runFixture('missing local stylesheet', validHtml({ extra: '<link rel="stylesheet" href="missing.css">' }), false);
runFixture('missing local media source', validHtml({ extra: '<audio><source src="missing.ogg"></audio>' }), false);
runFixture('external resources remain valid', validHtml({ extra:
  '<link rel="stylesheet" href="https://example.org/site.css"><script src="https://example.org/site.js"></script>' }), true);

runFixture('valid responsive image candidates', validHtml({ img:
  '<img srcset="small.svg 1x, large.svg 2x" alt="Synthetic responsive image">' }), true,
  { 'data.json': '{}', 'small.svg': '<svg></svg>', 'large.svg': '<svg></svg>' });
runFixture('missing second responsive image candidate', validHtml({ img:
  '<img srcset="small.svg 1x, absent.svg 2x" alt="Synthetic responsive image">' }), false,
  { 'data.json': '{}', 'small.svg': '<svg></svg>' });
runFixture('missing picture source candidate', validHtml({ extra:
  '<picture><source srcset="small.webp 480w, absent.webp 960w"></picture>' }), false,
  { 'data.json': '{}', 'small.webp': 'test' });
runFixture('valid picture source candidates', validHtml({ extra:
  '<picture><source srcset="small.webp 480w, large.webp 960w"></picture>' }), true,
  { 'data.json': '{}', 'small.webp': 'test', 'large.webp': 'test' });
runFixture('external responsive image candidates', validHtml({ img:
  '<img srcset="https://example.org/one.svg 1x, https://example.org/two.svg 2x" alt="External research image">' }), true);
runFixture('inline-data responsive candidate is blocked', validHtml({ img:
  '<img srcset="data:image/png;base64,AAAA 1x" alt="Inline synthetic image">' }), false);
runFixture('obfuscated executable responsive candidate is blocked', validHtml({ img:
  '<img srcset="java&#x73;cript:alert(1) 1x" alt="Synthetic image">' }), false);
runFixture('missing video poster', validHtml({ extra: '<video poster="absent.jpg"></video>' }), false);
runFixture('existing video poster', validHtml({ extra: '<video poster="cover.jpg"></video>' }), true,
  { 'data.json': '{}', 'cover.jpg': 'test' });
runFixture('missing direct video source', validHtml({ extra: '<video src="absent.mp4"></video>' }), false);
runFixture('missing direct audio source', validHtml({ extra: '<audio src="absent.ogg"></audio>' }), false);
runFixture('missing caption track', validHtml({ extra: '<video><track src="absent.vtt" kind="captions"></video>' }), false);
runFixture('valid media sources and caption track', validHtml({ extra:
  '<video src="clip.mp4" poster="cover.jpg"><track src="captions.vtt" kind="captions"></video>' }), true,
  { 'data.json': '{}', 'clip.mp4': 'test', 'cover.jpg': 'test', 'captions.vtt': 'WEBVTT' });

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
  'sitemap missing protected review route',
  validHtml(),
  false,
  {
    'data.json': '{}\n',
    ...validDiscoveryFiles(),
    'sitemap.xml': discoverySitemap(requiredDiscoveryRoutes.filter((route) => route !== 'review/'))
  },
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
