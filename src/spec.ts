import SwaggerParser from '@apidevtools/swagger-parser';
import { camelCase, pascalCase, kebabCase, safeIdentifier, humanize, singularize, pluralize } from './helpers.ts';
import { HTTP_METHODS } from './model.ts';
import type {
    CrudAction,
    Field,
    HttpMethod,
    ListCapabilities,
    MediaTypeObject,
    Model,
    OpenAPIDocument,
    Operation,
    OperationObject,
    Param,
    ParameterObject,
    PathItemObject,
    RequestBody,
    SchemaObject,
} from './model.ts';
import type { TypeContext } from './generators/types.ts';
const AUTO_PREFIX_SEGMENT = /^(api|v\d+(\.\d+)*)$/i;

/**
 * Load a local file or URL (YAML or JSON), keep internal $refs so type names survive, and validate it.
 * Swagger 2.0 documents are converted to OpenAPI 3.
 */
export async function loadSpec(input: string): Promise<OpenAPIDocument> {
    let api = (await SwaggerParser.bundle(input)) as OpenAPIDocument;
    if (api.swagger) {
        const { default: converter } = await import('swagger2openapi');
        const converted = await converter.convertObj(api, { patch: true, warnOnly: true });
        api = converted.openapi as OpenAPIDocument;
    }
    await SwaggerParser.validate(JSON.parse(JSON.stringify(api)));
    return api;
}

const isParamSegment = (segment: string) => /^\{[^}]+\}$/.test(segment);

// Split a path into its prefix (e.g. /api/v1) and the remaining resource segments
export interface PrefixSplit {
    prefixSegments: string[];
    rest: string[];
}

export function splitPrefix(path: string, prefix?: string): PrefixSplit | null {
    const segments = path.split('/').filter(Boolean);
    if (prefix !== undefined) {
        const prefixSegments = prefix.split('/').filter(Boolean);
        const matches = prefixSegments.every((segment, index) => segments[index] === segment);
        return matches ? { prefixSegments, rest: segments.slice(prefixSegments.length) } : null;
    }
    let index = 0;
    while (index < segments.length - 1 && AUTO_PREFIX_SEGMENT.test(segments[index])) index++;
    return { prefixSegments: segments.slice(0, index), rest: segments.slice(index) };
}

function preferredMedia(content: Record<string, MediaTypeObject> | undefined): { contentType: string; schema?: SchemaObject } | null {
    if (!content) return null;
    const types = Object.keys(content);
    const type = types.find(t => /json/i.test(t)) || types[0];
    return type ? { contentType: type, schema: content[type].schema } : null;
}

// Security alternatives for an operation: [["bearerAuth"], ["apiKey"]] means bearer OR api key; [] means public
function securityFor(api: OpenAPIDocument, operation: OperationObject): string[][] {
    const requirements = operation.security !== undefined ? operation.security : api.security || [];
    return requirements.map(requirement => Object.keys(requirement));
}

interface Entry {
    path: string;
    pathItem: PathItemObject;
    method: HttpMethod;
    operation: OperationObject;
    split: PrefixSplit | null;
}

