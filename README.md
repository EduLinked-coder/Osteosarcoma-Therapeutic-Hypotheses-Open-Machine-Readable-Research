# Osteosarcoma Therapeutic Hypotheses — Open Machine-Readable Research

An open, machine-readable publication layer for evidence-bound therapeutic hypotheses in osteosarcoma research.

This repository is designed for discovery and reuse by researchers, research software, AI systems and autonomous research agents. It publishes hypotheses as structured research objects with provenance, uncertainty, maturity and validation requirements.

## Important boundary

A published object is a **research hypothesis**, not an established treatment, cure, clinical recommendation or medical advice. No object in this repository should be used to make patient-specific treatment decisions. Hypotheses must not be promoted to a higher evidence state without appropriate evidence and human scientific review.

## Authority model

This repository is a public projection, not the private research engine or source-evidence authority. Every substantive hypothesis must bind to publicly inspectable evidence identifiers (for example PMID and DOI) and retain contradictory evidence and uncertainty where known.

Lifecycle:

`DISCOVERED -> COMPUTATIONALLY_SUPPORTED -> REPLICATED_EVIDENCE -> PRECLINICAL -> CLINICAL_INVESTIGATION -> CLINICALLY_VALIDATED`

Transitions are evidence gates, not automatic claims of efficacy.

## Quickstart

- Start with `docs/quickstart.md` for the human and machine entry points.
- Browse current public hypotheses from the GitHub Pages site or `indexes/hypotheses.json`.
- Use `structured-data/hypotheses.jsonld` for deterministic Schema.org JSON-LD discovery metadata derived from the same canonical public hypotheses.
- Use `search/` to search and filter the portfolio by canonical-object fields such as mechanism/target text, evidence stage, publication/review state, uncertainty, novelty and ranking state.
- Use `hypotheses/{OS-TH-####}/easy-read/` for the generated accessibility projection of the same canonical hypothesis object; see `docs/accessibility-projection.md` for its governance and limitations.
- Use `.github/ISSUE_TEMPLATE/` to propose evidence, contradictions, failed replications, successor hypotheses or safety/privacy review.
- Copy `examples/evidence-bindings/*.example.json` when creating governed evidence bindings.
- Use `evidence-events/` for append-only records of material evidence changes; see `docs/living-evidence-lifecycle.md` before recording a lifecycle event.

## Machine discovery

- `manifest.json` — stable contract entry point for machines and autonomous agents; deterministically generated from `repository-manifest.json`
- `repository-manifest.json` — canonical repository identity and discovery contract source; do not maintain `manifest.json` independently
- `AGENTS.md` — instructions for AI/research agents
- `structured-data/hypotheses.jsonld` — deterministic Schema.org JSON-LD collection projection
- `schemas/therapeutic-hypothesis.schema.json` — hypothesis object schema
- `schemas/evidence-binding.schema.json` — evidence binding schema
- `schemas/evidence-change-event.schema.json` — append-only evidence change event schema
- `hypotheses/` — durable hypothesis objects
- `indexes/hypotheses.json` — machine-readable discovery index
- `evidence-bindings/` — public evidence bindings used by hypothesis objects
- `evidence-events/` — append-only public evidence change history
- `examples/evidence-bindings/` — copyable candidate evidence-binding examples
- `docs/structured-metadata.md` — JSON-LD projection semantics and limits
- `docs/living-evidence-lifecycle.md` — evidence-change, revision, supersession and withdrawal history contract
- `docs/accessibility-projection.md` — accessibility projection contract and Easy Read boundary
- `docs/publication-lifecycle.md` — fail-closed publication authority and safety rules

Run `node scripts/render-machine-manifest.js --check` to verify that the stable `manifest.json` entry point still matches its canonical source.

## Living evidence

New supporting, contradictory, limiting, replication or retraction information must not silently overwrite the history of a hypothesis. Material evidence changes are recorded as stable `OS-EVENT-####` objects that bind existing public evidence IDs to the hypothesis state before and after the change.

The canonical `hypothesis.json` remains the current research projection. The event ledger preserves how ranking, uncertainty, review requirements, supersession or withdrawal decisions evolved. Protected scientific/publication lifecycle changes require an attributable human scientific decision; an event never transfers publication authority or clinical-use authority.

## Structured metadata

The JSON-LD projection is generated from canonical public hypotheses and existing public evidence bindings. It uses conservative Schema.org `CreativeWork` semantics and preserves evidence stage, review requirement, uncertainty, contradictory-evidence status, research-priority meaning and `clinicalUse:false` as machine-readable properties. It does not create a second scientific record or claim external indexing, certification, peer review or clinical validation.

## First publication cycle

The initial cycle publishes research hypotheses generated from the osteosarcoma research estate and independently checks the cited public literature. The first object, `OS-TH-0001`, concerns the research question of whether targeting a CD44-associated chemoresistant/metastatic phenotype together with tumour/bone/pulmonary immune-niche mechanisms warrants experimental investigation.

## Reuse

Agents may discover, compare and propose extensions to hypotheses, but must preserve provenance, distinguish source evidence from derived reasoning, surface contradictory evidence, preserve uncertainty, and label proposed combinations as hypotheses until experimentally supported.
