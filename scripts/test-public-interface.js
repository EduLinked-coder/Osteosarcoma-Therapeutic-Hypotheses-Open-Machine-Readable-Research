const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const validator = path.join(__dirname, 'validate-public-interface.js');
let failed = false;

const fail = (message) => {
  console.error('PUBLIC INTERFACE TEST FAILED: ' + message);
  failed = true;
};

const validHtml = ({ href = 'data.json', img = '<img src="figure.png" alt="Decorative research diagram">', extra = '' } = {}) => `<!doctype html>
<html lang="en-AU">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fixture</title></head>
<body><main><h1>Fixture</h1><a href="${href}">Data</a>${img}${extra}</main></body>
</html>`;

const runFixture = (name, html, shouldPass, extraFiles = { 'data.json': '{}\n' }) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osteosarcoma-interface-'));
  try {
    fs.writeFileSync(path.join(dir, 'index.html'), html);
    for (const [file, content] of Object.entries(extraFiles)) {
      const target = path.join(dir, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
    const result = spawnSync(process.execPath, [validator, '--root', dir], { encoding: 'utf8' });
    const passed = result.status === 0;
    if (passed !== shouldPass) {
      fail(name + ' expected ' + (shouldPass ? 'success' : 'failure') + ' but got exit ' + result.status + '. Output: ' + result.stdout + result.stderr);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

runFixture('valid accessible page', validHtml(), true);
runFixture('broken local link', validHtml({ href: 'missing.json' }), false, {});
runFixture('missing language', validHtml().replace(' lang="en-AU"', ''), false);
runFixture('missing image alt', validHtml({ img: '<img src="figure.png">' }), false);
runFixture('positive tabindex', validHtml({ extra: '<button tabindex="2">Unsafe order</button>' }), false);
runFixture('unsafe new window', validHtml({ extra: '<a href="https://example.org" target="_blank">External</a>' }), false);
runFixture('safe new window', validHtml({ extra: '<a href="https://example.org" target="_blank" rel="noopener noreferrer">External</a>' }), true);

if (failed) {
  process.exitCode = 1;
} else {
  console.log('Public interface fail-closed fixture tests passed.');
}