function buildOperation(api: OpenAPIDocument, context: TypeContext, entry: Entry, envelopeOption: EnvelopeOption): Operation {
    const { path, method, operation } = entry;

    // Path-level parameters apply unless the operation overrides them
    const params: Record<string, ParameterObject> = {};
    for (const param of [...(entry.pathItem.parameters || []), ...(operation.parameters || [])]) {
        const resolved = context.deref(param);
        if (!resolved) continue;
        params[`${resolved.in}:${resolved.name}`] = resolved;
    }
    const all = Object.values(params);
    const pathParams = all
        .filter(param => param.in === 'path')
        .sort((a, b) => path.indexOf(`{${a.name}}`) - path.indexOf(`{${b.name}}`))
        .map(param => ({
            name: param.name,
            identifier: safeIdentifier(param.name),
            schema: param.schema,
            isNumber: ['integer', 'number'].includes(String(context.deref(param.schema)?.type)),
        }));
    const toParam = (param: ParameterObject): Param => ({
        name: param.name,
        required: !!param.required,
        schema: param.schema,
        description: param.description,
    });
    const queryParams = all.filter(param => param.in === 'query').map(toParam);
    const headerParams = all.filter(param => param.in === 'header').map(toParam);

    let body: RequestBody | null = null;
    if (operation.requestBody) {
        const requestBody = context.deref(operation.requestBody);
        const media = preferredMedia(requestBody?.content);
        if (media) {
            body = { ...media, required: !!requestBody?.required, multipart: /multipart\/form-data/i.test(media.contentType) };
        }
    }

    let responseSchema: SchemaObject | null = null;
    let responseIsJson = false;
    const responses = operation.responses || {};
    const successCode = Object.keys(responses)
        .filter(code => /^2/.test(code))
        .sort()
        .find(code => preferredMedia(context.deref(responses[code])?.content));
    const media = successCode ? preferredMedia(context.deref(responses[successCode])?.content) : null;
    if (media) {
        responseSchema = media.schema || null;
        responseIsJson = /json/i.test(media.contentType);
    }

    // { success, data: User } -> return the User. Lists keep their envelope so totals in "meta" stay reachable,
    // and status-only bodies ({ success, message }) are returned as they are; both still fail on success: false.
    const detected = responseIsJson ? detectEnvelope(context, responseSchema, envelopeOption) : null;
    const unwrapped = detected?.schema && schemaType(context.deref(detected.schema) || {}) !== 'array' ? detected : null;

    return {
        method,
        path,
        operationId: operation.operationId,
        summary: operation.summary,
        description: operation.description,
        deprecated: !!operation.deprecated,
        security: securityFor(api, operation),
        pathParams,
        queryParams,
        headerParams,
        body,
        responseSchema,
        responseIsJson,
        envelope: detected ? { key: unwrapped ? detected.key : null } : null,
        returnSchema: unwrapped?.schema ?? responseSchema,
        crud: null,
        functionName: '',
    };
}

// Decide which operation backs each CRUD action of a model
function classifyCrud(model: Model): Model['crud'] {
    const itemPattern = new RegExp(`^${model.basePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/\\{[^}/]+\\}$`);
    const candidates: Record<CrudAction, Operation[]> = { list: [], create: [], retrieve: [], update: [], delete: [] };
    const required = (params: Param[]) => params.some(param => param.required);

    for (const op of model.operations) {
        if (required(op.queryParams) || required(op.headerParams)) continue;
        if (op.path === model.basePath && op.pathParams.length === 0) {
            if (op.method === 'get') candidates.list.push(op);
            if (op.method === 'post' && op.body) candidates.create.push(op);
        } else if (itemPattern.test(op.path) && op.pathParams.length === 1) {
            if (op.method === 'get') candidates.retrieve.push(op);
            if ((op.method === 'put' || op.method === 'patch') && op.body) candidates.update.push(op);
            if (op.method === 'delete' && !(op.body && op.body.required)) candidates.delete.push(op);
        }
    }
    // PUT replaces the whole resource, which is what the edit form submits
    candidates.update.sort((a, b) => (a.method === 'put' ? -1 : 0) - (b.method === 'put' ? -1 : 0));

    const crud: Model['crud'] = {};
    for (const [action, ops] of Object.entries(candidates) as Array<[CrudAction, Operation[]]>) {
        if (ops.length > 0) {
            crud[action] = ops[0];
            ops[0].crud = action;
        }
    }
    return crud;
}

function functionNameFor(op: Operation, model: Model): string {
    if (op.operationId) {
        const name = camelCase(op.operationId);
        // Bare verbs get the resource name: list -> listUsers, delete -> deleteUser
        if (/^[a-z]+$/.test(name)) return `${name}${op.crud === 'list' || name === 'list' ? model.Plural : model.Singular}`;
        return name;
    }
    switch (op.crud) {
        case 'list': return `list${model.Plural}`;
        case 'retrieve': return `get${model.Singular}`;
        case 'create': return `create${model.Singular}`;
        case 'update': return `update${model.Singular}`;
        case 'delete': return `delete${model.Singular}`;
        default: {
            const parts = op.path
                .split('/')
                .filter(Boolean)
                .map(segment => (isParamSegment(segment) ? `By${pascalCase(segment.slice(1, -1))}` : pascalCase(segment)));
            return camelCase(`${op.method} ${parts.join(' ')}`);
        }
    }
}

// Resolve an object-like schema into { properties, required }, following $refs, allOf and arrays
interface ResolvedObject {
    properties: Record<string, SchemaObject>;
    required: string[];
}

