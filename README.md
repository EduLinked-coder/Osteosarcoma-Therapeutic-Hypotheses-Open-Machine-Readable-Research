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
- Use `activity/` for the generated living-research activity view and `indexes/evidence-events.json` for the machine-readable event/activity index.
- Use `structured-data/hypotheses.jsonld` for deterministic Schema.org JSON-LD discovery metadata derived from the same canonical public hypotheses.
- Use `review/` to inspect protected unresolved scientific interpretation differences and `governance/evidence-relationship-review-exceptions.json` for the governed machine-readable exception register. A registered exception is an unresolved human scientific-review state, not permission to normalise the relationship automatically.
- Use `search/` to search and filter the portfolio by canonical-object fields such as mechanism/target text, evidence stage, publication/review state, uncertainty, novelty and ranking state.
- Use `hypotheses/{OS-TH-####}/easy-read/` for the generated accessibility projection of the same canonical hypothesis object; see `docs/accessibility-projection.md` for its governance and limitations.
- Use `.github/ISSUE_TEMPLATE/` to submit governed review inputs for new evidence, contradictory evidence, failed replication, a new hypothesis, a mechanism proposal, a falsification experiment, an error report, a successor hypothesis, or safety/privacy review. Issue creation records a proposal only; it does not accept scientific evidence or grant publication authority.
- Use `schemas/research-contribution.schema.json` and `docs/contribution-lifecycle.md` for the machine-readable contribution types and review states behind those public intake paths.
- Copy `examples/evidence-bindings/*.example.json` when creating governed evidence bindings.
- Use `evidence-events/` for append-only records of material evidence changes; see `docs/living-evidence-lifecycle.md` before recording a lifecycle event.

## Machine discovery

- `manifest.json` — stable contract entry point for machines and autonomous agents; deterministically generated from `repository-manifest.json`
- `repository-manifest.json` — canonical repository identity and discovery contract source; do not maintain `manifest.json` independently
- `AGENTS.md` — instructions for AI/research agents
- `indexes/hypotheses.json` — machine-readable hypothesis discovery index
- `indexes/evidence-events.json` — deterministic living-evidence activity index
- `structured-data/hypotheses.jsonld` — deterministic Schema.org JSON-LD collection projection
- `governance/evidence-relationship-review-exceptions.json` — governed register of unresolved evidence-relationship interpretation differences that require attributable human scientific review
- `review/` — human projection of that governed protected-review state; it does not decide which scientific interpretation is correct
- `schemas/therapeutic-hypothesis.schema.json` — hypothesis object schema
- `schemas/evidence-binding.schema.json` — evidence binding schema
- `schemas/evidence-change-event.schema.json` — append-only evidence change event schema
- `schemas/research-contribution.schema.json` — governed public contribution proposal schema
- `hypotheses/` — durable hypothesis objects
- `evidence-bindings/` — public evidence bindings used by hypothesis objects
- `evidence-events/` — append-only public evidence change history
- `examples/evidence-bindings/` — copyable candidate evidence-binding examples
- `docs/structured-metadata.md` — JSON-LD projection semantics and limits
- `docs/living-evidence-lifecycle.md` — evidence-change, revision, supersession and withdrawal history contract
- `docs/contribution-lifecycle.md` — governed contribution states and public intake boundary
- `docs/accessibility-projection.md` — accessibility projection contract and Easy Read boundary
- `docs/publication-lifecycle.md` — fail-closed publication authority and safety rules

Run `node scripts/render-machine-manifest.js --check` to verify that the stable `manifest.json` entry point still matches its canonical source. Run `node scripts/render-research-activity.js --check` to verify that the human and machine activity projections match the canonical hypotheses and append-only event ledger. Run `node scripts/validate-contribution-intake.js` to verify that every machine-readable contribution type retains a governed public intake path.

## Living evidence

New supporting, contradictory, limiting, replication or retraction information must not silently overwrite the history of a hypothesis. Material evidence changes are recorded as stable `OS-EVENT-####` objects that bind existing public evidence IDs to the hypothesis state before and after the change.

The canonical `hypothesis.json` remains the current research projection. The event ledger preserves evidence maturity, ranking status and score, uncertainty, review requirements, supersession and withdrawal decisions. Evidence-stage and protected publication-lifecycle changes require an attributable human scientific decision; an event never transfers publication authority or clinical-use authority.

`activity/` and `indexes/evidence-events.json` are generated discovery projections over that history. They surface new evidence events, changed ranking metadata, changed evidence maturity, superseded/withdrawn hypotheses and unresolved evidence gaps without becoming a second scientific store. When the event ledger is empty, the activity page explicitly does **not** interpret that as evidence that no new literature exists.

## Structured metadata

The JSON-LD projection is generated from canonical public hypotheses and existing public evidence bindings. It uses conservative Schema.org `CreativeWork` semantics and preserves evidence stage, review requirement, uncertainty, contradictory-evidence status, research-priority meaning and `clinicalUse:false` as machine-readable properties. It does not create a second scientific record or claim external indexing, certification, peer review or clinical validation.

## First publication cycle

The initial cycle publishes research hypotheses generated from the osteosarcoma research estate and independently checks the cited public literature. The first object, `OS-TH-0001`, concerns the research question of whether targeting a CD44-associated chemoresistant/metastatic phenotype together with tumour/bone/pulmonary immune-niche mechanisms warrants experimental investigation.

## Reuse

Agents may discover, compare and propose extensions to hypotheses, but must preserve provenance, distinguish source evidence from derived reasoning, surface contradictory evidence, preserve uncertainty, and label proposed combinations as hypotheses until experimentally supported. Before normalising a known evidence-relationship mismatch, agents must inspect `governance/evidence-relationship-review-exceptions.json`; a registered protected-review exception remains unresolved until an attributable human scientific decision exists.
