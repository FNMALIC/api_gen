const fs = require('fs');
const path = require('path');
const { generate } = require('../lib/generate');

const FIXTURES = path.join(__dirname, 'fixtures');
// Inside the repo so generated code resolves this package's node_modules (react, axios, ...)
const TMP_ROOT = path.join(__dirname, '.tmp');

function tmpDir(name) {
    fs.mkdirSync(TMP_ROOT, { recursive: true });
    return fs.mkdtempSync(path.join(TMP_ROOT, `${name}-`));
}

async function generateFixture(fixture, options = {}) {
    const dir = tmpDir(path.basename(fixture, path.extname(fixture)));
    const output = path.join(dir, 'src');
    const result = await generate({ input: path.join(FIXTURES, fixture), output, ...options });
    const read = file => fs.readFileSync(path.join(output, file), 'utf8');
    const exists = file => fs.existsSync(path.join(output, file));
    return { dir, output, result, read, exists };
}

module.exports = { FIXTURES, tmpDir, generateFixture };