function resolveObject(
    context: TypeContext,
    rawSchema: SchemaObject | null | undefined,
    { unwrapList = false }: { unwrapList?: boolean } = {}
): ResolvedObject | null {
    const schema = context.deref(rawSchema);
    if (!schema) return null;
    if (schema.type === 'array') return resolveObject(context, schema.items);
    if (schema.allOf) {
        const merged: ResolvedObject = { properties: {}, required: [] };
        for (const part of schema.allOf) {
            const resolved = resolveObject(context, part);
            if (resolved) {
                Object.assign(merged.properties, resolved.properties);
                merged.required.push(...resolved.required);
            }
        }
        return Object.keys(merged.properties).length > 0 ? merged : null;
    }
    if (!schema.properties) return null;

    if (unwrapList) {
        // Paginated responses such as { data: [...], total: 10 } or { success, data: { items: [...] } } -> the item schema
        const items = findListItems(context, schema, 0);
        if (items) {
            const resolved = resolveObject(context, items);
            if (resolved) return resolved;
        }
    }
    return { properties: schema.properties, required: schema.required || [] };
}

// The item schema of the first array property, looking one object level deep
function findListItems(context: TypeContext, schema: SchemaObject, depth: number): SchemaObject | null {
    const properties = Object.values(schema.properties ?? {}).map(prop => context.deref(prop)).filter(prop => !!prop);
    const list = properties.find(prop => schemaType(prop) === 'array' && prop.items);
    if (list) return list.items ?? null;
    if (depth >= 1) return null;
    for (const prop of properties) {
        const nested = schemaType(prop) === 'object' ? resolveObject(context, prop) : null;
        const items = nested ? findListItems(context, { properties: nested.properties }, depth + 1) : null;
        if (items) return items;
    }
    return null;
}

/** "auto" (default): detect { success, data } style envelopes; a string: the payload property; false: never unwrap */
export type EnvelopeOption = string | false | undefined;

const ENVELOPE_KEYS = ['data', 'result', 'payload'];
const ENVELOPE_METADATA = new Set([
    'success', 'ok', 'status', 'statuscode', 'status_code', 'code', 'message', 'messages', 'error', 'errors',
    'meta', 'metadata', 'timestamp', 'links', 'pagination', 'requestid', 'request_id', 'traceid', 'trace_id',
]);

/**
 * A response that wraps its payload: { success: true, data: {...} }.
 * Auto-detection requires every other property to be metadata, so a resource that merely has its own "data"
 * field ({ id, name, data }) is left alone.
 */
function detectEnvelope(
    context: TypeContext,
    schema: SchemaObject | null,
    option: EnvelopeOption
): { key: string | null; schema: SchemaObject | null } | null {
    if (option === false || !schema) return null;
    const raw = context.deref(schema);
    if (!raw || schemaType(raw) === 'array') return null;
    const resolved = resolveObject(context, raw);
    if (!resolved) return null;
    const keys = Object.keys(resolved.properties);
    if (typeof option === 'string') {
        return keys.includes(option) ? { key: option, schema: resolved.properties[option] } : null;
    }
    const key = keys.find(name => ENVELOPE_KEYS.includes(name)) ?? null;
    if (!keys.every(name => name === key || ENVELOPE_METADATA.has(name.toLowerCase()))) return null;
    // Without a payload key it is a status-only body; it counts only if it reports success/ok
    if (!key && !keys.some(name => ['success', 'ok'].includes(name.toLowerCase()))) return null;
    return { key, schema: key ? resolved.properties[key] : null };
}

function schemaType(prop: SchemaObject): string {
    let type = Array.isArray(prop.type) ? prop.type.find(t => t !== 'null') : prop.type;
    if (!type && (prop.properties || prop.allOf || prop.additionalProperties)) type = 'object';
    if (!type && prop.enum) type = 'string';
    return type || 'unknown';
}

function hiddenFlags(prop: SchemaObject): Field['hidden'] {
    const value = prop['x-hidden'];
    return { table: value === true || value === 'table', form: value === true || value === 'form' };
}

