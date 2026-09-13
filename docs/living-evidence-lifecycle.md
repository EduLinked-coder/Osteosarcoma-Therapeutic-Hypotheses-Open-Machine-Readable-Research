# Living evidence lifecycle

Published hypotheses in this repository are living research objects. New evidence must be able to change the evidence graph, evidence maturity, uncertainty, ranking and review requirements without erasing how an earlier interpretation was reached.

This repository therefore uses an append-only evidence change ledger in `evidence-events/` alongside the existing canonical hypothesis objects and public evidence bindings.

## Reused authority boundaries

The public repository remains a projection and discovery surface. Evidence discovery, source-owned analysis and candidate generation remain upstream/source-owned capabilities. A public evidence event may only refer to evidence that is already deliberately public through `evidence-bindings/`.

An event is not a second hypothesis object, a second evidence store, or scientific approval. The current scientific projection remains `hypotheses/{OS-TH-####}/hypothesis.json`.

## Event flow

A material public evidence change should follow this sequence:

`PUBLIC EVIDENCE BINDING`

→ `EVIDENCE CHANGE EVENT`

→ `IMPACT ASSESSMENT`

→ `RANKING / UNCERTAINTY RECALCULATION WHERE REQUIRED`

→ `EVIDENCE-MATURITY / REVIEW-STATE / SUPERSESSION / WITHDRAWAL EVALUATION WHERE REQUIRED`

→ `CANONICAL HYPOTHESIS REVISION`

→ `DETERMINISTIC PUBLIC PROJECTIONS`

The event captures the hypothesis state before and after the recorded change. That state includes the canonical-object digest, evidence stage, ranking status and score, uncertainty level, review/publication state and supersession state. The terminal event for a hypothesis must match the current canonical object's digest and lifecycle fields, so the historical ledger cannot silently drift away from the published projection.

## Protected decisions

Ranking and uncertainty calculation may be machine-assisted where the repository's governed method allows it. Evidence maturity and scientific publication state are different.

Changes to `evidence_stage`, `review_state`, `publication_class`, or `supersession_status` require an attributable human scientific decision in the event record. `SUPERSESSION_RECORDED` and `WITHDRAWAL_RECORDED` events also require that authority explicitly.

A change in ranking score or ranking status must remain visible in the before/after event state. Recording a ranking change does not convert research priority into expected patient benefit.

No event may transfer publication authority or clinical-use authority.

## Append-only history

Event identifiers use `OS-EVENT-####`.

Once published, an event ID must never be silently reused for a different event. Historical events should not be rewritten or deleted to conceal superseded reasoning. If a correction is needed, add a later event with a new ID and link it through `previous_event_id`.

For each hypothesis with event history:

- there must be one root event;
- events must remain inside that hypothesis's history;
- there must be one terminal event;
- every event must belong to the single connected terminal-to-root chain;
- disconnected or cyclic event components are invalid;
- the terminal event's `hypothesis_state_after` must match the current canonical hypothesis object, including evidence stage and ranking score.

## Lifecycle binding integrity

The canonical hypothesis lifecycle also has to remain structurally resolvable across objects. `scripts/validate-lifecycle-bindings.js` enforces these machine-checkable rules without deciding whether a scientific supersession or withdrawal should happen:

- a `current` hypothesis cannot carry a stale successor or lifecycle reason;
- a `superseded` hypothesis must identify an existing different `OS-TH-####` successor and preserve a non-empty reason;
- `supersession.status: superseded` must agree with `review_state.publication_class: superseded`;
- a `withdrawn` hypothesis must preserve a non-empty reason, must not point to a successor, and must agree with withdrawn review/publication state;
- successor chains must not contain self-references or cycles.

These checks validate referential and lifecycle integrity only. They do not authorise supersession, withdrawal, evidence-stage promotion or publication. Those protected transitions still require attributable human scientific authority recorded through the governed event path.

`scripts/test-lifecycle-bindings.js` uses temporary synthetic fixtures only and proves that missing successors, stale current-state pointers, missing reasons, review-state mismatches, self-supersession and cycles fail closed. Test fixtures are not published research objects.

## Evidence and provenance requirements

Every event must reference one or more existing public evidence-binding IDs. Source provenance must remain public-safe. Private repository topology, private research notes, patient material, credentials and restricted evidence must not be copied into an event.

The event schema is `schemas/evidence-change-event.schema.json`. Validation is performed by `scripts/validate-evidence-events.js` in the existing repository CI path.

## Scientific meaning

A new evidence event means that the evidence history changed and was recorded. It does not mean:

- the evidence was proven true;
- a hypothesis became clinically validated;
- a patient is likely to benefit;
- a supersession or withdrawal is authorised unless an attributable human scientific decision is recorded;
- evidence maturity may be promoted without scientific authority;
- uncertainty may be discarded.

Contradictory, limiting and failed-replication evidence remains first-class evidence throughout the lifecycle.
