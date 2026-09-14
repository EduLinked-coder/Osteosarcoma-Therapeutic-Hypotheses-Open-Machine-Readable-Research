const fs = require('fs');
const path = require('path');

const root = process.cwd();
const registerRel = 'governance/evidence-relationship-review-exceptions.json';
const reviewRel = 'review/index.html';
const quickstartRel = 'docs/quickstart/index.html';
const expectedReviewHref = '../governance/evidence-relationship-review-exceptions.json';
const expectedQuickstartReviewHref = '../../review/';
const repositoryIssuePrefix = 'https://github.com/EduLinked-coder/Osteosarcoma-Therapeutic-Hypotheses-Open-Machine-Readable-Research/issues/';

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function validateRegister(register) {
  invariant(register && typeof register === 'object', registerRel + ' must contain a JSON object.');
  invariant(register.schema_version === '1.0.0', registerRel + ' must retain schema_version 1.0.0.');
  invariant(typeof register.authority_boundary === 'string' && register.authority_boundary.length >= 40,
    registerRel + ' must retain an explicit authority boundary.');
  invariant(Array.isArray(register.exceptions), registerRel + ' exceptions must be an array.');

  for (const [index, item] of register.exceptions.entries()) {
    const label = registerRel + ' exceptions[' + index + ']';
    invariant(/^OS-TH-[0-9]{4}$/.test(String(item.hypothesis_id || '')),
      label + ' must use a stable OS-TH-#### hypothesis identifier.');
    invariant(typeof item.evidence_id === 'string' && item.evidence_id.length > 0,
      label + ' must identify the governed evidence binding.');
    invariant(typeof item.hypothesis_relationship === 'string' && item.hypothesis_relationship.length > 0,
      label + ' must preserve the canonical hypothesis relationship representation.');
    invariant(typeof item.binding_relationship === 'string' && item.binding_relationship.length > 0,
      label + ' must preserve the evidence-binding relationship representation.');
    invariant(item.hypothesis_relationship !== item.binding_relationship,
      label + ' no longer represents a relationship mismatch and should be resolved through the governed scientific-review pathway instead of retained as an exception.');
    invariant(item.status === 'HUMAN_SCIENTIFIC_REVIEW_REQUIRED',
      label + ' must remain HUMAN_SCIENTIFIC_REVIEW_REQUIRED until an attributable scientific decision resolves it.');
    invariant(item.clinical_use === false,
      label + ' must preserve clinical_use:false.');
    invariant(typeof item.resolution_rule === 'string' && item.resolution_rule.includes('attributable scientific decision'),
      label + ' must retain the attributable scientific-decision resolution rule.');
    invariant(typeof item.review_issue === 'string' && item.review_issue.startsWith(repositoryIssuePrefix),
      label + ' review_issue must stay on the governed repository issue pathway.');
  }
}

function validateProjection(register, reviewHtml, quickstartHtml) {
  validateRegister(register);
  invariant(typeof reviewHtml === 'string' && reviewHtml.length > 0, reviewRel + ' must exist.');
  invariant(reviewHtml.includes('href="' + expectedReviewHref + '"'),
    reviewRel + ' must expose the machine-readable protected review register.');
  invariant(reviewHtml.includes("const registerPath = '" + expectedReviewHref + "';"),
    reviewRel + ' must load the governed review register at runtime.');
  invariant(reviewHtml.includes('fetch(registerPath'),
    reviewRel + ' must derive review items from the governed register rather than a copied scientific record.');
  invariant(reviewHtml.includes("url.protocol !== 'https:' || url.hostname !== 'github.com'"),
    reviewRel + ' must retain the HTTPS GitHub review-link restriction.');
  invariant(reviewHtml.includes('textContent'),
    reviewRel + ' must continue rendering governed values as text rather than HTML injection.');
  invariant(reviewHtml.includes('Authority boundary:'),
    reviewRel + ' must visibly preserve the scientific/publication authority boundary.');
  invariant(reviewHtml.includes('does not decide which relationship is correct'),
    reviewRel + ' must state that the projection does not resolve the scientific interpretation.');

  // The human page is a runtime projection. Current scientific exception values must not be copied into it.
  for (const item of register.exceptions) {
    for (const [field, value] of Object.entries({
      hypothesis_id: item.hypothesis_id,
      evidence_id: item.evidence_id,
      hypothesis_relationship: item.hypothesis_relationship,
      binding_relationship: item.binding_relationship,
      review_issue: item.review_issue
    })) {
      invariant(!reviewHtml.includes(String(value)),
        reviewRel + ' must not hard-code ' + field + ' from the governed exception register; load it at runtime instead.');
    }
  }

  invariant(typeof quickstartHtml === 'string' && quickstartHtml.length > 0, quickstartRel + ' must exist.');
  invariant(quickstartHtml.includes('href="' + expectedQuickstartReviewHref + '"'),
    quickstartRel + ' must retain the human protected-review entry point.');
  invariant(quickstartHtml.includes('<code>' + registerRel + '</code>'),
    quickstartRel + ' must retain the machine-readable protected-review register pointer.');
  invariant(quickstartHtml.includes('not permission to normalise it autonomously'),
    quickstartRel + ' must retain the no-autonomous-normalisation instruction.');
}

function loadLive() {
  return {
    register: JSON.parse(fs.readFileSync(path.join(root, registerRel), 'utf8')),
    reviewHtml: fs.readFileSync(path.join(root, reviewRel), 'utf8'),
    quickstartHtml: fs.readFileSync(path.join(root, quickstartRel), 'utf8')
  };
}

if (require.main === module) {
  const live = loadLive();
  validateProjection(live.register, live.reviewHtml, live.quickstartHtml);
  console.log('Protected scientific-review projection matches the governed review register boundary.');
}

module.exports = { validateRegister, validateProjection, loadLive };