function toFields(context: TypeContext, resolved: ResolvedObject | null, depth = 0): Field[] | null {
    if (!resolved) return null;
    const fields = Object.entries(resolved.properties).map(([name, rawProp], index) => {
        const prop: SchemaObject = context.deref(rawProp) || {};
        // allOf with a single $ref is a common way to attach nullable/description to a reference
        const base: SchemaObject = prop.allOf && prop.allOf.length === 1 ? { ...context.deref(prop.allOf[0]), ...prop, allOf: undefined } : prop;
        const type = schemaType(base);
        const field: Field = {
            name,
            label: typeof base['x-label'] === 'string' ? base['x-label'] : humanize(name),
            hidden: hiddenFlags(base),
            order: typeof base['x-order'] === 'number' ? base['x-order'] : 1000 + index,
            type,
            format: base.format,
            enum: base.enum && base.enum.filter(value => value !== null),
            readOnly: !!base.readOnly,
            writeOnly: !!base.writeOnly,
            nullable: !!base.nullable || (Array.isArray(base.type) && base.type.includes('null')),
            required: resolved.required.includes(name),
            description: base.description,
        };
        if (type === 'array') {
            const items: SchemaObject = context.deref(base.items) || {};
            field.items = { type: schemaType(items), format: items.format, enum: items.enum, isObject: !!resolveObject(context, items) };
        }
        if (type === 'object') {
            const nested = resolveObject(context, base);
            field.isMap = !nested;
            if (nested && depth < 2) field.properties = toFields(context, nested, depth + 1) ?? undefined;
        }
        return field;
    });
    return fields.sort((a, b) => a.order - b.order);
}

type Candidate = [SchemaObject | null | undefined | false, { unwrapList?: boolean }?];

function firstFields(context: TypeContext, candidates: Candidate[]): Field[] {
    for (const [schema, options] of candidates) {
        if (!schema) continue;
        const fields = toFields(context, resolveObject(context, schema, options ?? {}));
        if (fields && fields.length > 0) return fields;
    }
    return [];
}

const PARAM_NAMES: Record<'page' | 'offset' | 'size' | 'search' | 'sort' | 'direction', string[]> = {
    page: ['page', 'pagenumber', 'page_number', 'pageindex', 'page_index'],
    offset: ['offset', 'skip', 'start'],
    size: ['limit', 'pagesize', 'page_size', 'perpage', 'per_page', 'size', 'take'],
    search: ['search', 'q', 'query', 'keyword', 'term', 'searchterm', 'search_term'],
    sort: ['sort', 'sortby', 'sort_by', 'orderby', 'order_by', 'ordering'],
    direction: ['order', 'sortorder', 'sort_order', 'direction', 'dir', 'sortdir', 'sort_dir'],
};
// "asc"/"desc" unless the parameter's enum spells them differently (ASC, ascending, ...)
function directionValues(context: TypeContext, param: Param): { name: string; asc: string; desc: string } {
    const values = ((context.deref(param.schema) || {}).enum || []).map(String);
    return {
        name: param.name,
        asc: values.find(value => /^asc/i.test(value)) || 'asc',
        desc: values.find(value => /^desc/i.test(value)) || 'desc',
    };
}

const TOTAL_NAMES = ['total', 'totalcount', 'total_count', 'count', 'totalitems', 'total_items', 'totalelements', 'totalresults'];

// Which pagination/search/sort query parameters the list endpoint understands, and where the total lives
function listCapabilities(context: TypeContext, list: Operation | undefined): ListCapabilities | null {
    if (!list) return null;
    const find = (kind: keyof typeof PARAM_NAMES) => list.queryParams.find(param => PARAM_NAMES[kind].includes(param.name.toLowerCase())) || null;
    const page = find('page');
    const offset = page ? null : find('offset');
    const size = find('size');
    const sort = find('sort');
    const search = find('search');
    const direction = sort ? find('direction') : null;

    let pageBase: 0 | 1 = 1;
    if (page) {
        const schema = context.deref(page.schema) || {};
        if (schema.minimum === 0 || schema.default === 0) pageBase = 0;
    }


    const serverPaging = !!((page || offset) && size);
    return {
        serverPaging,
        page: serverPaging && page ? { name: page.name, base: pageBase } : null,
        offset: serverPaging && offset ? { name: offset.name } : null,
        size: serverPaging && size ? { name: size.name } : null,
        search: search ? { name: search.name } : null,
        sort: sort ? { name: sort.name, direction: direction ? directionValues(context, direction) : null } : null,
        totalPath: findTotalPath(context, list.returnSchema, 0),
    };
}

