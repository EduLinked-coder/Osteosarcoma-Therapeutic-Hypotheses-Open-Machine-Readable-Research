# Canonical hypothesis contract field mapping

This note maps the public therapeutic-hypothesis schema to the minimum object semantics in the osteosarcoma open-research operating contract. It is an implementation map, not a second schema or scientific record.

## Reuse-first mappings

The canonical schema already carries several required semantics under existing governed fields. They should be reused rather than duplicated:

| Operating-contract concept | Canonical schema field | Meaning |
| --- | --- | --- |
| generated timestamp | `provenance.created_at` | creation/generation timestamp for the canonical public object |
| evidence-update timestamp | `provenance.updated_at` | canonical update timestamp used by discovery projections; it does not prove literature surveillance completeness |
| publication state | `review_state.publication_class` | public research lifecycle classification, not scientific acceptance |
| withdrawal | `supersession.status = withdrawn` together with the existing review-state/lifecycle checks | governed withdrawal state with preserved history |
| biological targets and pathways | `targets_pathways[]` | typed target/pathway/process/microenvironment entries |
| research evidence maturity | `evidence_stage` | bounded research-stage vocabulary |

## Explicit schema vocabulary added for contract completeness

The schema now recognises bounded representations for:

- `disease_context`, including an explicit `not-yet-assessed` state rather than inferred context;
- `research_classification`, fixed to `therapeutic-hypothesis` and separated from evidence maturity or scientific acceptance;
- `ranking.explanation`, which must describe research-priority state without implying patient benefit;
- `novelty.confidence`, separated from the novelty review status;
- `accessibility`, describing canonical plain-language and Easy Read projection metadata without claiming independent certification.

These additions are backward-compatible schema vocabulary in this review path. They are **not yet added to the root required-property list**. Making them mandatory requires a bounded canonical-object/source-handoff migration so the target does not manufacture missing scientific context and the source-to-public transaction continues to fail closed.

## Authority boundary

Schema completeness does not confer scientific review, evidence acceptance, disclosure authority, publication authority, clinical authority, novelty certainty or literature completeness. Unknown scientific information must remain unknown, `null`, `not-yet-assessed`, pending or otherwise explicitly unresolved as permitted by the governing schema.

`clinical_use:false` remains mandatory.
