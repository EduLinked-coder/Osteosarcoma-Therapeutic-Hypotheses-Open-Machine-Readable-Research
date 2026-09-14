const assert = require('assert');
const { validateProjection, loadLive } = require('./validate-protected-review-projection');

const live = loadLive();

function expectFailure(name, mutate) {
  const fixture = {
    register: JSON.parse(JSON.stringify(live.register)),
    reviewHtml: live.reviewHtml,
    quickstartHtml: live.quickstartHtml
  };
  mutate(fixture);
  assert.throws(
    () => validateProjection(fixture.register, fixture.reviewHtml, fixture.quickstartHtml),
    Error,
    name + ' should fail closed.'
  );
}

validateProjection(live.register, live.reviewHtml, live.quickstartHtml);

expectFailure('missing runtime register binding', (fixture) => {
  fixture.reviewHtml = fixture.reviewHtml.replace(
    "const registerPath = '../governance/evidence-relationship-review-exceptions.json';",
    "const registerPath = '../governance/other.json';"
  );
});

expectFailure('hard-coded scientific exception state', (fixture) => {
  fixture.reviewHtml += '\n<!-- ' + fixture.register.exceptions[0].hypothesis_id + ' -->\n';
});

expectFailure('removed authority boundary', (fixture) => {
  fixture.reviewHtml = fixture.reviewHtml.replace('Authority boundary:', 'Boundary:');
});

expectFailure('unsafe review status transition', (fixture) => {
  fixture.register.exceptions[0].status = 'RESOLVED';
});

expectFailure('clinical-use boundary removed', (fixture) => {
  fixture.register.exceptions[0].clinical_use = true;
});

expectFailure('quickstart human review route removed', (fixture) => {
  fixture.quickstartHtml = fixture.quickstartHtml.replace('href="../../review/"', 'href="../../"');
});

expectFailure('quickstart autonomous-interpretation warning removed', (fixture) => {
  fixture.quickstartHtml = fixture.quickstartHtml.replace('not permission to choose an interpretation', 'may be normalised automatically');
});

console.log('Protected scientific-review projection fail-closed fixtures passed.');
