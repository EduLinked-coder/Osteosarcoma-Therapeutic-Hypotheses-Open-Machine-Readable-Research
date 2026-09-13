const fs = require('fs');
const path = require('path');

const idPattern = /^OS-TH-[0-9]{4}$/;
const rootArg = process.argv.find((arg) => arg.startsWith('--root='));
const root = rootArg ? path.resolve(rootArg.slice('--root='.length)) : process.cwd();
let failed = false;

const fail = (message) => {
  console.error('LIFECYCLE VALIDATION FAILED: ' + message);
  failed = true;
};

const hypothesesRoot = path.join(root, 'hypotheses');
if (!fs.existsSync(hypothesesRoot)) {
  fail('Missing hypotheses/ directory.');
  process.exitCode = 1;
  return;
}

const ids = fs.readdirSync(hypothesesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && idPattern.test(entry.name))
  .filter((entry) => fs.existsSync(path.join(hypothesesRoot, entry.name, 'hypothesis.json')))
  .map((entry) => entry.name)
  .sort();

if (ids.length === 0) fail('No canonical hypothesis objects found.');

const byId = new Map();
for (const id of ids) {
  const relative = 'hypotheses/' + id + '/hypothesis.json';
  try {
    const object = JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
    if (object.hypothesis_id !== id) fail(relative + ' hypothesis_id does not match its stable directory.');
    byId.set(id, { object, relative });
  } catch (error) {
    fail(relative + ' could not be parsed: ' + error.message);
  }
}

const successorById = new Map();
const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;

for (const [id, { object: hypothesis, relative }] of byId.entries()) {
  const lifecycle = hypothesis.supersession;
  const reviewState = hypothesis.review_state || {};

  if (hypothesis.clinical_use !== false) fail(relative + ' must preserve clinical_use:false.');
  if (!lifecycle || typeof lifecycle !== 'object' || Array.isArray(lifecycle)) {
    fail(relative + ' is missing a supersession lifecycle object.');
    continue;
  }

  const status = lifecycle.status;
  const successorId = lifecycle.successor_id;
  const reason = lifecycle.reason;

  if (status === 'current') {
    if (successorId !== null) fail(relative + ' is current but has successor_id ' + JSON.stringify(successorId) + '.');
    if (reason !== null) fail(relative + ' is current but has a supersession/withdrawal reason.');
    if (['superseded', 'withdrawn'].includes(reviewState.publication_class)) {
      fail(relative + ' is current but review_state.publication_class is ' + reviewState.publication_class + '.');
    }
    continue;
  }

  if (status === 'superseded') {
    if (!idPattern.test(successorId || '')) {
      fail(relative + ' is superseded but successor_id is missing or malformed.');
      continue;
    }
    if (successorId === id) fail(relative + ' cannot supersede itself.');
    if (!byId.has(successorId)) fail(relative + ' points to missing successor ' + successorId + '.');
    if (!nonEmpty(reason)) fail(relative + ' is superseded but has no non-empty reason.');
    if (reviewState.publication_class !== 'superseded') {
      fail(relative + ' supersession.status=superseded requires review_state.publication_class=superseded.');
    }
    successorById.set(id, successorId);
    continue;
  }

  if (status === 'withdrawn') {
    if (successorId !== null) fail(relative + ' is withdrawn and must not point to a successor.');
    if (!nonEmpty(reason)) fail(relative + ' is withdrawn but has no non-empty reason.');
    if (reviewState.publication_class !== 'withdrawn') {
      fail(relative + ' supersession.status=withdrawn requires review_state.publication_class=withdrawn.');
    }
    if (reviewState.status !== 'withdrawn') {
      fail(relative + ' supersession.status=withdrawn requires review_state.status=withdrawn.');
    }
    continue;
  }

  fail(relative + ' has unsupported supersession.status ' + JSON.stringify(status) + '.');
}

const visiting = new Set();
const visited = new Set();
const chain = [];

const visit = (id) => {
  if (visiting.has(id)) {
    const start = chain.indexOf(id);
    const cycle = [...chain.slice(start), id].join(' -> ');
    fail('Supersession cycle detected: ' + cycle + '.');
    return;
  }
  if (visited.has(id)) return;

  visiting.add(id);
  chain.push(id);
  const successorId = successorById.get(id);
  if (successorId && byId.has(successorId)) visit(successorId);
  chain.pop();
  visiting.delete(id);
  visited.add(id);
};

for (const id of byId.keys()) visit(id);

if (failed) {
  process.exitCode = 1;
} else {
  console.log('Lifecycle binding validation passed for ' + byId.size + ' canonical hypothesis object(s).');
}
