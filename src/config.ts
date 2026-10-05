// The config / design file: api-gen.config.yaml (or .yml, .json, .js, .mjs, .cjs)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Ajv, type ErrorObject } from 'ajv';
import YAML from 'yaml';
import { loadSpec, buildModels } from './spec.ts';
import { createTypeContext } from './generators/types.ts';
import { LOCALES } from './ui.ts';
import type { Field, Model } from './model.ts';
import type { GenerateOptions } from './generate.ts';

export const CONFIG_FILES = [
    'api-gen.config.yaml',
    'api-gen.config.yml',
    'api-gen.config.json',
    'api-gen.config.js',
    'api-gen.config.mjs',
    'api-gen.config.cjs',
];

export const SCHEMA_URL = 'https://unpkg.com/api-gen-package/config.schema.json';

export async function importModule(file: string): Promise<Record<string, unknown>> {
    const module = await import(pathToFileURL(path.resolve(file)).href);
    return (module.default ?? module) as Record<string, unknown>;
}

// config.schema.json sits next to package.json, one level above both src/ and dist/
function readSchema(): object {
    return JSON.parse(fs.readFileSync(new URL('../config.schema.json', import.meta.url), 'utf8'));
}

// Closest allowed name, to suggest "fields" for "feilds"
function closest(name: string, options: string[]): string | null {
    const distance = (a: string, b: string) => {
        const row = Array.from({ length: b.length + 1 }, (_, i) => i);
        for (let i = 1; i <= a.length; i++) {
            let previous = row[0];
            row[0] = i;
            for (let j = 1; j <= b.length; j++) {
                const current = row[j];
                row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
                previous = current;
            }
        }
        return row[b.length];
    };
    const ranked = options.map(option => ({ option, score: distance(name.toLowerCase(), option.toLowerCase()) })).sort((a, b) => a.score - b.score);
    return ranked[0] && ranked[0].score <= Math.max(2, Math.floor(name.length / 3)) ? ranked[0].option : null;
}

function describeConfigError(error: ErrorObject): string {
    const location = error.instancePath.split('/').slice(1).map(part => part.replace(/~1/g, '/').replace(/~0/g, '~')).join('.') || '(top level)';
    const params = error.params as Record<string, unknown>;
    switch (error.keyword) {
        case 'additionalProperties': {
            const name = String(params.additionalProperty);
            const allowed = Object.keys((error.parentSchema as { properties?: object } | undefined)?.properties ?? {});
            const suggestion = closest(name, allowed);
            const where = location === '(top level)' ? name : `${location}.${name}`;
            return `${where}: unknown option${suggestion ? ` (did you mean "${suggestion}"?)` : allowed.length > 0 ? `; options here: ${allowed.join(', ')}` : ''}`;
        }
        case 'enum':
            return `${location}: must be one of ${(params.allowedValues as unknown[]).map(value => JSON.stringify(value)).join(', ')}`;
        case 'type':
            return `${location}: must be ${String(params.type)}`;
        default:
            return `${location}: ${error.message}`;
    }
}

/** Check a config object against config.schema.json; throws one readable line per problem */
export function validateConfig(config: unknown, file = 'config'): void {
    const ajv = new Ajv({ allErrors: true, verbose: true, strict: false });
    const validate = ajv.compile(readSchema());
    if (validate(config)) return;
    // oneOf/const errors repeat the real problem reported by its branches
    const errors = (validate.errors ?? []).filter(error => !['oneOf', 'const', 'if'].includes(error.keyword));
    const lines = [...new Set((errors.length > 0 ? errors : validate.errors ?? []).map(describeConfigError))];
    throw new Error(`${path.basename(file)} is invalid:\n${lines.map(line => `  ${line}`).join('\n')}`);
}

/**
 * Read options from a config file. Without an explicit path, looks for api-gen.config.{yaml,yml,json,js,mjs,cjs}
 * in `cwd`. Relative paths inside the file (input, output, templates) are resolved against the file's folder.
 */
