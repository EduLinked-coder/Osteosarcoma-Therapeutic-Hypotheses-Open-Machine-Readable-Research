'use strict';

const fs = require('fs');
const path = require('path');

const CONTRIBUTION_ID = /^OS-CONTRIB-[0-9]{4}$/;
const HYPOTHESIS_ID = /^OS-TH-[0-9]{4}$/;

function discoverContributionFiles(root) {
  const files = [];
  const errors = [];
  for (const relativeRoot of ['examples/contributions', 'contributions']) {
    const dir = path.join(root, relativeRoot);
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const relativePath = relativeRoot + '/' + entry.name;
      if (entry.isDirectory() || entry.isSymbolicLink()) {
        errors.push(relativePath + ' is not a direct governed contribution JSON file; nested directories and symlinks are prohibited.');
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        files.push(relativePath);
      }
    }
  }
  files.sort();
  return { files, errors };
}

function validateContributionObjectIdentity({ root, relativePath, object, liveIds, exampleIds }) {
  const errors = [];
  const isExample = relativePath.startsWith('examples/contributions/');
  const isLive = relativePath.startsWith('contributions/');
  if (!isExample && !isLive) return [relativePath + ' is outside governed contribution directories.'];

  const id = object.contribution_id;
  if (typeof id !== 'string' || !CONTRIBUTION_ID.test(id)) {
    errors.push(relativePath + ' has invalid contribution_id.');
  } else {
    const ids = isExample ? exampleIds : liveIds;
    if (ids.has(id)) errors.push(relativePath + ' duplicates contribution_id ' + id + ' within its governed namespace.');
    ids.add(id);
  }

  if (isExample) {
    if (object.example !== true) errors.push(relativePath + ' template example must explicitly set example:true.');
    if (object.state !== 'SUBMITTED') errors.push(relativePath + ' template example must remain SUBMITTED.');
    return errors;
  }

  if (relativePath !== 'contributions/' + String(id) + '.json') {
    errors.push(relativePath + ' filename must match contribution_id ' + String(id) + ' at contributions/{contribution_id}.json.');
  }
  if (object.example === true) errors.push(relativePath + ' live contribution must not be marked example:true.');

  const targetId = object.target_hypothesis_id;
  if (typeof targetId === 'string' && HYPOTHESIS_ID.test(targetId)) {
    const canonicalPath = 'hypotheses/' + targetId + '/hypothesis.json';
    const absolutePath = path.join(root, canonicalPath);
    if (!fs.existsSync(absolutePath)) {
      errors.push(relativePath + ' references missing canonical hypothesis ' + canonicalPath + '.');
    } else {
      try {
        const canonical = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
        if (canonical.hypothesis_id !== targetId) {
          errors.push(relativePath + ' target ' + targetId + ' does not match canonical hypothesis_id in ' + canonicalPath + '.');
        }
      } catch (error) {
        errors.push(relativePath + ' target canonical hypothesis is not readable JSON at ' + canonicalPath + '.');
      }
    }
  }
  return errors;
}

module.exports = { discoverContributionFiles, validateContributionObjectIdentity };
