'use strict';

// Shared syntactic boundary for untrusted contribution and candidate evidence URLs.
// This is not a DNS, source-authenticity, scientific, or disclosure-authority check.
const net = require('net');

const nonPublicHostSuffix = /(?:^|\.)(?:localhost|local|internal|lan|test|invalid|example|home|corp|intranet|onion|private)$/;
const credentialQueryKeys = new Set([
  'token', 'accesstoken', 'refreshtoken', 'idtoken', 'apikey', 'key', 'secret',
  'clientsecret', 'password', 'passwd', 'auth', 'authorization', 'bearer',
  'signature', 'xamzsignature', 'xapikey', 'session', 'sessionid',
  'credential', 'privatekey'
]);

// Inspect query-like parameters after bounded decoding so semicolon separators,
// encoded delimiters and nested encodings cannot conceal credential keys.
// Unexpected encoding remains a fail-closed URL error at the caller.
function containsCredentialParameter(raw) {
  let text = raw;
  for (let pass = 0; pass < 4; pass++) {
    for (const parameter of text.split(/[?&;]/)) {
      const separator = parameter.indexOf('=');
      if (separator < 0) continue;
      const key = parameter.slice(0, separator).toLowerCase().replace(/[-_]/g, '');
      if (credentialQueryKeys.has(key)) return true;
    }
    if (!text.includes('%')) return false;
    const decoded = decodeURIComponent(text);
    if (decoded === text) return false;
    text = decoded;
  }
  // Do not accept an arbitrarily deep encoded parameter after the check budget.
  return /%[0-9a-f]{2}/i.test(text);
}

function isPublicSourceUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) return false;
    const authority = value.match(/^https?:\/\/([^/?#]*)/i)?.[1] || '';
    if (parsed.username || parsed.password || authority.includes('@')) return false;
    const hostname = parsed.hostname.replace(/^\[|\]$/g, '').replace(/\.+$/, '').toLowerCase();
    // Literal IPs and internal/reserved DNS names are not approved public source links.
    if (net.isIP(hostname) || !hostname.includes('.') ||
        nonPublicHostSuffix.test(hostname) || hostname.endsWith('.home.arpa')) return false;
    // Validate both components without reflecting untrusted URL values in errors.
    if (containsCredentialParameter(parsed.search.slice(1)) ||
        containsCredentialParameter(parsed.hash.slice(1))) return false;
    return true;
  } catch {
    return false;
  }
}

module.exports = { isPublicSourceUrl };
