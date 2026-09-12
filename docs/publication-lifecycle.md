# Publication Lifecycle

This repository is a public research projection. It is not the private research engine, clinical decision system, patient record, unpublished research store or publication-authority source.

## Core rule

Private or restricted material must fail closed. If material is not clearly public-safe and publication-authorised, it must not be committed into canonical objects, evidence bindings, generated pages, indexes or the sitemap.

## Source-owned research integration

Cross-repository publication starts outside this public repository.

Authorised agents must first resolve the canonical EduLinked repository ecosystem registry and the existing Universal Research Engine federation capability. Reuse source-owned research, evidence, provenance, screening, review and human-interface capabilities rather than creating a second research engine or evidence store here.

Upstream research operations may produce candidate evidence packets or exports without possessing publication authority. A successful candidate-evidence build, MR3 export, validation report, renderer run or other machine receipt does **not** by itself authorise public release, scientific acceptance or clinical interpretation.

The public repository must not contain private repository topology or private source material solely to support automation. Private/source-owned routing remains in authorised internal systems. Only a deliberately public-safe release projection may cross into this repository.

If the attributable source owner, disclosure authority or public-safe handoff for a candidate is unresolved, automated private-to-public publication is blocked. Do not guess the source owner, copy private material for convenience or infer publication authority from technical success.

## Publication transaction

A publication transaction moves material from candidate research intelligence into public repository state only when every gate below is satisfied.

1. Source is public or explicitly authorised for public release.
2. No patient, client, private clinical, credential, secret, restricted unpublished research or private-repository material is present.
3. Evidence is bound to a public identifier or durable public URL.
4. The relationship is classified as supporting, limiting, contradictory, contextual, failed replication or successor context.
5. Uncertainty, evidence maturity, replication state and contradictory evidence are retained.
6. Human scientific review is required for reviewed or clinically validated classifications.
7. Canonical JSON is updated first.
8. Generated projections are rendered from canonical JSON using `scripts/render-public-research.js`.
9. CI validates schema, generated-output freshness and public research boundaries.

## What agents may publish

Agents may open pull requests that add or update:

- candidate hypothesis objects that preserve review requirements and clinical-use boundaries
- public evidence bindings that validate against `schemas/evidence-binding.schema.json`
- contradictory evidence records and uncertainty improvements
- generated public projections produced by the renderer
- safety/privacy review items that block publication

## What agents must not publish

Agents must not publish:

- patient names, patient-specific tumour data, treatment histories, medical records or clinical notes
- private client, partner or collaborator information
- credentials, tokens, secrets, keys or private infrastructure details
- restricted unpublished research or private repository content
- claims that a hypothesis is accepted evidence, medical advice, a treatment recommendation, dose guidance or expected patient benefit
- promotion to reviewed, clinically validated or successor-of-record status without explicit human scientific authority

## Generated-output freshness

The generated files are projections, not source authority:

- `index.html`
- `hypotheses/*/index.html`
- `indexes/hypotheses.json`
- `sitemap.xml`

The homepage, portfolio cards, register, individual hypothesis pages, discovery index and sitemap must all derive from canonical hypothesis JSON rather than independently maintained scientific facts.

After changing canonical hypothesis JSON, run:

```sh
node scripts/render-public-research.js
node scripts/render-public-research.js --check
```

CI must fail if generated outputs are stale.

## Evidence-binding governance

Every file in `evidence-bindings/*.json` must validate against `schemas/evidence-binding.schema.json`. A binding means there is a governed relationship between a public source and a hypothesis. It does not mean the evidence is accepted, clinically sufficient or patient-actionable.

## Review outcomes

A review may:

- accept a binding as candidate public evidence
- request revision
- add limiting or contradictory evidence
- mark a replication attempt failed or mixed
- propose a successor hypothesis
- block publication for safety, privacy or authority reasons
