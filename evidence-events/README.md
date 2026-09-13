# Evidence change events

This directory is the append-only public event ledger for material evidence changes affecting published osteosarcoma research hypotheses.

Each event file must be named exactly `{OS-EVENT-####}.json` and validate against `schemas/evidence-change-event.schema.json`.

An event records what changed, which public evidence bindings were involved, the hypothesis state before and after the recorded change, required downstream evaluation, provenance, and any attributable human scientific decision. It does **not** replace the canonical hypothesis object or evidence bindings.

## Authority boundary

- Event creation does not make evidence scientifically accepted.
- Event creation does not authorise publication, supersession, withdrawal or clinical use.
- A change to evidence stage, scientific review state, publication class or supersession state requires `scientific_decision.status = RECORDED_HUMAN_DECISION` with a non-empty attributable `authority_reference`.
- Ranking status and ranking score remain research-priority metadata, never expected patient benefit.
- `publication_authority_transferred` must remain `false`.
- `clinical_use` must remain `false`.

## Append-only rule

Published event records are historical evidence. Do not silently rewrite, recycle or delete an event ID to make a later interpretation look cleaner. Corrections must be represented by a later event with a new stable ID and `previous_event_id` linkage where appropriate.

The canonical hypothesis remains the current projection. The event ledger preserves how evidence maturity, evidence changes, review requirements, uncertainty, ranking and lifecycle state evolved over time. Every hypothesis history must form one connected terminal-to-root chain; disconnected or cyclic components are invalid.

## Discovery projections

- `../indexes/evidence-events.json` is the deterministic machine-readable activity index generated from this ledger and canonical hypotheses.
- `../activity/` is the deterministic human-facing activity view generated from the same sources.

These projections may surface new evidence events, changed ranking metadata, changed evidence stage, superseded or withdrawn hypotheses, and unresolved evidence gaps. They are not independent scientific records and do not imply that the absence of an event means no new literature exists.
