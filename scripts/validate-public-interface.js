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
      path.join(root, 'review'),
      path.join(root, 'docs', 'quickstart'),
      path.join(root, 'hypotheses')
    ];

const htmlFiles = [...new Set(publicEntries.flatMap(walkHtml))].sort();
if (!htmlFiles.length) fail('No public HTML files were found to validate.');

const stripQueryAndFragment = (href) => href.split('#')[0].split('?')[0];
const isExternal = (href) => /^(?:https?:|mailto:|tel:|data:|javascript:)/i.test(href) || href.startsWith('//');


// HTML URLs can conceal executable schemes behind character references or tabs.
// This is a bounded, conservative safeguard; it is not a full HTML sanitizer.
const isUnsafeAnchorUrl = (href) => {
  const decoded = href
    .replace(/&#(?:x([0-9a-f]+)|([0-9]+));?/gi, (_match, hex, decimal) => {
      const codePoint = Number.parseInt(hex || decimal, hex ? 16 : 10);
      return codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : '';
    })
    .replace(/&colon;/gi, ':')
    .replace(/&(?:tab|newline);/gi, '');
  return /^(?:javascript|vbscript|data):/i.test(decoded.replace(/[\x00-\x20\x7f]/g, ''));
};

// Parse srcset URLs without splitting commas embedded in URL tokens (for example data URIs).
// Responsive width/density descriptors are not URL paths.
const parseSrcsetUrls = (value) => {
  const urls = [];
  let index = 0;
  while (index < value.length) {
    while (index < value.length && /[\t\n\f\r ,]/.test(value[index])) index += 1;
    if (index >= value.length) break;
    const start = index;
    while (index < value.length && !/[\t\n\f\r ]/.test(value[index])) index += 1;
    const rawUrl = value.slice(start, index);
    const url = rawUrl.replace(/,+$/, '');
    if (url) urls.push(url);
    if (rawUrl.endsWith(',')) continue;
    let depth = 0;
    while (index < value.length) {
      const char = value[index++];
      if (char === '(') depth += 1;
      else if (char === ')' && depth) depth -= 1;
      else if (char === ',' && depth === 0) break;
    }
  }
  return urls;
};

