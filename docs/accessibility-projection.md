# Accessibility projection contract

The public repository treats accessibility as a projection responsibility, not as a second scientific record.

## Source rule

Every accessibility-facing representation must be generated from the same canonical `hypotheses/{OS-TH-####}/hypothesis.json` object used by the standard human page and machine index.

Do not manually maintain a separate Easy Read hypothesis with different scientific facts, evidence status, uncertainty, review state or provenance.

## EduLinked accessibility authority chain

This repository reuses existing EduLinked accessibility authority rather than defining a local Easy Read or accessibility model. The source-owned consumption receipt is `governance/public-research-accessibility-upstream-consumption-manifest-2026-09-20.json`.

- `EduLinked-Pty-Ltd/core-machine-objects:objects/education/easy-read-adaptive-instructional-composition-v0.1.json` supplies the current Easy Read semantic/composition authority. Its guards include `MACHINE_GENERATED != HUMAN_VALIDATED_EASY_READ` and `COMPLIANCE_OUTPUT != COMPREHENSION_EVIDENCE`.
- `EduLinked-Systems/edulinked-accessibility-system:adapters/easy-read/entrypoints.yaml` supplies the current implementation/navigation and human-review route while retaining Core as semantic authority.
- `EduLinked-Systems/easy-read` is not treated here as an activated replacement production authority without its own source-owned authority proof.
- `EduLinked-Pty-Ltd/accessible-RTO` AccessFlow v1.2.0 remains available for a selected accessible document/PDF/Canva derivative, but the current research projection is HTML and does not activate that route by default.
- `EduLinked-Systems/edulinked-learning-system` is not activated merely because an Easy Read page exists. These pages are research-discovery projections, not courses, curriculum, Byte sequences or assessed learning resources.

AAC, symbol-supported, Auslan, audio, video or other alternate representations are not created for portfolio symmetry. They require attributable communication-access or publication need and the relevant human/specialist/person review. Reuse of any upstream capability does not transfer scientific, accessibility, clinical or publication authority into this repository.

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

`node scripts/validate-public-interface.js` adds a bounded deterministic interface-integrity gate across public HTML. It checks basic document semantics needed by assistive technologies and keyboard users, including a declared document language, viewport metadata, one primary heading, non-skipping heading hierarchy, a main landmark, explicit image alternative text, programmatic labels for form controls, accessible button names, avoidance of positive `tabindex`, safe new-window relationships, and resolvable local links. `node scripts/test-public-interface.js` proves representative invalid cases fail closed, including skipped heading levels, unlabelled controls, broken `aria-labelledby` references and unnamed buttons.

These automated checks are intentionally conservative and do **not** constitute WCAG conformance certification, independent accessibility audit, Easy Read certification or user testing. Human accessibility review remains necessary for matters that cannot be established deterministically from repository markup alone.
