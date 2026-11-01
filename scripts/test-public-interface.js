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


runFixture('CSS stylesheet missing referenced asset', validHtml({ extra:
  '<link rel="stylesheet" href="site.css">' }), false,
  { 'data.json': '{}', 'site.css': 'body{background:url(missing.svg)}' });
runFixture('CSS stylesheet existing referenced asset', validHtml({ extra:
  '<link rel="stylesheet" href="site.css">' }), true,
  { 'data.json': '{}', 'site.css': 'body{background:url(assets/cover.svg)}',
    'assets/cover.svg': '<svg></svg>' });
runFixture('CSS quoted import missing stylesheet', validHtml({ extra:
  '<link rel="stylesheet" href="site.css">' }), false,
  { 'data.json': '{}', 'site.css': '@import "styles/missing.css";' });
runFixture('CSS quoted import resolves relative to imported file', validHtml({ extra:
  '<link rel="stylesheet" href="site.css">' }), true,
  { 'data.json': '{}', 'site.css': '@import "styles/inner.css";',
    'styles/inner.css': 'body{background:url(../image.svg)}',
    'image.svg': '<svg></svg>' });
runFixture('CSS url import missing stylesheet', validHtml({ extra:
  '<link rel="stylesheet" href="site.css">' }), false,
  { 'data.json': '{}', 'site.css': '@import url("missing.css");' });
runFixture('inline style element missing resource', validHtml({ extra:
  '<style>.figure{background:url(missing.svg)}</style>' }), false);
runFixture('inline style attribute missing resource', validHtml({ extra:
  '<div style="background-image:url(missing.svg)">Fixture</div>' }), false);
runFixture('CSS inline-data URL blocked', validHtml({ extra:
  '<style>.figure{background:url(data:image/svg+xml;base64,AAAA)}</style>' }), false);
runFixture('CSS escaped executable URL blocked', validHtml({ extra:
  '<style>.figure{background:url("java\\73 cript:alert(1)")}</style>' }), false);
runFixture('CSS comments do not invent dependencies', validHtml({ extra:
  '<style>/* url(missing.svg) */ .figure{color:navy}</style>' }), true);
runFixture('external HTTPS CSS asset remains valid', validHtml({ extra:
  '<style>.figure{background:url(https://example.org/figure.svg)}</style>' }), true);

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

runFixture('missing local preload resource', validHtml({ extra:
  '<link rel="preload" as="script" href="assets/missing.js">' }), false);
runFixture('missing local modulepreload resource', validHtml({ extra:
  '<link rel="modulepreload" href="missing.mjs">' }), false);
runFixture('missing local prefetch resource', validHtml({ extra:
  '<link rel="prefetch" href="missing.json">' }), false);
runFixture('missing local icon resource', validHtml({ extra:
  '<link rel="icon" href="missing.svg">' }), false);
runFixture('missing local PWA manifest', validHtml({ extra:
  '<link rel="manifest" href="missing.webmanifest">' }), false);
runFixture('valid local preload, icon and modulepreload resources', validHtml({ extra:
  '<link rel="preload" as="script" href="assets/app.js">' +
  '<link rel="icon" href="assets/icon.svg">' +
  '<link rel="modulepreload" href="assets/module.js">' }), true,
  { 'data.json': '{}', 'assets/app.js': '// synthetic', 'assets/icon.svg': '<svg></svg>',
    'assets/module.js': '// synthetic' });
runFixture('external HTTPS preload remains valid', validHtml({ extra:
  '<link rel="preload" as="script" href="https://example.org/app.js">' }), true);
runFixture('canonical and connection-hint relations remain exempt', validHtml({ extra:
  '<link rel="canonical" href="https://example.org/research">' +
  '<link rel="preconnect" href="https://example.org">' +
  '<link rel="dns-prefetch" href="//example.org">' }), true);
