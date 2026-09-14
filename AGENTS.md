# Agent Contract

This is a public research projection repository. Treat every published object as a research hypothesis, not medical advice, a treatment recommendation, a dosing instruction or a claim of patient benefit.

## Required Operating Order

DISCOVER -> REUSE -> BIND -> CONFIGURE -> COMPOSE -> EXTEND -> CREATE ONLY IF REQUIRED.

Before creating new schemas, indexes, evidence stores or publication mechanisms, inspect the existing repository and extend the smallest relevant authority boundary.

## Ecosystem Discovery and Reuse

Before adding research, evidence, provenance, human-interface or publication machinery, authorised agents must resolve the canonical EduLinked repository ecosystem registry and the existing Universal Research Engine federation capability. This repository is a consumer/public projection, not a replacement research engine.

Do not copy private repository topology, private research records, credentials, secrets, unpublished material or restricted source content into this public repository merely to make cross-repository automation easier. Private/source-owned routing belongs in the authorised ecosystem registry and source systems; this public repository should receive only deliberately public-safe release material.

Candidate evidence operations are not publication authority. If an upstream capability can discover sources or create candidate claims but cannot publish or approve claims, preserve that limitation here. Do not convert candidate evidence, export success, validator success or machine generation into publication or scientific-review authority.

Authorised ecosystem routing may resolve a source-owned domain research system without exposing that private routing here. Automated cross-repository publication must still fail closed until the candidate has attributable object-level lineage, disclosure authority and an explicit public-safe release handoff. Continue safe public-repository engineering, but do not infer or expose private source details merely because a domain source exists.

## Living Evidence History

Material changes in public evidence must use the existing `evidence-events/` append-only ledger and `schemas/evidence-change-event.schema.json`; do not invent another revision store.

Do not silently rewrite, delete or recycle a published `OS-EVENT-####` record to change history. Corrections must be represented by a later event with a new stable identifier. Event records may reference only deliberately public evidence bindings already present in this repository.

The canonical hypothesis object remains the current projection. The terminal evidence event for a hypothesis must reconcile to that canonical object's digest and lifecycle state. Changes to scientific review state, publication class, supersession or withdrawal require attributable human scientific authority. An evidence event does not transfer publication authority or clinical-use authority.

## Evidence Context Integrity

Every public evidence binding must explicitly assess experimental model, population/context and mechanism metadata using the existing `evidence_context` structure. When a public source has not been systematically assessed for one of those dimensions, preserve that uncertainty with an explicit unresolved status and `value: null`; do not infer missing context from a title, abstract, hypothesis wording or another source.

A `reported` context value must be attributable to the public source represented by that binding. Evidence-context completeness establishes machine-readable provenance discipline only; it does not establish scientific relevance, evidence quality, replication, acceptance, clinical validity, disclosure authority or publication authority.

## Protected Scientific Review State

Use the existing `governance/evidence-relationship-review-exceptions.json` register and `/review/` projection for governed relationship disagreements that genuinely require scientific interpretation. Do not create a second exception register, copy an unresolved relationship into another scientific record, or silently normalise the canonical hypothesis and evidence binding merely to make them agree.

A registered exception means that the disagreement is known and bounded; it does not decide which relationship is scientifically correct. Preserve both governed representations, `clinical_use:false`, uncertainty and contradictory-evidence state until an attributable human scientific decision authorises a change. The public review route is a discovery and escalation surface, not evidence acceptance, clinical authority or publication authority.

## Bounded Publication Review

Reuse `scripts/publication-transaction.js` for target-side validation/staging and `scripts/publication-review.js` for the bounded branch -> commit -> review-PR boundary. Do not create a parallel publication mechanism or general repository-mutation channel when these existing runtimes can perform the work.

A successful publication transaction, clean bounded commit, green CI or opened pull request does not grant scientific-review, disclosure, merge, clinical-use or publication authority. Never merge or auto-merge a publication PR without explicit authorised human action. Keep the source handoff envelope outside the public checkout and do not persist private/source routing, disclosure-authority details, credentials or secret values in public commits or PR bodies.

## Public Safety Rules

Never publish patient names, patient-specific tumour characteristics, treatment histories, medical records, private clinical notes, credentials, secrets, tokens, private repository content or restricted unpublished research.

When uncertain whether material is public-safe, fail closed and create a review item instead of publishing it.

The shared public-safety validator also fails closed on high-confidence patient-directed treatment instructions, patient-specific treatment recommendations, patient-directed dosing instructions and claims of individual patient benefit in structured public payloads. The same structured-payload rule is reused by candidate handoff validation and repository-wide public-safety validation. This deterministic guard is intentionally narrow: it does not determine scientific validity, replace human review, or treat contextual experimental dose reporting as patient guidance.

## Scientific Boundary

Preserve scientific uncertainty, contradictory evidence, evidence maturity, validation requirements, provenance and review state. A high research-priority score means worth investigating, not likely to benefit a patient.

Do not promote a hypothesis to reviewed or clinically validated without explicit human scientific authority and evidence.
