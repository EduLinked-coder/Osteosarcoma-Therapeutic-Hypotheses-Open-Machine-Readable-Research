const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const validator = path.join(__dirname, 'validate-lifecycle-bindings.js');

const baseHypothesis = (id) => ({
  hypothesis_id: id,
  clinical_use: false,
  review_state: {
    status: 'human-review-required',
    scientific_review_required: true,
    publication_class: 'public-research-candidate'
  },
  supersession: {
    status: 'current',
    successor_id: null,
    reason: null
  }
});

const writeFixture = (objects) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'osteosarcoma-lifecycle-'));
  for (const object of objects) {
    const dir = path.join(root, 'hypotheses', object.hypothesis_id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'hypothesis.json'), JSON.stringify(object, null, 2) + '\n');
  }
  return root;
};

const runFixture = (name, objects, expectedSuccess, expectedMessage) => {
  const root = writeFixture(objects);
  try {
    const result = spawnSync(process.execPath, [validator, '--root=' + root], { encoding: 'utf8' });
    const output = (result.stdout || '') + (result.stderr || '');
    const succeeded = result.status === 0;
    if (succeeded !== expectedSuccess) {
      throw new Error(name + ' expected success=' + expectedSuccess + ' but exit status was ' + result.status + '.\n' + output);
    }
    if (expectedMessage && !output.includes(expectedMessage)) {
      throw new Error(name + ' did not emit expected message ' + JSON.stringify(expectedMessage) + '.\n' + output);
    }
    console.log('PASS ' + name);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};

const currentA = baseHypothesis('OS-TH-0001');
runFixture('current hypothesis', [currentA], true, 'Lifecycle binding validation passed');

const supersededA = baseHypothesis('OS-TH-0001');
supersededA.supersession = {
  status: 'superseded',
  successor_id: 'OS-TH-0002',
  reason: 'A reviewed successor replaces this interpretation.'
};
supersededA.review_state.publication_class = 'superseded';
const currentB = baseHypothesis('OS-TH-0002');
runFixture('valid supersession chain', [supersededA, currentB], true, 'Lifecycle binding validation passed');

const missingSuccessor = JSON.parse(JSON.stringify(supersededA));
missingSuccessor.supersession.successor_id = 'OS-TH-0999';
runFixture('missing successor', [missingSuccessor], false, 'points to missing successor OS-TH-0999');

const selfSuccessor = JSON.parse(JSON.stringify(supersededA));
selfSuccessor.supersession.successor_id = 'OS-TH-0001';
runFixture('self supersession', [selfSuccessor], false, 'cannot supersede itself');

const missingReason = JSON.parse(JSON.stringify(supersededA));
missingReason.supersession.reason = '   ';
runFixture('superseded without reason', [missingReason, currentB], false, 'has no non-empty reason');

const staleCurrent = baseHypothesis('OS-TH-0001');
staleCurrent.supersession.successor_id = 'OS-TH-0002';
runFixture('current object with stale successor', [staleCurrent, currentB], false, 'is current but has successor_id');

const withdrawn = baseHypothesis('OS-TH-0001');
withdrawn.supersession = {
  status: 'withdrawn',
  successor_id: null,
  reason: 'Continued publication is no longer scientifically appropriate.'
};
withdrawn.review_state.status = 'withdrawn';
withdrawn.review_state.publication_class = 'withdrawn';
runFixture('valid withdrawal', [withdrawn], true, 'Lifecycle binding validation passed');

const withdrawnWithSuccessor = JSON.parse(JSON.stringify(withdrawn));
withdrawnWithSuccessor.supersession.successor_id = 'OS-TH-0002';
runFixture('withdrawal with successor', [withdrawnWithSuccessor, currentB], false, 'must not point to a successor');

const publicationMismatch = JSON.parse(JSON.stringify(supersededA));
publicationMismatch.review_state.publication_class = 'public-research-candidate';
runFixture('supersession publication-state mismatch', [publicationMismatch, currentB], false, 'requires review_state.publication_class=superseded');

const cycleA = JSON.parse(JSON.stringify(supersededA));
const cycleB = baseHypothesis('OS-TH-0002');
cycleB.supersession = {
  status: 'superseded',
  successor_id: 'OS-TH-0001',
  reason: 'Synthetic cycle fixture.'
};
cycleB.review_state.publication_class = 'superseded';
runFixture('supersession cycle', [cycleA, cycleB], false, 'Supersession cycle detected');

console.log('Lifecycle binding fail-closed fixture tests passed.');
