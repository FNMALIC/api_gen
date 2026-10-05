import path from 'node:path';
import { createRequire } from 'node:module';
import { Command, Option } from 'commander';
import fs from 'node:fs';
import { generate, watch, TARGETS, type GenerateOptions, type GenerateResult } from './generate.ts';
import { loadConfig, createDesignFile, CONFIG_FILES } from './config.ts';
import { createApp, exampleFiles } from './create.ts';
import { startMockServer } from './mock.ts';
import { LOCALES } from './locales.ts';
import { SHADCN_COMPONENTS } from './generators/dashboard.ts';
import type { RouterName, Target } from './model.ts';

// src/ and dist/ both sit next to package.json
const { version } = createRequire(import.meta.url)('../package.json') as { version: string };

interface CliOptions {
    config?: string;
    output?: string;
    only?: Target[];
    router: RouterName;
    baseUrl?: string;
    prefix?: string;
    groupBy: 'path' | 'tag';
    zod?: boolean;
    envelope?: string | false;
    title?: string;
    locale?: keyof typeof LOCALES;
    pageSize?: number;
    primaryColor?: string;
    radius?: string;
    darkMode: boolean;
    login: boolean;
    templates?: string;
    clean: boolean;
    format: boolean;
    watch?: boolean;
}

const program = new Command();

