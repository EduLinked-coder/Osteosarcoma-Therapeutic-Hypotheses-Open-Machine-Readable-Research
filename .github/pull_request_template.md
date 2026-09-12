## Summary

- 
- 

## Generated-output freshness

- [ ] I ran `node scripts/render-public-research.js` after changing canonical hypothesis objects.
- [ ] I ran `node scripts/render-public-research.js --check` or confirmed CI will perform the check.
- [ ] Generated pages, indexes and sitemap are not edited by hand except through the renderer.

## Evidence and uncertainty boundary

- [ ] This PR does not imply accepted evidence, clinical efficacy or patient benefit.
- [ ] Supporting, limiting and contradictory evidence are labelled separately.
- [ ] Uncertainty, evidence maturity and review state are preserved or strengthened.
- [ ] Any evidence-binding changes validate against `schemas/evidence-binding.schema.json`.

## Public safety and authority

- [ ] No private patient, client, unpublished restricted research, credential or secret material is included.
- [ ] Publication authority is explicit, or the PR fails closed and requests review.
- [ ] Human scientific review is still required for promotion to reviewed or clinically validated states.

## Validation

- [ ] `node scripts/validate-schema.js`
- [ ] `node scripts/render-public-research.js --check`
- [ ] `node scripts/validate-public-research.js`