runFixture('unsafe inline-data preload is rejected', validHtml({ extra:
  '<link rel="preload" href="data:text/html,unsafe">' }), false);
runFixture('encoded executable icon URL is rejected', validHtml({ extra:
  '<link rel="icon" href="java&#x73;cript:alert(1)">' }), false);
runFixture('missing asset-link href is rejected', validHtml({ extra:
  '<link rel="preload" as="script">' }), false);
runFixture('fragment-only asset-link href is rejected', validHtml({ extra:
  '<link rel="icon" href="#fragment">' }), false);

runFixture('valid local iframe document', validHtml({ extra:
  '<iframe title="Synthetic paper" src="docs/paper.html"></iframe>' }), true,
  { 'data.json': '{}', 'docs/paper.html': validHtml({ href: 'https://example.org/data' }) });
runFixture('missing local iframe document', validHtml({ extra:
  '<iframe title="Synthetic paper" src="docs/missing.html"></iframe>' }), false);
runFixture('external HTTPS iframe remains valid', validHtml({ extra:
  '<iframe title="External research" src="https://example.org/research"></iframe>' }), true);
runFixture('encoded executable iframe URL blocked', validHtml({ extra:
  '<iframe title="Synthetic" src="java&#x73;cript:alert(1)"></iframe>' }), false);
runFixture('inline-data iframe URL blocked', validHtml({ extra:
  '<iframe title="Synthetic" src="data:text/html,unsafe"></iframe>' }), false);
runFixture('iframe srcdoc cannot bypass staged-file inspection', validHtml({ extra:
  '<iframe title="Synthetic" srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe>' }), false);
runFixture('iframe srcdoc blocked even with valid src', validHtml({ extra:
  '<iframe title="Synthetic" src="docs/paper.html" srcdoc="Synthetic inline document"></iframe>' }), false,
  { 'data.json': '{}', 'docs/paper.html': validHtml({ href: 'https://example.org/data' }) });
runFixture('valid local object document', validHtml({ extra:
  '<object data="assets/diagram.svg" type="image/svg+xml"></object>' }), true,
  { 'data.json': '{}', 'assets/diagram.svg': '<svg></svg>' });
runFixture('missing local object document', validHtml({ extra:
  '<object data="missing.svg" type="image/svg+xml"></object>' }), false);
runFixture('object without data URL blocked', validHtml({ extra:
  '<object type="image/svg+xml"></object>' }), false);
runFixture('fragment-only object document blocked', validHtml({ extra:
  '<object data="#figure"></object>' }), false);
runFixture('valid local embed document', validHtml({ extra:
  '<embed src="assets/chart.svg" type="image/svg+xml">' }), true,
  { 'data.json': '{}', 'assets/chart.svg': '<svg></svg>' });
runFixture('missing local embed document', validHtml({ extra:
  '<embed src="assets/missing.svg" type="image/svg+xml">' }), false);
runFixture('encoded executable embed URL blocked', validHtml({ extra:
  '<embed src="java&#x73;cript:alert(1)">' }), false);
runFixture('embed without src blocked', validHtml({ extra:
  '<embed type="image/svg+xml">' }), false);


runFixture('empty declared image source fails closed', validHtml({ img:
  '<img src="" alt="Synthetic figure">' }), false);
runFixture('fragment-only declared image source fails closed', validHtml({ img:
  '<img src="#figure" alt="Synthetic figure">' }), false);
runFixture('whitespace-only script source fails closed', validHtml({ extra:
  '<script src="   "></script>' }), false);
runFixture('empty media track source fails closed', validHtml({ extra:
  '<video><track kind="captions" src=""></video>' }), false);
runFixture('empty video poster fails closed', validHtml({ extra:
  '<video poster=""></video>' }), false);
runFixture('empty responsive image candidate list fails closed', validHtml({ img:
  '<img srcset="" alt="Synthetic figure">' }), false);
runFixture('separator-only responsive image list fails closed', validHtml({ img:
  '<img srcset=" , ,, " alt="Synthetic figure">' }), false);
