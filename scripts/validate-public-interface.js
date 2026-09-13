const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const rootIndex = args.indexOf('--root');
const root = path.resolve(rootIndex >= 0 && args[rootIndex + 1] ? args[rootIndex + 1] : process.cwd());
const isFixtureRoot = rootIndex >= 0;
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

if (failed) {
  process.exitCode = 1;
} else {
  console.log('Public interface validation passed for ' + htmlFiles.length + ' HTML page(s).');
}
