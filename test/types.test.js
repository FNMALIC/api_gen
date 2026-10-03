const test = require('node:test');
const assert = require('node:assert/strict');
const { createTypeContext, generateTypes } = require('../generators/typesGenerator');

const api = {
    components: {
        schemas: {
            'user-dto': { type: 'object', required: ['id'], properties: { id: { type: 'integer' }, 'first-name': { type: 'string' } } },
            Status: { type: 'string', enum: ['on', 'off'] },
            Page: { type: ['object', 'null'], properties: { total: { type: 'integer' } } },
        },
    },
};
const { tsType, typeNames } = createTypeContext(api);
const t = schema => tsType(schema).replace(/\s+/g, ' ');

test('maps primitive types', () => {
    assert.equal(t({ type: 'integer' }), 'number');
    assert.equal(t({ type: 'number' }), 'number');
    assert.equal(t({ type: 'boolean' }), 'boolean');
    assert.equal(t({ type: 'string' }), 'string');
    assert.equal(t({ type: 'string', format: 'binary' }), 'Blob');
    assert.equal(t(undefined), 'unknown');
});

test('maps enums, nullability and OpenAPI 3.1 type arrays', () => {
    assert.equal(t({ type: 'string', enum: ['a', 'b'] }), '"a" | "b"');
    assert.equal(t({ type: 'string', nullable: true }), 'string | null');
    assert.equal(t({ type: ['string', 'null'] }), 'string | null');
    assert.equal(t({ type: ['string', 'integer'] }), 'string | number');
});

test('maps arrays, compositions and maps', () => {
    assert.equal(t({ type: 'array', items: { type: 'string' } }), 'string[]');
    assert.equal(t({ type: 'array', items: { oneOf: [{ type: 'string' }, { type: 'integer' }] } }), '(string | number)[]');
    assert.equal(t({ allOf: [{ $ref: '#/components/schemas/Status' }, { type: 'object', properties: { x: { type: 'string' } } }] }), 'Status & { x?: string; }');
    assert.equal(t({ type: 'object', additionalProperties: { type: 'integer' } }), 'Record<string, number>');
    assert.equal(t({ type: 'object' }), 'Record<string, unknown>');
});

test('sanitizes schema names and quotes invalid property keys', () => {
    assert.equal(typeNames['user-dto'], 'UserDto');
    assert.equal(t({ $ref: '#/components/schemas/user-dto' }), 'UserDto');
    const used = new Set();
    tsType({ type: 'array', items: { $ref: '#/components/schemas/user-dto' } }, used);
    assert.deepEqual([...used], ['UserDto']);

    const source = generateTypes(api, createTypeContext(api))['types/index.ts'];
    assert.match(source, /export interface UserDto \{\nid: number;\n"first-name"\?: string;\n\}/);
    assert.match(source, /export type Status = "on" \| "off";/);
    assert.match(source, /export type Page = \{[^]*\} \| null;/);
});
