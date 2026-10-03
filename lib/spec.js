const SwaggerParser = require('@apidevtools/swagger-parser');
const { camelCase, pascalCase, kebabCase, safeIdentifier } = require('../utils/helpers');

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
const AUTO_PREFIX_SEGMENT = /^(api|v\d+(\.\d+)*)$/i;

// Load a local file or URL (YAML or JSON), keep internal $refs so type names survive, and validate it
async function loadSpec(input) {
    const api = await SwaggerParser.bundle(input);
    await SwaggerParser.validate(JSON.parse(JSON.stringify(api)));
    if (!api.openapi) {
        throw new Error(
            'Only OpenAPI 3.x documents are supported. Convert Swagger 2.0 specs first, e.g. with https://converter.swagger.io'
        );
    }
    return api;
}

const isParamSegment = segment => /^\{[^}]+\}$/.test(segment);

// Split a path into its prefix (e.g. /api/v1) and the remaining resource segments
function splitPrefix(path, prefix) {
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

function preferredMedia(content) {
    if (!content) return null;
    const types = Object.keys(content);
    const type = types.find(t => /json/i.test(t)) || types[0];
    return type ? { contentType: type, schema: content[type].schema } : null;
}

function buildOperation(api, context, entry) {
    const { path, method, operation } = entry;

    // Path-level parameters apply unless the operation overrides them
    const params = {};
    for (const param of [...(entry.pathItem.parameters || []), ...(operation.parameters || [])]) {
        const resolved = context.deref(param);
        params[`${resolved.in}:${resolved.name}`] = resolved;
    }
    const pathParams = Object.values(params)
        .filter(param => param.in === 'path')
        .sort((a, b) => path.indexOf(`{${a.name}}`) - path.indexOf(`{${b.name}}`))
        .map(param => ({
            name: param.name,
            identifier: safeIdentifier(param.name),
            schema: param.schema,
            isNumber: ['integer', 'number'].includes(((param.schema && context.deref(param.schema)) || {}).type),
        }));
    const queryParams = Object.values(params)
        .filter(param => param.in === 'query')
        .map(param => ({ name: param.name, required: !!param.required, schema: param.schema, description: param.description }));

    let body = null;
    if (operation.requestBody) {
        const requestBody = context.deref(operation.requestBody);
        const media = preferredMedia(requestBody.content);
        if (media) body = { ...media, required: !!requestBody.required };
    }

    let responseSchema = null;
    const responses = operation.responses || {};
    const successCode = Object.keys(responses)
        .filter(code => /^2/.test(code))
        .sort()
        .find(code => preferredMedia(context.deref(responses[code]).content));
    if (successCode) {
        responseSchema = preferredMedia(context.deref(responses[successCode]).content).schema || null;
    }

    return {
        method,
        path,
        operationId: operation.operationId,
        summary: operation.summary,
        description: operation.description,
        deprecated: !!operation.deprecated,
        pathParams,
        queryParams,
        body,
        responseSchema,
        crud: null,
    };
}

// Decide which operation backs each CRUD action of a model
function classifyCrud(model) {
    const itemPattern = new RegExp(`^${model.basePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/\\{[^}/]+\\}$`);
    const candidates = { list: [], create: [], retrieve: [], update: [], delete: [] };

    for (const op of model.operations) {
        const requiredQuery = op.queryParams.some(param => param.required);
        if (requiredQuery) continue;
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

    const crud = {};
    for (const [action, ops] of Object.entries(candidates)) {
        if (ops.length > 0) {
            crud[action] = ops[0];
            ops[0].crud = action;
        }
    }
    return crud;
}

function functionNameFor(op, model) {
    if (op.operationId) {
        const name = camelCase(op.operationId);
        // Bare verbs such as "list" or "delete" get the model name appended: listUsers, deleteUsers
        return /^[a-z]+$/.test(name) ? `${name}${model.Name}` : name;
    }
    switch (op.crud) {
        case 'list': return `list${model.Name}`;
        case 'retrieve': return `get${model.Name}ById`;
        case 'create': return `create${model.Name}`;
        case 'update': return `update${model.Name}`;
        case 'delete': return `delete${model.Name}`;
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
function resolveObject(context, schema, { unwrapList = false } = {}) {
    schema = context.deref(schema);
    if (!schema) return null;
    if (schema.type === 'array') return resolveObject(context, schema.items);
    if (schema.allOf) {
        const merged = { properties: {}, required: [] };
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
        // Paginated responses such as { data: [...], total: 10 } -> the item schema
        const listProperty = Object.values(schema.properties)
            .map(prop => context.deref(prop))
            .find(prop => prop && prop.type === 'array');
        if (listProperty) {
            const items = resolveObject(context, listProperty.items);
            if (items) return items;
        }
    }
    return { properties: schema.properties, required: schema.required || [] };
}

function toFields(context, resolved) {
    if (!resolved) return null;
    return Object.entries(resolved.properties).map(([name, rawProp]) => {
        const prop = context.deref(rawProp) || {};
        let type = Array.isArray(prop.type) ? prop.type.find(t => t !== 'null') : prop.type;
        if (!type && (prop.properties || prop.allOf)) type = 'object';
        return {
            name,
            type: type || (prop.enum ? 'string' : 'unknown'),
            format: prop.format,
            enum: prop.enum && prop.enum.filter(value => value !== null),
            readOnly: !!prop.readOnly,
            nullable: !!prop.nullable || (Array.isArray(prop.type) && prop.type.includes('null')),
            required: resolved.required.includes(name),
        };
    });
}

function firstFields(context, candidates) {
    for (const [schema, options] of candidates) {
        if (!schema) continue;
        const fields = toFields(context, resolveObject(context, schema, options));
        if (fields && fields.length > 0) return fields;
    }
    return [];
}

/**
 * Group operations into models.
 * groupBy "path": by the first path segment after the prefix (/api/v1/users/{id} -> users)
 * groupBy "tag": by the operation's first tag
 */
function buildModels(api, context, { prefix, groupBy = 'path' } = {}) {
    const groups = new Map();
    const skipped = [];

    for (const [path, pathItem] of Object.entries(api.paths || {})) {
        for (const method of HTTP_METHODS) {
            const operation = pathItem[method];
            if (!operation) continue;

            const split = splitPrefix(path, prefix);
            let key;
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
            groups.get(key).push({ path, pathItem, method, operation, split });
        }
    }

    const models = [];
    for (const [key, entries] of groups) {
        const model = {
            key,
            name: safeIdentifier(key),
            Name: pascalCase(key),
            slug: kebabCase(key) || 'default',
            basePath: '',
            operations: [],
            crud: {},
        };

        if (groupBy === 'tag') {
            // The shortest path not ending in a parameter is the collection, e.g. /users for /users/{id}
            const collections = entries
                .map(entry => entry.path.replace(/\/\{[^}/]+\}$/, ''))
                .sort((a, b) => a.split('/').length - b.split('/').length);
            model.basePath = collections[0];
        } else {
            const { prefixSegments, rest } = entries[0].split;
            model.basePath = '/' + [...prefixSegments, rest[0]].join('/');
        }

        model.operations = entries.map(entry => buildOperation(api, context, entry));
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
            [retrieve && retrieve.responseSchema],
            [list && list.responseSchema, { unwrapList: true }],
        ]);
        model.columns = firstFields(context, [
            [list && list.responseSchema, { unwrapList: true }],
            [retrieve && retrieve.responseSchema],
            [create && create.body && create.body.schema],
        ]);
        // List data variable returned by the hook: users -> users, user -> users
        model.listVar = model.name.endsWith('s') ? model.name : `${model.name}s`;

        models.push(model);
    }

    return { models, skipped };
}

module.exports = {
    loadSpec,
    buildModels,
    splitPrefix,
};