runFixture('fragment-only responsive image candidate fails closed', validHtml({ img:
  '<img srcset="#figure 1x" alt="Synthetic figure">' }), false);
runFixture('ordinary referenced media still passes', validHtml({ extra:
  '<audio src="clip.ogg"></audio>' }), true,
  { 'data.json': '{}', 'clip.ogg': 'synthetic' });

// Governing URL/style attributes must remain quoted. Otherwise the existing
// quoted-value resource and navigation checks can silently ignore them.
runFixture('unquoted executable anchor fails closed', validHtml({ extra:
  '<a href=javascript:alert(1)>Synthetic unsafe link</a>' }), false);
runFixture('unquoted local anchor fails closed even when target exists', validHtml({ extra:
  '<a href=data.json>Synthetic link</a>' }), false);
runFixture('unquoted image source fails closed even when file exists', validHtml({ img:
  '<img src=figure.svg alt="Synthetic figure">' }), false,
  { 'data.json': '{}', 'figure.svg': '<svg></svg>' });
runFixture('unquoted script source fails closed', validHtml({ extra:
  '<script src=missing.js></script>' }), false);
runFixture('unquoted responsive source fails closed', validHtml({ img:
  '<img srcset=missing.svg alt="Synthetic figure">' }), false);
runFixture('unquoted video poster fails closed', validHtml({ extra:
  '<video poster=missing.svg></video>' }), false);
runFixture('unquoted style attribute fails closed', validHtml({ extra:
  '<div style=background:url(missing.svg)>Synthetic content</div>' }), false);
runFixture('unquoted stylesheet relation fails closed', validHtml({ extra:
  '<link rel=stylesheet href="missing.css">' }), false);
runFixture('unquoted stylesheet href fails closed', validHtml({ extra:
  '<link rel="stylesheet" href=missing.css>' }), false);
runFixture('unquoted blank-window target fails closed', validHtml({ extra:
  '<a href="https://example.org" target=_blank>External</a>' }), false);
runFixture('unquoted object data fails closed', validHtml({ extra:
  '<object data=missing.pdf></object>' }), false);
runFixture('missing unquoted attribute value fails closed', validHtml({ img:
  '<img src= alt="Synthetic figure">' }), false);
runFixture('quoted resource attributes with spaces still work', validHtml({ extra:
  '<link rel = "stylesheet" href = "site.css">' }), true,
  { 'data.json': '{}', 'site.css': 'body { color: inherit; }' });
runFixture('attribute-like text inside a quoted style remains accepted', validHtml({ extra:
  "<div style=\"content: 'src=missing.svg'\">Synthetic text</div>" }), true);
runFixture('attribute-like text and angle bracket inside a quoted title remain accepted', validHtml({ extra:
  '<p title="greater > symbol and src=missing.svg">Synthetic text</p>' }), true);

// A base element changes browser URL/target resolution without changing the
// local artifact paths used by static checks. Public pages must not use it.
runFixture('external base href is rejected', validHtml().replace('</head>',
  '<base href="https://example.org/research/"></head>'), false);
runFixture('relative base href is rejected', validHtml().replace('</head>',
  '<base href="other/"></head>'), false);
runFixture('base target is rejected to preserve safe-window checks', validHtml().replace('</head>',
  '<base target="_blank"></head>'), false);
runFixture('empty base element is rejected', validHtml().replace('</head>',
  '<base></head>'), false);
runFixture('uppercase self-closing base is rejected', validHtml().replace('</head>',
  '<BASE HREF="/other/" /></head>'), false);
runFixture('similar custom tag does not invent a base element', validHtml({ extra:
  '<base-note>Fixture text</base-note>' }), true);
runFixture('base-like text inside a quoted attribute is not a base element', validHtml({ extra:
  '<p title="Sample <base href=\'other/\'> text">Fixture text</p>' }), true);

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
