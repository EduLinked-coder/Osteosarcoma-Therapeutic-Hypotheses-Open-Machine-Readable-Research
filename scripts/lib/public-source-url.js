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
    for (const key of parsed.searchParams.keys()) {
      if (credentialQueryKeys.has(key.toLowerCase().replace(/[-_]/g, ''))) return false;
    }
    // Fragments may embed credentials after an anchor, route or encoded delimiter.
    // Fail closed on invalid encoding without logging untrusted source URL values.
    const fragment = decodeURIComponent(parsed.hash.slice(1));
    for (const parameter of fragment.split(/[?&;]/)) {
      const separator = parameter.indexOf('=');
      if (separator < 0) continue;
      const key = parameter.slice(0, separator).toLowerCase().replace(/[-_]/g, '');
      if (credentialQueryKeys.has(key)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

module.exports = { isPublicSourceUrl };
