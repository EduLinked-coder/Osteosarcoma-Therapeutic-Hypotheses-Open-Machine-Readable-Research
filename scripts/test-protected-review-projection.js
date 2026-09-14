const assert = require('assert');
const { validateProjection, loadLive } = require('./validate-protected-review-projection');

const live = loadLive();

function expectFailure(name, mutate) {
  const fixture = {
    register: JSON.parse(JSON.stringify(live.register)),
    reviewHtml: live.reviewHtml,
    quickstartHtml: live.quickstartHtml,
    quickstartSource: live.quickstartSource,
    readme: live.readme
  };
  mutate(fixture);
  assert.throws(
    () => validateProjection(
      fixture.register,
      fixture.reviewHtml,
      fixture.quickstartHtml,
      fixture.quickstartSource,
      fixture.readme
    ),
    Error,
    name + ' should fail closed.'
  );
}

validateProjection(live.register, live.reviewHtml, live.quickstartHtml, live.quickstartSource, live.readme);

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
  fixture.quickstartHtml = fixture.quickstartHtml.split('href="../../review/"').join('href="../../"');
});

expectFailure('quickstart autonomous-interpretation warning removed', (fixture) => {
  fixture.quickstartHtml = fixture.quickstartHtml.replace('not permission to choose an interpretation', 'may be normalised automatically');
});

expectFailure('markdown quickstart protected-review register removed', (fixture) => {
  fixture.quickstartSource = fixture.quickstartSource.split('governance/evidence-relationship-review-exceptions.json').join('governance/other.json');
});

expectFailure('markdown quickstart autonomous-resolution boundary removed', (fixture) => {
  fixture.quickstartSource = fixture.quickstartSource.replace('It is not permission', 'It is permission');
});

expectFailure('README protected-review route removed', (fixture) => {
  fixture.readme = fixture.readme.split('review/').join('review-disabled/');
});

expectFailure('README attributable-decision boundary removed', (fixture) => {
  fixture.readme = fixture.readme.replace('attributable human scientific decision', 'automated normalisation');
});

console.log('Protected scientific-review projection fail-closed fixtures passed.');
