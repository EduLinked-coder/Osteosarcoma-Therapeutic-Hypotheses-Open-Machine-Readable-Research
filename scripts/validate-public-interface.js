const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const rootIndex = args.indexOf('--root');
const root = path.resolve(rootIndex >= 0 && args[rootIndex + 1] ? args[rootIndex + 1] : process.cwd());
const isFixtureRoot = rootIndex >= 0;
const validateDiscovery = !isFixtureRoot || args.includes('--discovery');
const canonicalSiteBase = 'https://edulinked-coder.github.io/Osteosarcoma-Therapeutic-Hypotheses-Open-Machine-Readable-Research/';
let failed = false;

const fail = (message) => {
  console.error('PUBLIC INTERFACE VALIDATION FAILED: ' + message);
  failed = true;
};

const walkHtml = (entry) => {
  if (!fs.existsSync(entry)) return [];
  const stat = fs.statSync(entry);
  if (stat.isFile()) return entry.endsWith('.html') ? [entry] : [];
  return fs.readdirSync(entry).flatMap((name) => walkHtml(path.join(entry, name)));
};

const publicEntries = isFixtureRoot
  ? [root]
  : [
      path.join(root, 'index.html'),
      path.join(root, 'activity'),
      path.join(root, 'search'),
      path.join(root, 'evidence'),
      path.join(root, 'docs', 'quickstart'),
      path.join(root, 'hypotheses')
    ];

const htmlFiles = [...new Set(publicEntries.flatMap(walkHtml))].sort();
if (!htmlFiles.length) fail('No public HTML files were found to validate.');

const stripQueryAndFragment = (href) => href.split('#')[0].split('?')[0];
const isExternal = (href) => /^(?:https?:|mailto:|tel:|data:|javascript:)/i.test(href) || href.startsWith('//');

const resolveLocalTarget = (htmlPath, href) => {
  let cleaned = stripQueryAndFragment(href.trim());
  if (!cleaned || cleaned === '.') return null;
  try {
    cleaned = decodeURIComponent(cleaned);
  } catch {
    fail(path.relative(root, htmlPath) + ' contains a malformed URL encoding in href="' + href + '".');
    return null;
  }

  const candidate = cleaned.startsWith('/')
    ? path.resolve(root, '.' + cleaned)
    : path.resolve(path.dirname(htmlPath), cleaned);

  const relative = path.relative(root, candidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    fail(path.relative(root, htmlPath) + ' contains a local href that escapes the public repository root: ' + href);
    return null;
  }

  if (cleaned.endsWith('/')) return path.join(candidate, 'index.html');
  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) return path.join(candidate, 'index.html');
  return candidate;
};

