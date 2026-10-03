const fs = require('fs');
const path = require('path');
const { loadSpec, buildModels } = require('./spec');
const { createTypeContext, generateTypes } = require('../generators/typesGenerator');
const { generateAxiosInstanceFile, generateAPIFiles } = require('../generators/apiGenerator');
const { generateReactQueryHooks } = require('../generators/hooksGenerator');
const { generateCRUDDashboard, ROUTERS } = require('../generators/dashboardGenerator');

const TARGETS = ['api', 'hooks', 'dashboard'];

async function formatFile(filePath, content) {
    const prettier = require('prettier');
    const config = (await prettier.resolveConfig(filePath)) || { tabWidth: 4, printWidth: 120 };
    try {
        return await prettier.format(content, { ...config, filepath: filePath });
    } catch (error) {
        throw new Error(`Generated invalid code in ${filePath}: ${error.message}`);
    }
}

/**
 * Generate the API client, React Query hooks and shadcn/ui dashboard from an OpenAPI 3 document.
 *
 * @param {object} options
 * @param {string} options.input        Path or URL of the OpenAPI document (YAML or JSON)
 * @param {string} [options.output]     Output directory (default "./src")
 * @param {string[]} [options.only]     Subset of "api", "hooks", "dashboard"
 * @param {string} [options.router]     "react-router" or "next"
 * @param {string} [options.baseUrl]    axios baseURL for a newly created utils/api.ts
 * @param {string} [options.prefix]     Path prefix before the model segment (default: auto-detect /api, /v1, ...)
 * @param {string} [options.groupBy]    "path" or "tag"
 * @param {boolean} [options.format]    Format output with Prettier (default true)
 * @returns {Promise<{ written: string[], skipped: string[], warnings: string[] }>}
 */
async function generate(options) {
    const {
        input,
        output = './src',
        only = TARGETS,
        router = 'react-router',
        baseUrl = '/',
        prefix,
        groupBy = 'path',
        format = true,
    } = options;

    if (!input) throw new Error('An input OpenAPI document is required.');
    const unknownTargets = only.filter(target => !TARGETS.includes(target));
    if (unknownTargets.length > 0) {
        throw new Error(`Unknown target(s) ${unknownTargets.join(', ')}. Use: ${TARGETS.join(', ')}`);
    }
    if (!ROUTERS[router]) throw new Error(`Unknown router "${router}". Use: ${Object.keys(ROUTERS).join(', ')}`);
    if (!['path', 'tag'].includes(groupBy)) throw new Error(`Unknown groupBy "${groupBy}". Use: path, tag`);

    const api = await loadSpec(input);
    const context = createTypeContext(api);
    const { models, skipped } = buildModels(api, context, { prefix, groupBy });
    if (models.length === 0) {
        throw new Error(
            prefix !== undefined
                ? `No paths start with the prefix "${prefix}".`
                : 'No operations found in the document.'
        );
    }

    const files = {};
    const warnings = skipped.map(operation => `Skipped ${operation}: no model segment after the prefix.`);

    if (only.includes('api')) {
        Object.assign(files, generateTypes(api, context), generateAPIFiles(models, context));
        // utils/api.ts is meant to be customized (interceptors, headers), so it is only created once
        if (fs.existsSync(path.join(output, 'utils/api.ts'))) {
            if (options.baseUrl !== undefined) {
                warnings.push('utils/api.ts already exists and was left untouched; update its baseURL by hand.');
            }
        } else {
            files['utils/api.ts'] = generateAxiosInstanceFile(baseUrl);
        }
    }
    if (only.includes('hooks')) {
        Object.assign(files, generateReactQueryHooks(models));
    }
    if (only.includes('dashboard')) {
        const dashboard = generateCRUDDashboard(models, { router });
        Object.assign(files, dashboard.files);
        warnings.push(...dashboard.warnings);
    }

    const written = [];
    for (const [relativePath, content] of Object.entries(files)) {
        const filePath = path.join(output, relativePath);
        const finalContent = format ? await formatFile(filePath, content) : content;
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, finalContent);
        written.push(relativePath);
    }

    return { written, skipped, warnings };
}

/**
 * Generate once, then again whenever the input file changes. Returns a function that stops watching.
 */
function watch(options, { onResult = () => {}, onError = () => {} } = {}) {
    if (/^https?:\/\//i.test(options.input)) {
        throw new Error('--watch needs a local file, not a URL.');
    }

    let running = Promise.resolve();
    const run = () => {
        running = running.then(() => generate(options).then(onResult, onError));
        return running;
    };

    run();
    // Polling survives editors that save by replacing the file, which breaks fs.watch
    const listener = (current, previous) => {
        if (current.mtimeMs !== previous.mtimeMs) run();
    };
    fs.watchFile(options.input, { interval: 300 }, listener);

    return () => fs.unwatchFile(options.input, listener);
}

module.exports = {
    generate,
    watch,
    TARGETS,
};
