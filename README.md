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
- Use `.github/ISSUE_TEMPLATE/` to propose evidence, contradictions, failed replications, successor hypotheses or safety/privacy review.
- Copy `examples/evidence-bindings/*.example.json` when creating governed evidence bindings.

## Machine discovery

- `repository-manifest.json` — repository identity and discovery contract
- `AGENTS.md` — instructions for AI/research agents
- `schemas/therapeutic-hypothesis.schema.json` — hypothesis object schema
- `schemas/evidence-binding.schema.json` — evidence binding schema
- `hypotheses/` — durable hypothesis objects
- `indexes/hypotheses.json` — machine-readable discovery index
- `evidence-bindings/` — public evidence bindings used by hypothesis objects
- `examples/evidence-bindings/` — copyable candidate evidence-binding examples
- `docs/publication-lifecycle.md` — fail-closed publication authority and safety rules

## First publication cycle

The initial cycle publishes research hypotheses generated from the osteosarcoma research estate and independently checks the cited public literature. The first object, `OS-TH-0001`, concerns the research question of whether targeting a CD44-associated chemoresistant/metastatic phenotype together with tumour/bone/pulmonary immune-niche mechanisms warrants experimental investigation.

## Reuse

Agents may discover, compare and propose extensions to hypotheses, but must preserve provenance, distinguish source evidence from derived reasoning, surface contradictory evidence, preserve uncertainty, and label proposed combinations as hypotheses until experimentally supported.
