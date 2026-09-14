# Governed Research Contribution Lifecycle

This repository accepts **research proposals for review**, not automatically accepted evidence or clinical claims.

A GitHub issue, pull request or machine-readable contribution object may preserve a proposal and its provenance. Existence of that proposal does not make it scientifically accepted, publication-authorised or clinically actionable.

## Machine-readable contribution object

Use `schemas/research-contribution.schema.json` for structured public contribution proposals. Live contribution objects, when used, belong under:

`contributions/OS-CONTRIB-####.json`

Template examples belong under `examples/contributions/` and must remain in `SUBMITTED` state.

## Public issue intake

The GitHub issue intake is a human-facing projection of the governed contribution types. Each issue remains a proposal only and does not bypass the machine-readable contribution lifecycle.

| Contribution type | Public intake template |
| --- | --- |
| `NEW_EVIDENCE` | `.github/ISSUE_TEMPLATE/new-evidence.md` |
| `CONTRADICTORY_EVIDENCE` | `.github/ISSUE_TEMPLATE/contradictory-evidence.md` |
| `FAILED_REPLICATION` | `.github/ISSUE_TEMPLATE/failed-replication.md` |
| `NEW_HYPOTHESIS` | `.github/ISSUE_TEMPLATE/new-hypothesis.md` |
| `MECHANISM_PROPOSAL` | `.github/ISSUE_TEMPLATE/mechanism-proposal.md` |
| `FALSIFICATION_EXPERIMENT` | `.github/ISSUE_TEMPLATE/falsification-experiment.md` |
| `ERROR_REPORT` | `.github/ISSUE_TEMPLATE/error-report.md` |
| `SUCCESSOR_HYPOTHESIS` | `.github/ISSUE_TEMPLATE/successor-hypothesis.md` |

`node scripts/validate-contribution-intake.js` verifies that every `contribution_type` in the canonical schema retains a governed public intake template with explicit boundary language. A future schema type therefore fails closed until an intake path is deliberately bound.

Safety/privacy review remains available through `.github/ISSUE_TEMPLATE/safety-privacy-review.md`; it is a governance escalation route rather than a research contribution type.

## States

The governed state sequence is:

`SUBMITTED -> SOURCE_VERIFIED -> EVIDENCE_VALIDATED -> SCIENTIFIC_REVIEW -> ACCEPTED`

or, at an appropriate review gate:

`SUBMITTED | SOURCE_VERIFIED | EVIDENCE_VALIDATED | SCIENTIFIC_REVIEW -> REJECTED`

### `SUBMITTED`

A proposal has been received. It has not yet been source-verified or scientifically accepted.

### `SOURCE_VERIFIED`

The cited public source and durable identifier/URL have been checked. This does **not** mean the source supports the contributor's interpretation.

### `EVIDENCE_VALIDATED`

The evidence relationship and machine-readable fields have passed repository validation. Validation does **not** confer scientific acceptance.

### `SCIENTIFIC_REVIEW`

A human scientific review decision is required. Machines may prepare evidence and comparisons but may not manufacture the decision.

### `ACCEPTED`

A review decision has accepted the contribution for governed incorporation into repository research state. The accepted change must still be applied through the canonical hypothesis/evidence objects and normal pull-request validation path. `ACCEPTED` does not mean clinically validated, medically recommended or expected to benefit a patient.

### `REJECTED`

A review decision has declined the proposed contribution. Preserve the proposal, reason and decision provenance where publication/privacy rules permit; do not silently erase contradictory or unsuccessful contributions merely because they were rejected.

## Required boundaries

Every public contribution object must:

- preserve a stable contribution identifier;
- preserve contributor provenance without requiring private contact data;
- keep `clinical_use:false`;
- retain `scientific_review_required:true`;
- retain the canonical `acceptance_meaning` statement that repository review state does not establish clinical benefit, treatment guidance or patient-specific applicability;
- use public HTTP(S) source references where source references are supplied;
- avoid patient information, private clinical context, credentials, secrets and restricted research;
- require an attributable `decision_reference` and `reviewed_at` timestamp for `ACCEPTED` or `REJECTED` state.

The contribution validator also fails closed on common prohibited public fields and duplicate contribution identifiers. The acceptance-boundary fixture fails closed if the canonical machine-readable meaning is omitted or weakened.

## Contribution type is not acceptance

Supported proposal types include:

- new evidence;
- contradictory evidence;
- failed replication;
- new hypothesis;
- mechanism proposal;
- falsification experiment;
- error report;
- successor hypothesis.

A contribution must not bypass the canonical evidence-binding schema, hypothesis schema, publication transaction, privacy boundary or scientific-review authority simply because it arrived through a trusted contributor or automation.

## Validation

Run:

```sh
node scripts/test-contribution-acceptance-boundary.js
node scripts/validate-contributions.js
node scripts/test-contribution-intake.js
node scripts/validate-contribution-intake.js
```

CI runs these alongside the existing publication-transaction, schema, projection-freshness and public-boundary checks.