for (const htmlPath of htmlFiles) {
  const rel = path.relative(root, htmlPath).replace(/\\/g, '/');
  const html = fs.readFileSync(htmlPath, 'utf8');

  if (!/^\s*<!doctype html>/i.test(html)) fail(rel + ' is missing an HTML5 doctype.');
  if (!/<html\b[^>]*\blang=["'][^"']+["'][^>]*>/i.test(html)) fail(rel + ' is missing a non-empty html[lang] attribute.');
  if (!/<meta\b[^>]*name=["']viewport["'][^>]*content=["'][^"']+["'][^>]*>/i.test(html)) fail(rel + ' is missing a viewport meta element.');
  if (!/<title>[^<\n][\s\S]*?<\/title>/i.test(html)) fail(rel + ' is missing a non-empty title.');
  if (!/<main\b/i.test(html)) fail(rel + ' is missing a main landmark.');

  const h1Count = (html.match(/<h1\b/gi) || []).length;
  if (h1Count !== 1) fail(rel + ' must contain exactly one h1; found ' + h1Count + '.');

  const positiveTabindex = [...html.matchAll(/\btabindex\s*=\s*["']?([1-9][0-9]*)["']?/gi)];
  if (positiveTabindex.length) fail(rel + ' uses positive tabindex, which can break logical keyboard order.');

  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    if (!/\balt\s*=\s*["'][^"']*["']/i.test(match[0])) fail(rel + ' contains an img without an explicit alt attribute.');
  }

  for (const match of html.matchAll(/<a\b[^>]*\btarget\s*=\s*["']_blank["'][^>]*>/gi)) {
    const relMatch = match[0].match(/\brel\s*=\s*["']([^"']*)["']/i);
    const tokens = new Set((relMatch ? relMatch[1] : '').toLowerCase().split(/\s+/).filter(Boolean));
    if (!tokens.has('noopener') || !tokens.has('noreferrer')) {
      fail(rel + ' contains target="_blank" without rel="noopener noreferrer".');
    }
  }

  for (const match of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']*)["'][^>]*>/gi)) {
    const href = match[1].trim();
    if (!href || href.startsWith('#') || isExternal(href)) continue;
    const target = resolveLocalTarget(htmlPath, href);
    if (target && !fs.existsSync(target)) {
      fail(rel + ' contains broken local href "' + href + '" -> ' + path.relative(root, target).replace(/\\/g, '/'));
    }
  }
}

if (validateDiscovery) {
  const robotsPath = path.join(root, 'robots.txt');
  const sitemapPath = path.join(root, 'sitemap.xml');
  const expectedSitemapUrl = canonicalSiteBase + 'sitemap.xml';

  if (!fs.existsSync(robotsPath)) {
    fail('Missing robots.txt discovery entry point.');
  } else {
    const robots = fs.readFileSync(robotsPath, 'utf8');
    if (!/^User-agent:\s*\*\s*$/mi.test(robots)) fail('robots.txt must contain a wildcard User-agent directive.');
    if (!/^Allow:\s*\/\s*$/mi.test(robots)) fail('robots.txt must explicitly allow the public root.');
    const sitemapDirectives = [...robots.matchAll(/^Sitemap:\s*(\S+)\s*$/gmi)].map((match) => match[1]);
    if (sitemapDirectives.length !== 1 || sitemapDirectives[0] !== expectedSitemapUrl) {
      fail('robots.txt must contain exactly one canonical Sitemap directive: ' + expectedSitemapUrl);
    }
  }

  if (!fs.existsSync(sitemapPath)) {
    fail('Missing sitemap.xml discovery entry point.');
  } else {
    const sitemap = fs.readFileSync(sitemapPath, 'utf8');
    if (!/<urlset\b[^>]*xmlns=["']http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9["'][^>]*>/i.test(sitemap)) {
      fail('sitemap.xml is missing the canonical sitemap urlset namespace.');
    }

    const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((match) => match[1].trim());
    if (!locations.length) fail('sitemap.xml contains no <loc> entries.');
    const seenLocations = new Set();

    for (const location of locations) {
      if (seenLocations.has(location)) fail('sitemap.xml contains duplicate <loc>: ' + location);
      seenLocations.add(location);
      if (!location.startsWith(canonicalSiteBase)) {
        fail('sitemap.xml contains a URL outside the canonical public site base: ' + location);
        continue;
      }
      if (location.includes('?') || location.includes('#')) {
        fail('sitemap.xml URLs must not contain query strings or fragments: ' + location);
      }

      let localRelative = location.slice(canonicalSiteBase.length);
      try {
        localRelative = decodeURIComponent(localRelative);
      } catch {
        fail('sitemap.xml contains malformed URL encoding: ' + location);
        continue;
      }
      const candidate = localRelative === ''
        ? path.join(root, 'index.html')
        : localRelative.endsWith('/')
          ? path.join(root, localRelative, 'index.html')
          : path.join(root, localRelative);
      const relative = path.relative(root, candidate);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        fail('sitemap.xml URL escapes the public repository root: ' + location);
      } else if (!fs.existsSync(candidate)) {
        fail('sitemap.xml references a missing public target: ' + relative.replace(/\\/g, '/'));
      }
    }

    if (!isFixtureRoot) {
      const requiredHumanRoutes = ['', 'search/', 'activity/', 'docs/quickstart/', 'evidence/'];
      for (const route of requiredHumanRoutes) {
        const expected = canonicalSiteBase + route;
        if (!seenLocations.has(expected)) fail('sitemap.xml is missing required human discovery route: ' + expected);
      }
    }
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  const discoveryMessage = validateDiscovery ? ' plus robots/sitemap discovery integrity' : '';
  console.log('Public interface validation passed for ' + htmlFiles.length + ' HTML page(s)' + discoveryMessage + '.');
}
