# Bounded Publication Review

This repository separates **candidate staging** from **publication authority**.

`scripts/publication-transaction.js` remains the authoritative target-side validator and staging transaction for a deliberately public-safe `OSTEOSARCOMA-PUBLIC-PROJECTION-HANDOFF-001` envelope. `scripts/publication-review.js` composes that existing transaction with the repository's normal Git review boundary so an authorised agent environment can create a bounded branch, commit only validated public projection artefacts, and open a **draft** pull request.

The review runtime is not a second publication mechanism. It calls the existing handoff validator and staging transaction and does not discover private repositories, read canonical credentials, approve science, merge a pull request, deploy GitHub Pages or grant publication authority.

## Plan without repository mutation

```sh
node scripts/publication-review.js --plan /path/outside/repository/public-safe-handoff.json
```

The plan validates the same handoff contract and prints only bounded review metadata. It does not print the source repository, source object identifiers or disclosure-authority reference.

## Open a bounded draft pull request

Run from a clean checkout whose `main` exactly matches `origin/main`:

```sh
node scripts/publication-review.js --open-draft-pr /path/outside/repository/public-safe-handoff.json
```

The handoff file must remain outside the repository checkout. The command:

1. validates the public-safe handoff through the existing publication transaction;
2. verifies the canonical GitHub origin, clean working tree and exact `main == origin/main` state;
3. fails closed if the deterministic publication branch already exists locally or remotely;
4. creates `publication/{os-th-id}-candidate`;
5. stages the new candidate through `scripts/publication-transaction.js`, including deterministic rendering and post-stage validation;
6. accepts only the candidate's canonical/public projection paths plus the known generated shared projections;
7. commits only those allowlisted paths;
8. pushes the bounded branch;
9. opens a **draft** PR with `gh pr create --draft`;
10. returns the PR URL.

If validation or the path allowlist fails before commit, the runtime attempts to restore the clean base state. If a failure occurs after commit or push, it fails closed and leaves the review branch intact for inspection rather than rewriting remote history.

## Authority and privacy boundary

The runtime deliberately does **not** persist the handoff envelope or copy private/source routing into the public PR body. It does not expose credential values. Authentication is supplied by the already-authorised local Git/GitHub environment rather than embedded into repository code.

A successful draft PR means only that bounded engineering gates passed. It does not mean:

- evidence has been scientifically accepted;
- contradictory evidence has been resolved;
- research priority predicts patient benefit;
- privacy or disclosure review is complete beyond the explicit handoff authority supplied upstream;
- the hypothesis is clinically validated;
- merge is authorised;
- publication is approved.

`clinical_use:false`, explicit scientific review, uncertainty, contradictory-evidence state, stable identifiers and target-side public-safety validation remain mandatory.

## Fail-closed change boundary

The publication review runtime permits only candidate-specific canonical/public projection files and the deterministic shared projections already produced by the existing render pipeline. It rejects unrelated changes such as repository documentation, workflows, canonical manifest source or other source-controlled files. This prevents a candidate handoff from becoming a general repository-mutation channel.

The dedicated regression check is:

```sh
node scripts/test-publication-review.js
```

Pull-request CI runs this test in addition to the existing publication-transaction and public-research validation chain.