// Where the total count is: { total }, { meta: { total } }, { data: { items, totalCount } }, ...
function findTotalPath(context: TypeContext, schema: SchemaObject | null | undefined, depth: number): string[] | null {
    const raw = context.deref(schema);
    if (!raw || schemaType(raw) === 'array') return null;
    const resolved = resolveObject(context, raw);
    if (!resolved) return null;
    const entries = Object.entries(resolved.properties).map(([key, prop]) => [key, context.deref(prop) || {}] as const);
    const total = entries.find(([key, prop]) => TOTAL_NAMES.includes(key.toLowerCase()) && ['integer', 'number'].includes(schemaType(prop)));
    if (total) return [total[0]];
    if (depth >= 2) return null;
    for (const [key, prop] of entries) {
        if (schemaType(prop) !== 'object') continue;
        const nested = findTotalPath(context, prop, depth + 1);
        if (nested) return [key, ...nested];
    }
    return null;
}

/**
 * Group operations into models.
 * groupBy "path": by the first path segment after the prefix (/api/v1/users/{id} -> users)
 * groupBy "tag": by the operation's first tag
 */
export function buildModels(
    api: OpenAPIDocument,
    context: TypeContext,
    { prefix, groupBy = 'path', envelope }: { prefix?: string; groupBy?: 'path' | 'tag'; envelope?: EnvelopeOption } = {}
): { models: Model[]; skipped: string[] } {
    const groups = new Map<string, Entry[]>();
    const skipped: string[] = [];

    for (const [path, pathItem] of Object.entries(api.paths || {})) {
        for (const method of HTTP_METHODS) {
            const operation = pathItem[method];
            if (!operation) continue;

            const split = splitPrefix(path, prefix);
            let key: string | undefined;
            if (groupBy === 'tag') {
                key = (operation.tags && operation.tags[0]) || 'default';
            } else if (split && split.rest.length > 0 && !isParamSegment(split.rest[0])) {
                key = split.rest[0];
            }
            if (!key) {
                skipped.push(`${method.toUpperCase()} ${path}`);
                continue;
            }
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push({ path, pathItem, method, operation, split });
        }
    }

    const models: Model[] = [];
    for (const [key, entries] of groups) {
        const singular = singularize(key);
        const plural = pluralize(key);
        const model: Model = {
            key,
            name: safeIdentifier(key),
            slug: kebabCase(key) || 'default',
            Singular: pascalCase(singular),
            Plural: pascalCase(plural),
            singularLabel: humanize(singular),
            pluralLabel: humanize(plural),
            PluralOrList: '',
            basePath: '',
            operations: [],
            crud: {},
            formFields: [],
            columns: [],
            listCapabilities: null,
        };
        // Uncountable names (health, data) would otherwise give identical singular and plural identifiers
        model.PluralOrList = model.Plural === model.Singular ? `${model.Plural}List` : model.Plural;

        if (groupBy === 'tag') {
            // The shortest path not ending in a parameter is the collection, e.g. /users for /users/{id}
            const collections = entries
                .map(entry => entry.path.replace(/\/\{[^}/]+\}$/, ''))
                .sort((a, b) => a.split('/').length - b.split('/').length);
            model.basePath = collections[0];
        } else {
            const { prefixSegments, rest } = entries[0].split as PrefixSplit;
            model.basePath = '/' + [...prefixSegments, rest[0]].join('/');
        }

        model.operations = entries.map(entry => buildOperation(api, context, entry, envelope));
        model.crud = classifyCrud(model);

        const usedNames = new Set();
        for (const op of model.operations) {
            let functionName = functionNameFor(op, model);
            let suffix = 2;
            while (usedNames.has(functionName)) functionName = `${functionNameFor(op, model)}${suffix++}`;
            usedNames.add(functionName);
            op.functionName = functionName;
        }

        const { list, retrieve, create, update } = model.crud;
        model.formFields = firstFields(context, [
            [create && create.body && create.body.schema],
            [update && update.body && update.body.schema],
            [retrieve && retrieve.returnSchema],
            [list && list.returnSchema, { unwrapList: true }],
        ]);
        model.columns = firstFields(context, [
            [list && list.returnSchema, { unwrapList: true }],
            [retrieve && retrieve.returnSchema],
            [create && create.body && create.body.schema],
        ]);
        model.listCapabilities = listCapabilities(context, list);

        models.push(model);
    }

    return { models, skipped };
}

