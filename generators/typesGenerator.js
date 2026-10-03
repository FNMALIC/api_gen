const { pascalCase, propertyKey } = require('../utils/helpers');

const SCHEMA_REF_PREFIX = '#/components/schemas/';

// Follow a local JSON pointer such as "#/components/parameters/Id"
function resolvePointer(api, ref) {
    if (!ref.startsWith('#/')) {
        throw new Error(`Unsupported $ref "${ref}": only local references are supported after bundling.`);
    }
    return ref
        .slice(2)
        .split('/')
        .map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'))
        .reduce((node, part) => (node === undefined ? undefined : node[part]), api);
}

// Follow $refs until reaching a concrete object (parameters, request bodies, responses, schemas)
function deref(api, node) {
    const seen = new Set();
    while (node && node.$ref) {
        if (seen.has(node.$ref)) throw new Error(`Circular $ref "${node.$ref}"`);
        seen.add(node.$ref);
        node = resolvePointer(api, node.$ref);
    }
    return node;
}

// Maps component schema names to unique, valid TypeScript type names
function createTypeContext(api) {
    const schemas = (api.components && api.components.schemas) || {};
    const typeNames = {};
    const taken = new Set();
    for (const name of Object.keys(schemas)) {
        let typeName = pascalCase(name);
        let suffix = 2;
        while (taken.has(typeName)) typeName = `${pascalCase(name)}${suffix++}`;
        taken.add(typeName);
        typeNames[name] = typeName;
    }

    function refTypeName(ref) {
        if (!ref.startsWith(SCHEMA_REF_PREFIX)) return null;
        const name = ref.slice(SCHEMA_REF_PREFIX.length).replace(/~1/g, '/').replace(/~0/g, '~');
        return typeNames[name] || null;
    }

    // Convert a schema into a TypeScript type expression. Referenced type names are added to `used`.
    function tsType(schema, used = new Set()) {
        if (!schema) return 'unknown';
        if (schema.$ref) {
            const name = refTypeName(schema.$ref);
            if (name) {
                used.add(name);
                return name;
            }
            return tsType(deref(api, schema), used);
        }

        const wrap = type => (/[|&]/.test(type) ? `(${type})` : type);
        let type;
        let nullable = !!schema.nullable;

        if (schema.const !== undefined) {
            type = JSON.stringify(schema.const);
        } else if (schema.enum) {
            type = schema.enum.map(value => (value === null ? 'null' : JSON.stringify(value))).join(' | ');
        } else if (schema.allOf) {
            type = schema.allOf.map(part => wrap(tsType(part, used))).join(' & ');
        } else if (schema.oneOf || schema.anyOf) {
            type = (schema.oneOf || schema.anyOf).map(part => wrap(tsType(part, used))).join(' | ');
        } else {
            // OpenAPI 3.1 allows type arrays such as ["string", "null"]
            let types = Array.isArray(schema.type) ? schema.type : [schema.type];
            if (types.includes('null')) {
                nullable = true;
                types = types.filter(t => t !== 'null');
            }
            if (types.length === 0 && schema.type === undefined) types = [undefined];
            const parts = types.map(t => scalarType(schema, t, used));
            type = parts.length > 1 ? parts.map(wrap).join(' | ') : parts[0] || 'null';
        }

        return nullable && type !== 'null' ? `${type} | null` : type;
    }

    function scalarType(schema, type, used) {
        switch (type) {
            case 'integer':
            case 'number':
                return 'number';
            case 'boolean':
                return 'boolean';
            case 'string':
                return schema.format === 'binary' ? 'Blob' : 'string';
            case 'array': {
                const items = tsType(schema.items, used);
                return `${/[|&]/.test(items) ? `(${items})` : items}[]`;
            }
            case 'object':
                return objectType(schema, used);
            default:
                return schema.properties || schema.additionalProperties ? objectType(schema, used) : 'unknown';
        }
    }

    function objectType(schema, used) {
        const required = schema.required || [];
        const members = Object.entries(schema.properties || {}).map(([name, prop]) => {
            const optional = required.includes(name) ? '' : '?';
            const doc = prop && prop.description ? `/** ${String(prop.description).replace(/\*\//g, '*\\/')} */\n` : '';
            return `${doc}${propertyKey(name)}${optional}: ${tsType(prop, used)};`;
        });
        if (schema.additionalProperties) {
            const valueType = schema.additionalProperties === true ? 'unknown' : tsType(schema.additionalProperties, used);
            if (members.length === 0) return `Record<string, ${valueType}>`;
            // Named properties must fit the index signature, so it has to stay open
            members.push('[key: string]: unknown;');
        }
        if (members.length === 0) return 'Record<string, unknown>';
        return `{\n${members.join('\n')}\n}`;
    }

    return { typeNames, refTypeName, tsType, deref: node => deref(api, node) };
}

// types/index.ts: one exported type per component schema
function generateTypes(api, context) {
    const schemas = (api.components && api.components.schemas) || {};
    const declarations = Object.entries(schemas).map(([name, schema]) => {
        const typeName = context.typeNames[name];
        const doc = schema.description ? `/** ${String(schema.description).replace(/\*\//g, '*\\/')} */\n` : '';
        const type = context.tsType(schema);
        // Plain object schemas become interfaces; everything else (unions, enums, intersections) a type alias
        if (type.startsWith('{') && !schema.nullable && !(Array.isArray(schema.type) && schema.type.includes('null'))) {
            return `${doc}export interface ${typeName} ${type}`;
        }
        return `${doc}export type ${typeName} = ${type};`;
    });

    if (declarations.length === 0) {
        declarations.push('export {};');
    }
    return { 'types/index.ts': declarations.join('\n\n') + '\n' };
}

module.exports = {
    createTypeContext,
    generateTypes,
    deref,
};