program
    .name('generate-api')
    .description('Generate a TypeScript API client, React Query hooks and a shadcn/ui CRUD dashboard from an OpenAPI document.')
    .version(version)
    .argument('[input]', 'OpenAPI 3 or Swagger 2 document: local path or URL, YAML or JSON (default: ./schema.yaml)')
    .argument('[output]', 'output directory (default: ./src)')
    .option('-c, --config <file>', 'config file (default: api-gen.config.json/.js in the current directory)')
    .option('-o, --output <dir>', 'output directory (same as the [output] argument)')
    .option('--only <targets>', `comma-separated subset of ${TARGETS.join(', ')}`, (value: string) =>
        value.split(',').map(target => target.trim()).filter(Boolean)
    )
    .addOption(new Option('--router <router>', 'routing library for the dashboard').choices(['react-router', 'next']).default('react-router'))
    .option('--base-url <url>', 'axios baseURL used when utils/api.ts is first created (default: the document\'s first server URL, else /)')
    .option('--prefix <path>', 'path prefix before the resource name, e.g. /api/v1 (default: auto-detects /api and /v1 style segments)')
    .addOption(new Option('--group-by <mode>', 'group operations into resources by first path segment or by tag').choices(['path', 'tag']).default('path'))
    .option('--envelope <key>', 'payload property of wrapped responses like { success, data } (default: detected automatically)')
    .option('--no-envelope', 'never unwrap responses')
    .option('--zod', 'validate JSON responses at runtime with generated zod schemas')
    .option('--title <text>', 'dashboard title in the sidebar and on the login page (default: the document\'s info.title)')
    .addOption(new Option('--locale <locale>', 'language of the dashboard').choices(Object.keys(LOCALES)))
    .option('--page-size <rows>', 'rows per page in tables (default: 10)', (value: string) => Number(value))
    .option('--primary-color <color>', 'primary color of buttons and highlights, e.g. "#2563eb"')
    .option('--radius <size>', 'corner radius, e.g. "0.25rem" or "1rem"')
    .option('--no-dark-mode', 'leave out the light/dark switch')
    .option('--no-login', 'do not generate a login page even if the API has a sign-in endpoint')
    .option('--templates <module>', 'JS module exporting template overrides')
    .option('--no-clean', 'keep files from earlier runs that are no longer generated')
    .option('--no-format', 'skip Prettier formatting of the generated files')
    .option('-w, --watch', 'regenerate whenever the input file or the design file changes')
    .action(async (inputArg: string | undefined, outputArg: string | undefined, opts: CliOptions, command: Command) => {
        const configFile = opts.config ? path.resolve(opts.config) : CONFIG_FILES.map(name => path.resolve(name)).find(file => fs.existsSync(file));
        // Command-line flags win over the config file, which wins over the defaults
        const fromCli = (name: string) => command.getOptionValueSource(name) === 'cli';
        const resolveOptions = async (): Promise<GenerateOptions> => {
            const config = await loadConfig(opts.config);
            const pick = <K extends keyof CliOptions & keyof GenerateOptions>(name: K): GenerateOptions[K] =>
                (command.getOptionValueSource(name) === 'cli' || config[name] === undefined ? opts[name] : config[name]) as GenerateOptions[K];
            return {
                ...config,
                input: inputArg || config.input || './schema.yaml',
                output: opts.output || outputArg || config.output || './src',
                only: opts.only || config.only || TARGETS,
                router: pick('router'),
                baseUrl: pick('baseUrl'),
                prefix: pick('prefix'),
                groupBy: pick('groupBy'),
                zod: pick('zod'),
                envelope: pick('envelope'),
                login: pick('login'),
                ui: {
                    ...config.ui,
                    ...(fromCli('title') && { title: opts.title }),
                    ...(fromCli('locale') && { locale: opts.locale }),
                    ...(fromCli('pageSize') && { pageSize: opts.pageSize }),
                    ...(fromCli('primaryColor') && { primaryColor: opts.primaryColor }),
                    ...(fromCli('darkMode') && { darkModeToggle: opts.darkMode }),
                    ...(fromCli('radius') && { theme: { ...config.ui?.theme, radius: opts.radius } }),
                },
                templates: pick('templates'),
                clean: pick('clean'),
                format: pick('format'),
            };
        };
        const options = await resolveOptions();

        const report = ({ written, removed, warnings }: GenerateResult) => {
            warnings.forEach(warning => console.warn(`warning: ${warning}`));
            console.log(`Generated ${written.length} files in ${path.resolve(options.output ?? './src')}`);
            if (removed.length > 0) console.log(`Removed ${removed.length} stale files: ${removed.join(', ')}`);
        };

        if (opts.watch) {
            watch(options, {
                configFile,
                reload: resolveOptions,
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
        if ((options.only ?? TARGETS).includes('dashboard')) {
            console.log('\nThe dashboard uses shadcn/ui (Radix or Base UI). In your app, run:');
            console.log(`  npx shadcn@latest add ${SHADCN_COMPONENTS.join(' ')}`);
            console.log(`  npm install ${result.dependencies.join(' ')}`);
        }
    });

program
    .command('init')
    .description('write a starting design file (api-gen.config.yaml) from your OpenAPI document, to edit and then generate from')
    .argument('[input]', 'OpenAPI document: local path or URL (default: openapi.yaml/.yml/.json or schema.yaml in the current directory)')
    .option('-o, --output <dir>', 'output directory to record in the file', './src')
    .addOption(new Option('--router <router>', 'routing library to record in the file').choices(['react-router', 'next']).default('react-router'))
    .option('--file <name>', 'design file to write', 'api-gen.config.yaml')
    .option('-f, --force', 'overwrite the design file if it exists')
    .action(async (inputArg: string | undefined, opts: { output: string; router: string; file: string; force?: boolean }) => {
        const input = inputArg ?? findSpec();
        if (fs.existsSync(opts.file) && !opts.force) throw new Error(`${opts.file} already exists. Use --force to overwrite it.`);
        fs.writeFileSync(opts.file, await createDesignFile(input, { output: opts.output, router: opts.router }));
        console.log(`Wrote ${opts.file}. Edit labels, columns, fields and colors, then run: npx generate-api`);
    });

program
    .command('create')
    .description('create a new Vite + React + shadcn/ui admin app for your API, with the dashboard generated and a mock API to try it')
    .argument('<dir>', 'folder of the new app')
    .argument('[input]', 'OpenAPI document: local path or URL (default: openapi.yaml/.yml/.json or schema.yaml in the current directory)')
    .option('--example <name>', 'start from an example API and design shipped with the package: bookstore')
    .option('--no-install', 'only write the files; install the dependencies yourself')
    .option('-f, --force', 'write into a folder that is not empty')
    .action(async (dir: string, inputArg: string | undefined, opts: { example?: string; install: boolean; force?: boolean }) => {
        const example = opts.example ? exampleFiles(opts.example) : null;
        const input = example?.input ?? inputArg ?? findSpec();
        await createApp({ dir, input, design: example?.design, install: opts.install, force: opts.force });
        console.log(`\nDone. Next:\n  cd ${dir}${opts.install ? '' : '\n  npm install && npx shadcn@latest add ' + SHADCN_COMPONENTS.join(' ')}`);
        console.log('  npm run mock     # a mock API with fake data, in one terminal');
        console.log('  npm run dev      # the admin, in another');
        console.log('Edit api-gen.config.yaml, then run npm run generate (or npm run generate:watch).');
    });

program
    .command('mock')
    .description('serve a mock API with fake data from your OpenAPI document, to try the dashboard without a backend')
    .argument('[input]', 'OpenAPI document: local path or URL (default: from api-gen.config.yaml, else openapi.yaml/.json or schema.yaml)')
    .option('-p, --port <port>', 'port', (value: string) => Number(value), 4010)
    .option('--host <host>', 'host', 'localhost')
    .option('--rows <count>', 'records per resource', (value: string) => Number(value), 25)
    .option('--delay <ms>', 'wait before each response, to see loading states', (value: string) => Number(value), 0)
    .option('-q, --quiet', 'do not log requests')
    .action(async (inputArg: string | undefined, opts: { port: number; host: string; rows: number; delay: number; quiet?: boolean }) => {
        const config = inputArg ? {} : await loadConfig();
        const input = inputArg ?? config.input ?? findSpec();
        const mock = await startMockServer({
            input,
            port: opts.port,
            host: opts.host,
            rows: opts.rows,
            delay: opts.delay,
            prefix: config.prefix,
            groupBy: config.groupBy,
            envelope: config.envelope,
            log: opts.quiet ? undefined : line => console.log(line),
        });
        console.log(`Mock API for ${input} on ${mock.url} (any credentials sign in; data resets on restart)`);
    });

function findSpec(): string {
    const input = ['openapi.yaml', 'openapi.yml', 'openapi.json', 'schema.yaml', 'swagger.yaml', 'swagger.json'].find(name => fs.existsSync(name));
    if (!input) throw new Error('No OpenAPI document found. Pass its path or URL.');
    return input;
}

program.parseAsync(process.argv).catch((error: Error) => {
    console.error(`error: ${error.message}`);
    process.exitCode = 1;
});
