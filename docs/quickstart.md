# Quickstart for Researchers and Agents

This repository publishes public, evidence-bound osteosarcoma therapeutic research hypotheses. It is designed so people and machines can inspect the same source state.

## Start here

| Need | Human path | Machine path |
| --- | --- | --- |
| Browse current hypotheses | Open the public site or `hypotheses/OS-TH-0001/` | Read `indexes/hypotheses.json` |
| Search/filter the portfolio | Open `search/` | Follow `canonical_object_path` values from `indexes/hypotheses.json` |
| Inspect the canonical object | Use the hypothesis page's JSON link | Read `hypotheses/{OS-TH-####}/hypothesis.json` |
| Validate a hypothesis | Check review state, uncertainty and evidence stage | Validate against `schemas/therapeutic-hypothesis.schema.json` |
| Inspect evidence bindings | Read `evidence-bindings/*.json` | Validate against `schemas/evidence-binding.schema.json` |
| Propose a governed contribution | Use the relevant GitHub issue template | Start from `schemas/research-contribution.schema.json` and `examples/contributions/` |
| Propose new evidence | Use the New public evidence issue template | Copy `examples/evidence-bindings/supports.example.json` |
| Report a contradiction | Use the Contradictory evidence issue template | Copy `examples/evidence-bindings/contradicts.example.json` |
| Report failed replication | Use the Failed replication issue template | Copy `examples/evidence-bindings/failed-replication.example.json` |

The search interface does not maintain a duplicate research database. It loads the generated index and then fetches the canonical hypothesis objects, so mechanism, target/pathway, evidence stage, review/publication state, uncertainty, novelty and ranking filters remain projections of canonical JSON.

## Contribution boundary

A contribution is a proposal for review. It is not accepted evidence, medical advice, treatment guidance, dosing instruction or expected patient benefit.

Machine-readable contribution proposals use the governed lifecycle documented in `docs/contribution-lifecycle.md`:

`SUBMITTED -> SOURCE_VERIFIED -> EVIDENCE_VALIDATED -> SCIENTIFIC_REVIEW -> ACCEPTED | REJECTED`

An `ACCEPTED` contribution still has to be incorporated through the canonical hypothesis/evidence objects and normal pull-request validation path. Contribution acceptance is not clinical validation.

Do not include patient information, private clinical context, client information, credentials, secrets, unpublished restricted research or private repository content.

## Safe evidence-binding pattern

1. Use a public identifier or durable public URL.
2. Classify the relationship: `SUPPORTS`, `CONTRADICTS`, `LIMITS`, `NEUTRAL`, `CONTEXTUALISES`, `FAILED_REPLICATION` or `SUCCESSOR_CONTEXT`.
3. Use `NEUTRAL` only when the source is relevant to the hypothesis but, after scientific assessment, does not support, contradict or limit the hypothesis claim. `NEUTRAL` is an evidence relationship, not a synonym for unknown or unassessed; uncertain classification must remain unresolved rather than being normalised automatically.
4. Keep `clinical_use` as `false`.
5. Keep `acceptance_state.status` as `candidate-public-evidence` unless explicit review authority says otherwise.
6. Add the binding to `evidence-bindings/{evidence_id}.json`.
7. Run:

```sh
node scripts/validate-contributions.js
node scripts/validate-schema.js
node scripts/render-public-research.js --check
node scripts/validate-public-research.js
```

## Generated output

Do not hand-maintain the public hypothesis pages, index or sitemap. Update canonical JSON first, then run:

```sh
node scripts/render-public-research.js
```

CI fails when generated output is stale.
