'use strict';

const SAFE_EVIDENCE_ID = /^(PMID-[0-9]+|DOI-[A-Za-z0-9._~%()!'-]+|SOURCE-[A-Z0-9-]+)$/;

function isPathSafeEvidenceId(value) {
  return typeof value === 'string' &&
    SAFE_EVIDENCE_ID.test(value) &&
    value !== '.' &&
    value !== '..' &&
    !value.includes('/') &&
    !value.includes('\\');
}

function validateEvidenceBindingIdentity(binding, where = 'evidence binding') {
  const errors = [];
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)) {
    return [where + ' must be an object.'];
  }

  const evidenceId = binding.evidence_id;
  if (!isPathSafeEvidenceId(evidenceId)) {
    errors.push(where + '.evidence_id must be a path-safe stable identifier (PMID-<digits>, DOI-<percent-encoded-doi>, or SOURCE-<token>).');
    return errors;
  }

  if (evidenceId.startsWith('PMID-')) {
    const pmid = evidenceId.slice('PMID-'.length);
    if (binding.source_type !== 'pubmed') {
      errors.push(where + '.source_type must be pubmed when evidence_id uses PMID-.');
    }
    if (binding.pmid !== pmid) {
      errors.push(where + '.pmid must exactly match the PMID encoded in evidence_id.');
    }
    try {
      const source = new URL(String(binding.canonical_source_url || ''));
      const sourcePmid = source.pathname.split('/').filter(Boolean)[0] || '';
      if (source.hostname.toLowerCase() !== 'pubmed.ncbi.nlm.nih.gov' || sourcePmid !== pmid) {
        errors.push(where + '.canonical_source_url must resolve the same PMID on pubmed.ncbi.nlm.nih.gov.');
      }
    } catch {
      errors.push(where + '.canonical_source_url must be a valid URL for the same PMID.');
    }
  }

  if (evidenceId.startsWith('DOI-')) {
    const encodedDoi = evidenceId.slice('DOI-'.length);
    let decodedDoi = null;
    try {
      decodedDoi = decodeURIComponent(encodedDoi);
    } catch {
      errors.push(where + '.evidence_id contains invalid percent-encoding for a DOI identifier.');
    }
    if (typeof binding.doi !== 'string' || !binding.doi.trim()) {
      errors.push(where + '.doi is required when evidence_id uses DOI-.');
    } else if (decodedDoi !== null && decodedDoi.toLowerCase() !== binding.doi.trim().toLowerCase()) {
      errors.push(where + '.doi must exactly match the percent-decoded DOI encoded in evidence_id.');
    }
  }

  return errors;
}

module.exports = {
  SAFE_EVIDENCE_ID,
  isPathSafeEvidenceId,
  validateEvidenceBindingIdentity
};
