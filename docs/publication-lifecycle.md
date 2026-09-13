# Publication Lifecycle

This repository is a public research projection. It is not the private research engine, clinical decision system, patient record, unpublished research store or publication-authority source.

## Core rule

Private or restricted material must fail closed. If material is not clearly public-safe and publication-authorised, it must not be committed into canonical objects, evidence bindings, generated pages, indexes or the sitemap.

## Source-owned research integration

Cross-repository publication starts outside this public repository.

Authorised agents must first resolve the canonical EduLinked repository ecosystem registry and the existing Universal Research Engine federation capability. Reuse source-owned research, evidence, provenance, screening, review and human-interface capabilities rather than creating a second research engine or evidence store here.

Upstream research operations may produce candidate evidence packets or exports without possessing publication authority. A successful candidate-evidence build, MR3 export, validation report, renderer run or other machine receipt does **not** by itself authorise public release, scientific acceptance or clinical interpretation.

The public repository must not contain private repository topology or private source material solely to support automation. Private/source-owned routing remains in authorised internal systems. Only a deliberately public-safe release projection may cross into this repository.

Authorised ecosystem routing may resolve a source-owned osteosarcoma research system without making that private routing part of this public repository. For each public candidate, object-level lineage, disclosure authority and a public-safe release handoff must still be established. If any of those are unresolved, automated private-to-public publication is blocked. Do not copy private material for convenience or infer publication authority from domain ownership or technical success.

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

## Executable candidate handoff staging

The target-side transaction entry point is `scripts/publication-transaction.js`. It consumes only a deliberately public-safe candidate envelope using contract `OSTEOSARCOMA-PUBLIC-PROJECTION-HANDOFF-001`; it does not discover private repositories, read credentials, approve science, merge a pull request or confer publication authority.

Validate an envelope without changing repository files:

```sh
node scripts/publication-transaction.js --check path/to/public-safe-handoff.json
```

Stage a **new** candidate into a working branch:

```sh
node scripts/publication-transaction.js --stage path/to/public-safe-handoff.json
```

The transaction fails closed unless the handoff digest is intact, the target schemas match, source revision and report digest are attributable, disclosure authority is explicitly referenced, scientific review remains required, `clinical_use` remains false, uncertainty and contradictory-evidence assessment survive, evidence is public HTTP(S) candidate evidence bound to the same hypothesis, and every embedded object validates against the repository schemas.

The handoff envelope itself is not persisted into this public repository. Private/source routing remains source-owned. Existing hypothesis IDs cannot be autonomously overwritten by this transaction; revisions, supersession and replacement remain separate governed operations. After staging a new candidate, the script reuses the existing renderer and validators before reporting success. A Git branch or pull request must still be created through the normal bounded review path, and merge remains outside autonomous authority.

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
