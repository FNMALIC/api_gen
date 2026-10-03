#!/usr/bin/env node
const path = require('path');
const { Command, Option } = require('commander');
const { generate, watch, TARGETS } = require('../lib/generate');
const { SHADCN_COMPONENTS } = require('../generators/dashboardGenerator');
const { version } = require('../package.json');

const program = new Command();

program
    .name('generate-api')
    .description('Generate a TypeScript API client, React Query hooks and a shadcn/ui CRUD dashboard from an OpenAPI 3 document.')
    .version(version)
    .argument('[input]', 'OpenAPI document: local path or URL, YAML or JSON', './schema.yaml')
    .argument('[output]', 'output directory', './src')
    .option('-o, --output <dir>', 'output directory (same as the [output] argument)')
    .option('--only <targets>', `comma-separated subset of ${TARGETS.join(', ')}`, value => value.split(',').map(t => t.trim()).filter(Boolean))
    .addOption(new Option('--router <router>', 'routing library for the dashboard').choices(['react-router', 'next']).default('react-router'))
    .option('--base-url <url>', 'axios baseURL used when utils/api.ts is first created', undefined)
    .option('--prefix <path>', 'path prefix before the model name, e.g. /api/v1 (default: auto-detects /api and /v1 style segments)')
    .addOption(new Option('--group-by <mode>', 'group operations into models by first path segment or by tag').choices(['path', 'tag']).default('path'))
    .option('--no-format', 'skip Prettier formatting of the generated files')
    .option('-w, --watch', 'regenerate whenever the input file changes')
    .action(async (input, outputArg, opts) => {
        const options = {
            input,
            output: opts.output || outputArg,
            only: opts.only || TARGETS,
            router: opts.router,
            baseUrl: opts.baseUrl,
            prefix: opts.prefix,
            groupBy: opts.groupBy,
            format: opts.format,
        };

        const report = ({ written, warnings }) => {
            warnings.forEach(warning => console.warn(`warning: ${warning}`));
            console.log(`Generated ${written.length} files in ${path.resolve(options.output)}`);
        };

        if (opts.watch) {
            watch(options, {
                onResult: result => {
                    report(result);
                    console.log('Watching for changes...');
                },
                onError: error => console.error(`error: ${error.message}`),
            });
            return;
        }

        const result = await generate(options);
        report(result);
        if (options.only.includes('dashboard')) {
            console.log('\nThe dashboard uses shadcn/ui. In your app, run:');
            console.log(`  npx shadcn@latest add ${SHADCN_COMPONENTS.join(' ')}`);
        }
    });

program.parseAsync(process.argv).catch(error => {
    console.error(`error: ${error.message}`);
    process.exitCode = 1;
});
