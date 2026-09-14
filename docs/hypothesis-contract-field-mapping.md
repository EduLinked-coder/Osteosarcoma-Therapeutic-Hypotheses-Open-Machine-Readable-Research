# Canonical hypothesis contract field mapping

This note maps the public therapeutic-hypothesis schema to the minimum object semantics in the osteosarcoma open-research operating contract. It is an implementation map, not a second schema or scientific record.

## Reuse-first mappings

The canonical schema already carries several required semantics under existing governed fields. They are reused rather than duplicated:

| Operating-contract concept | Canonical schema field | Meaning |
| --- | --- | --- |
| generated timestamp | `provenance.created_at` | creation/generation timestamp for the canonical public object |
| evidence-update timestamp | `provenance.updated_at` | canonical update timestamp used by discovery projections; it does not prove literature surveillance completeness |
| publication state | `review_state.publication_class` | public research lifecycle classification, not scientific acceptance |
| withdrawal | `supersession.status = withdrawn` together with the existing review-state/lifecycle checks | governed withdrawal state with preserved history |
| biological targets and pathways | `targets_pathways[]` | typed target/pathway/process/microenvironment entries |
| research evidence maturity | `evidence_stage` | bounded research-stage vocabulary |

## Required canonical contract fields

The canonical schema now requires the bounded representations already introduced for contract completeness:

- `disease_context`, including an explicit `not-yet-assessed` state rather than inferred context;
- `research_classification`, fixed to `therapeutic-hypothesis` and separated from evidence maturity or scientific acceptance;
- `ranking.explanation`, which must describe research-priority state without implying patient benefit;
- `novelty.confidence`, separated from the novelty review status;
- `accessibility`, describing canonical plain-language and Easy Read projection metadata without claiming independent certification.

The proving object `OS-TH-0001` is migrated without changing its scientific interpretation. Its disease context reuses the already-canonical hypothesis statement specifying metastatic osteosarcoma; its research classification is the repository's therapeutic-hypothesis object class; its ranking explanation preserves the existing pending/unscored state and patient-benefit prohibition; novelty confidence remains `unverified`; and its accessibility metadata binds to the already-generated Easy Read projection.

`provenance.updated_at` is not advanced by this structural migration because no evidence, ranking result, scientific assessment, or literature-surveillance state changed.

The active source and target handoff runtimes independently require these fields for future public candidates. The canonical schema therefore now applies the same minimum contract to both existing and future public hypothesis objects rather than maintaining a weaker legacy object shape.

## Authority boundary

Schema completeness does not confer scientific review, evidence acceptance, disclosure authority, publication authority, clinical authority, novelty certainty or literature completeness. Unknown scientific information must remain unknown, `null`, `not-yet-assessed`, pending or otherwise explicitly unresolved as permitted by the governing schema.

`clinical_use:false` remains mandatory.
