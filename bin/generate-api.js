#!/usr/bin/env node
// Checked before loading anything else, so older Node versions get a clear message instead of a syntax error
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 19)) {
    console.error(
        `api-gen-package needs Node.js 22.19 or newer, and this is Node.js ${process.versions.node}.\n` +
            'Upgrade from https://nodejs.org (or with nvm / nvm-windows), or run it once with a newer Node:\n' +
            '  npx -p node@22 -p api-gen-package generate-api <input> <output>'
    );
    process.exit(1);
}
await import('../dist/cli.js');
