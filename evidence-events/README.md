# Evidence change events

This directory is the append-only public event ledger for material evidence changes affecting published osteosarcoma research hypotheses.

Each event file must be named exactly `{OS-EVENT-####}.json` and validate against `schemas/evidence-change-event.schema.json`.

An event records what changed, which public evidence bindings were involved, the hypothesis state before and after the recorded change, required downstream evaluation, provenance, and any attributable human scientific decision. It does **not** replace the canonical hypothesis object or evidence bindings.

## Authority boundary

- Event creation does not make evidence scientifically accepted.
- Event creation does not authorise publication, supersession, withdrawal or clinical use.
- A change to scientific review state, publication class or supersession state requires `scientific_decision.status = RECORDED_HUMAN_DECISION` with a non-empty attributable `authority_reference`.
- `publication_authority_transferred` must remain `false`.
- `clinical_use` must remain `false`.

## Append-only rule

Published event records are historical evidence. Do not silently rewrite, recycle or delete an event ID to make a later interpretation look cleaner. Corrections must be represented by a later event with a new stable ID and `previous_event_id` linkage where appropriate.

The canonical hypothesis remains the current projection. The event ledger preserves how evidence changes, review requirements, uncertainty, ranking and lifecycle state evolved over time.
