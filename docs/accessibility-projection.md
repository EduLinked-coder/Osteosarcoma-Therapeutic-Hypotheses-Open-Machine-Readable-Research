# Accessibility projection contract

The public repository treats accessibility as a projection responsibility, not as a second scientific record.

## Source rule

Every accessibility-facing representation must be generated from the same canonical `hypotheses/{OS-TH-####}/hypothesis.json` object used by the standard human page and machine index.

Do not manually maintain a separate Easy Read hypothesis with different scientific facts, evidence status, uncertainty, review state or provenance.

## Easy Read projection

`scripts/render-public-research.js` generates:

`hypotheses/{OS-TH-####}/easy-read/index.html`

The projection uses existing canonical fields including:

- `plain_language_summary`;
- `evidence_stage`;
- `review_state`;
- `uncertainty` and open questions;
- `contradictory_evidence` status and assessment;
- `validation_requirements`;
- `provenance.updated_at`; and
- `clinical_use:false`.

The projection is intentionally shorter and more linear than the standard research page. It must preserve uncertainty and contradictory-evidence state even when that makes the page less reassuring or less concise.

## Scientific boundary

An accessibility projection must never:

- add a new scientific claim;
- imply that a research priority predicts patient benefit;
- remove contradictory evidence because it is difficult to explain;
- convert `not-yet-assessed` into `none-identified`;
- promote evidence maturity;
- weaken the requirement for human scientific review;
- introduce dosing or treatment instructions; or
- change `clinical_use:false`.

If a concept cannot be simplified without changing its scientific meaning, retain the original meaning and mark the wording for accessibility review rather than inventing certainty.

## Easy Read quality boundary

The generated page is an accessibility projection and a foundation for Easy Read delivery. The repository does **not** claim that automated generation alone constitutes independent Easy Read certification, user testing or accessibility approval.

Future improvements may add structured term explanations, symbol-supported projections and reviewed plain-language alternatives, but those must remain fields or governed projections of the canonical object rather than independent scientific records.

## Validation

Generated accessibility pages are part of the renderer freshness boundary. `node scripts/render-public-research.js --check` must fail when an Easy Read projection is missing or stale.
