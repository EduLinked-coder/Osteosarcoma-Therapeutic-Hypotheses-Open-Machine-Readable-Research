'use strict';

const validStatuses = new Set(['identified', 'none-identified', 'not-yet-assessed']);

function validateContradictoryEvidenceIntegrity(state, where) {
  const prefix = (where || 'hypothesis') + ' contradictory_evidence';
  const status = state && state.status;
  const items = state && state.items;

  if (!validStatuses.has(status)) return [prefix + '.status is not supported.'];
  if (!Array.isArray(items)) return [prefix + '.items must be an array.'];
  if (status === 'identified' && items.length === 0) {
    return [prefix + '.status identified requires at least one evidence item.'];
  }
  if (status !== 'identified' && items.length !== 0) {
    return [prefix + '.status ' + status + ' requires an empty items array.'];
  }
  return [];
}

module.exports = { validateContradictoryEvidenceIntegrity };