const resolveLocalTarget = (htmlPath, href) => {
  let cleaned = stripQueryAndFragment(href.trim());
  if (!cleaned || cleaned === '.') return null;
  try {
    cleaned = decodeURIComponent(cleaned);
  } catch {
    fail(path.relative(root, htmlPath) + ' contains malformed percent-encoding in a local reference.');
    return null;
  }

  const candidate = cleaned.startsWith('/')
    ? path.resolve(root, '.' + cleaned)
    : path.resolve(path.dirname(htmlPath), cleaned);

  const relative = path.relative(root, candidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    fail(path.relative(root, htmlPath) + ' contains a local reference outside the public artifact.');
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

  const headingLevels = [...html.matchAll(/<h([1-6])\b[^>]*>/gi)].map((match) => Number(match[1]));
  for (let index = 1; index < headingLevels.length; index += 1) {
    const previous = headingLevels[index - 1];
    const current = headingLevels[index];
    if (current > previous + 1) {
      fail(rel + ' skips heading levels from h' + previous + ' to h' + current + '.');
    }
  }

  const positiveTabindex = [...html.matchAll(/\btabindex\s*=\s*["']?([1-9][0-9]*)["']?/gi)];
  if (positiveTabindex.length) fail(rel + ' uses positive tabindex, which can break logical keyboard order.');

  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    if (!/\balt\s*=\s*["'][^"']*["']/i.test(match[0])) fail(rel + ' contains an img without an explicit alt attribute.');
  }

  const elementIds = new Set([...html.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]));
  const labelForIds = new Set([...html.matchAll(/<label\b[^>]*\bfor\s*=\s*["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]));

  for (const match of html.matchAll(/<(input|select|textarea)\b[^>]*>/gi)) {
    const tagName = match[1].toLowerCase();
    const markup = match[0];
    const typeMatch = markup.match(/\btype\s*=\s*["']?([^"'\s>]+)/i);
    const inputType = typeMatch ? typeMatch[1].toLowerCase() : '';
    if (tagName === 'input' && inputType === 'hidden') continue;

    const idMatch = markup.match(/\bid\s*=\s*["']([^"']+)["']/i);
    const ariaLabel = markup.match(/\baria-label\s*=\s*["']([^"']+)["']/i);
    const ariaLabelledby = markup.match(/\baria-labelledby\s*=\s*["']([^"']+)["']/i);
    const labelledByIds = ariaLabelledby ? ariaLabelledby[1].trim().split(/\s+/).filter(Boolean) : [];
    const labelledByExistingIds = labelledByIds.length > 0 && labelledByIds.every((id) => elementIds.has(id));
    const intrinsicButtonName = tagName === 'input' && ['submit', 'reset', 'button'].includes(inputType) && /\bvalue\s*=\s*["'][^"']+\S[^"']*["']/i.test(markup);
    const isLabelled = Boolean(
      (idMatch && labelForIds.has(idMatch[1])) ||
      (ariaLabel && ariaLabel[1].trim()) ||
      labelledByExistingIds ||
      intrinsicButtonName
    );

    if (!isLabelled) fail(rel + ' contains an unlabelled ' + tagName + ' form control.');
  }

  for (const match of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
    const openingMarkup = '<button' + match[1] + '>';
    const ariaLabel = openingMarkup.match(/\baria-label\s*=\s*["']([^"']+)["']/i);
    const ariaLabelledby = openingMarkup.match(/\baria-labelledby\s*=\s*["']([^"']+)["']/i);
    const labelledByIds = ariaLabelledby ? ariaLabelledby[1].trim().split(/\s+/).filter(Boolean) : [];
    const labelledByExistingIds = labelledByIds.length > 0 && labelledByIds.every((id) => elementIds.has(id));
    const textName = match[2].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!(textName || (ariaLabel && ariaLabel[1].trim()) || labelledByExistingIds)) {
      fail(rel + ' contains a button without an accessible name.');
    }
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
    if (isUnsafeAnchorUrl(href)) {
      fail(rel + ' contains an unsafe inline-data or executable anchor URL.');
      continue;
    }
    if (!href || href.startsWith('#') || isExternal(href)) continue;
    const target = resolveLocalTarget(htmlPath, href);
    if (target && !fs.existsSync(target)) {
      fail(rel + ' contains a broken local navigation link.');
    }
  }

  // Check resources in the actual Pages artifact, including responsive and media variants.
  // Diagnostics intentionally exclude untrusted URL values.
  const validateResourceUrl = (rawUrl, kind) => {
    const url = rawUrl.trim();
    if (!url || url.startsWith('#')) return;
    if (isUnsafeAnchorUrl(url)) {
      fail(rel + ' contains an unsafe ' + kind + ' URL.');
      return;
    }
    if (isExternal(url)) return;
    const target = resolveLocalTarget(htmlPath, url);
    if (target && !fs.existsSync(target)) {
      fail(rel + ' references a missing local ' + kind + '.');
    }
  };

  for (const match of html.matchAll(/<(img|script|source|video|audio|track)\b[^>]*>/gi)) {
    const src = match[0].match(/\ssrc\s*=\s*["']([^"']*)["']/i)?.[1];
    if (src) validateResourceUrl(src, match[1].toLowerCase() + ' resource');
  }

  for (const match of html.matchAll(/<(img|source)\b[^>]*>/gi)) {
    const srcset = match[0].match(/\ssrcset\s*=\s*["']([^"']*)["']/i)?.[1];
    if (srcset !== undefined) {
      for (const url of parseSrcsetUrls(srcset)) {
        validateResourceUrl(url, 'responsive image resource');
      }
    }
  }

  for (const match of html.matchAll(/<video\b[^>]*>/gi)) {
    const poster = match[0].match(/\sposter\s*=\s*["']([^"']*)["']/i)?.[1];
    if (poster) validateResourceUrl(poster, 'video poster resource');
  }

  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const relValue = match[0].match(/\brel\s*=\s*["']([^"']+)["']/i)?.[1] || '';
    if (!relValue.toLowerCase().split(/\s+/).includes('stylesheet')) continue;
    const href = match[0].match(/\shref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (href) validateResourceUrl(href, 'stylesheet');
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

    const requiredHumanRoutes = ['', 'search/', 'activity/', 'docs/quickstart/', 'evidence/', 'review/'];
    for (const route of requiredHumanRoutes) {
      const expected = canonicalSiteBase + route;
      if (!seenLocations.has(expected)) fail('sitemap.xml is missing required human discovery route: ' + expected);
    }
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  const discoveryMessage = validateDiscovery ? ' plus robots/sitemap discovery integrity' : '';
  console.log('Public interface validation passed for ' + htmlFiles.length + ' HTML page(s)' + discoveryMessage + '.');
}
