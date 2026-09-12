# Quickstart for Researchers and Agents

This repository publishes public, evidence-bound osteosarcoma therapeutic research hypotheses. It is designed so people and machines can inspect the same source state.

## Start here

| Need | Human path | Machine path |
| --- | --- | --- |
| Browse current hypotheses | Open the public site or `hypotheses/OS-TH-0001/` | Read `indexes/hypotheses.json` |
| Inspect the canonical object | Use the hypothesis page's JSON link | Read `hypotheses/{OS-TH-####}/hypothesis.json` |
| Validate a hypothesis | Check review state, uncertainty and evidence stage | Validate against `schemas/therapeutic-hypothesis.schema.json` |
| Inspect evidence bindings | Read `evidence-bindings/*.json` | Validate against `schemas/evidence-binding.schema.json` |
| Propose new evidence | Use the New public evidence issue template | Copy `examples/evidence-bindings/supports.example.json` |
| Report a contradiction | Use the Contradictory evidence issue template | Copy `examples/evidence-bindings/contradicts.example.json` |
| Report failed replication | Use the Failed replication issue template | Copy `examples/evidence-bindings/failed-replication.example.json` |

## Contribution boundary

A contribution is a proposal for review. It is not accepted evidence, medical advice, treatment guidance, dosing instruction or expected patient benefit.

Do not include patient information, private clinical context, client information, credentials, secrets, unpublished restricted research or private repository content.

## Safe evidence-binding pattern

1. Use a public identifier or durable public URL.
2. Classify the relationship: `SUPPORTS`, `CONTRADICTS`, `LIMITS`, `CONTEXTUALISES`, `FAILED_REPLICATION` or `SUCCESSOR_CONTEXT`.
3. Keep `clinical_use` as `false`.
4. Keep `acceptance_state.status` as `candidate-public-evidence` unless explicit review authority says otherwise.
5. Add the binding to `evidence-bindings/{evidence_id}.json`.
6. Run:

```sh
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