export async function loadConfig(configPath?: string, cwd = process.cwd()): Promise<Partial<GenerateOptions>> {
    let file = configPath ? path.resolve(cwd, configPath) : null;
    if (!file) {
        file = CONFIG_FILES.map(name => path.join(cwd, name)).find(candidate => fs.existsSync(candidate)) ?? null;
        if (!file) return {};
    }
    if (!fs.existsSync(file)) throw new Error(`Config file not found: ${file}`);

    let config: Partial<GenerateOptions>;
    if (/\.ya?ml$/i.test(file)) {
        try {
            config = (YAML.parse(fs.readFileSync(file, 'utf8')) ?? {}) as Partial<GenerateOptions>;
        } catch (error) {
            throw new Error(`${path.basename(file)} is not valid YAML: ${(error as Error).message}`);
        }
    } else if (file.endsWith('.json')) {
        config = JSON.parse(fs.readFileSync(file, 'utf8'));
    } else {
        config = (await importModule(file)) as Partial<GenerateOptions>;
    }
    // Functions (template overrides in a .js config) can't be described by the JSON schema
    if (typeof config.templates !== 'object' || config.templates === null) validateConfig(config, file);

    const dir = path.dirname(file);
    const resolveLocal = (value: string) => (/^https?:\/\//i.test(value) ? value : path.resolve(dir, value));
    const { $schema: _schema, ...options } = config as Partial<GenerateOptions> & { $schema?: string };
    return {
        ...options,
        ...(typeof config.input === 'string' && { input: resolveLocal(config.input) }),
        ...(typeof config.output === 'string' && { output: resolveLocal(config.output) }),
        ...(typeof config.templates === 'string' && { templates: resolveLocal(config.templates) }),
    };
}

const isListed = (field: Field) => !['object', 'unknown'].includes(field.type) && !(field.type === 'array' && field.items?.isObject);

function resourceDesign(model: Model, loginFields: Field[]): Record<string, unknown> {
    // The columns the dashboard would show by default, so editing the list is the only step
    const columns = model.columns.filter(field => isListed(field) && !field.writeOnly && !field.hidden.table).map(field => field.name);
    const fields: Record<string, { label: string }> = {};
    for (const field of [...model.columns, ...model.formFields, ...model.editFields, ...loginFields, ...model.actions.flatMap(action => action.fields ?? [])]) {
        if (!fields[field.name]) fields[field.name] = { label: field.label };
    }
    const actions = Object.fromEntries(model.actions.map(action => [action.op.operationId ?? action.op.functionName, { label: action.label }]));
    return {
        label: model.pluralLabel,
        singularLabel: model.singularLabel,
        ...(model.crud.list && columns.length > 0 ? { columns } : {}),
        fields,
        ...(model.actions.length > 0 ? { actions } : {}),
    };
}

/**
 * A starting design file for an OpenAPI document: every resource with its columns, fields and row actions,
 * labelled as the dashboard would label them. Written by `generate-api init`.
 */
export async function createDesignFile(input: string, options: { output?: string; router?: string; configDir?: string } = {}): Promise<string> {
    const api = await loadSpec(input);
    const context = createTypeContext(api);
    const { models, login } = buildModels(api, context);
    const dashboardModels = models.filter(model => model.crud.list);
    // Resources that show up somewhere: in the dashboard, or as the login form
    const designed = models.filter(model => model.crud.list || model.actions.length > 0 || login?.model.key === model.key);
    const relative = (value: string) =>
        /^https?:\/\//i.test(value) ? value : path.relative(options.configDir ?? process.cwd(), path.resolve(value)).split(path.sep).join('/') || '.';

    const doc = new YAML.Document({
        input: relative(input),
        output: relative(options.output ?? './src'),
        router: options.router ?? 'react-router',
        ui: {
            title: api.info?.title || 'Admin',
            locale: 'en',
            pageSize: 10,
            darkModeToggle: true,
            nav: dashboardModels.map(model => model.key),
            resources: Object.fromEntries(designed.map(model => [model.key, resourceDesign(model, login?.model.key === model.key ? login.fields : [])])),
        },
    });

    // Short lists and per-field options on one line each
    YAML.visit(doc, {
        Map(_, node, ancestors) {
            const keys = ancestors.filter(YAML.isPair).map(pair => String((pair.key as { value?: unknown })?.value ?? pair.key));
            if (keys.length === 5 && (keys[3] === 'fields' || keys[3] === 'actions')) node.flow = true;
        },
        Seq(_, node) {
            node.flow = true;
        },
    });

    const header = [
        `# yaml-language-server: $schema=${SCHEMA_URL}`,
        '#',
        '# Settings and design of the back-office generated by api-gen-package. Edit it, then run: npx generate-api',
        '# Every option: https://github.com/FNMALIC/api_gen#design-file-api-genconfigyaml',
        '#',
        '# More you can add under "ui":',
        `#   locale: ${Object.keys(LOCALES).join(' | ')}`,
        '#   primaryColor: "#2563eb"',
        '#   theme: { radius: 0.5rem, font: "Inter, sans-serif", colors: { destructive: "#dc2626" } }',
        '#   labels: { addNew: New }',
        '# Per resource: description, hidden: true, columns (order and choice)',
        '# Per field: label, hidden (true | table | form), order, help, placeholder, widget (textarea, password, email, url, date, datetime)',
        '# Per action: label, hidden: true',
        '',
    ];
    return header.join('\n') + doc.toString({ lineWidth: 0 });
}
