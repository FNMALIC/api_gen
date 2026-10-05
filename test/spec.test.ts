import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadSpec, buildModels, splitPrefix, formatValidationErrors } from '../src/spec.ts';
import { createTypeContext } from '../src/generators/types.ts';
import { singularize, pluralize, pascalCase } from '../src/helpers.ts';
import type { Model } from '../src/model.ts';
import { FIXTURES } from './helpers.ts';

async function build(fixture: string, options?: Parameters<typeof buildModels>[2]) {
    const api = await loadSpec(path.join(FIXTURES, fixture));
    return buildModels(api, createTypeContext(api), options);
}

async function models(fixture: string, options?: Parameters<typeof buildModels>[2]): Promise<Record<string, Model>> {
    const api = await loadSpec(path.join(FIXTURES, fixture));
    const result = buildModels(api, createTypeContext(api), options);
    return Object.fromEntries(result.models.map(model => [model.key, model]));
}

test('singularizes and pluralizes resource names', () => {
    const cases: Array<[string, string, string]> = [
        ['users', 'User', 'Users'],
        ['product-categories', 'ProductCategory', 'ProductCategories'],
        ['addresses', 'Address', 'Addresses'],
        ['statuses', 'Status', 'Statuses'],
        ['people', 'Person', 'People'],
        ['order', 'Order', 'Orders'],
        ['health', 'Health', 'Health'],
    ];
    for (const [word, singular, plural] of cases) {
        assert.equal(pascalCase(singularize(word)), singular, word);
        assert.equal(pascalCase(pluralize(word)), plural, word);
    }
});

test('auto-detects /api and /vN prefixes', () => {
    assert.deepEqual(splitPrefix('/api/v2/users/{id}'), { prefixSegments: ['api', 'v2'], rest: ['users', '{id}'] });
    assert.deepEqual(splitPrefix('/users'), { prefixSegments: [], rest: ['users'] });
    assert.deepEqual(splitPrefix('/api/v1/users', '/api'), { prefixSegments: ['api'], rest: ['v1', 'users'] });
    assert.equal(splitPrefix('/other/users', '/api'), null);
});

test('groups by path, classifies CRUD operations and names functions', async () => {
    const { products, orders, health, 'product-categories': categories } = await models('shop.json');

    assert.equal(products.basePath, '/v1/products');
    assert.equal(products.Singular, 'Product');
    assert.equal(products.Plural, 'Products');
    assert.deepEqual(
        Object.fromEntries(Object.entries(products.crud).map(([action, op]) => [action, op.functionName])),
        {
            list: 'listProducts',
            create: 'createProduct',
            retrieve: 'getProduct',
            update: 'replaceProduct', // PUT preferred over PATCH
            delete: 'deleteProduct', // bare "delete" operationId gets the singular resource name
        }
    );
    // Non-CRUD operations are still generated as API functions
    assert.ok(products.operations.some(op => op.functionName === 'uploadProductImage' && op.crud === null));

    assert.deepEqual(Object.keys(orders.crud).sort(), ['create', 'list']);
    assert.ok(orders.operations.some(op => op.functionName === 'postV1OrdersByOrderIdCancel'));

    assert.equal(categories.name, 'productCategories');
    assert.equal(categories.Singular, 'ProductCategory');
    assert.equal(categories.slug, 'product-categories');
    assert.equal(health.PluralOrList, 'HealthList');
});

test('resolves security requirements and header parameters', async () => {
    const { products, health, orders } = await models('shop.json');
    assert.deepEqual(products.crud.list!.security, [['bearerAuth'], ['apiKey']]);
    assert.deepEqual(orders.crud.list!.security, [['bearerAuth']], 'falls back to the document-level requirement');
    assert.deepEqual(health.crud.list!.security, [], 'security: [] makes an endpoint public');
    assert.deepEqual(products.crud.list!.headerParams.map(param => param.name), ['X-Request-Id']);
});

test('detects server-side pagination, search and sort parameters', async () => {
    const { products, orders } = await models('shop.json');
    assert.deepEqual(products.listCapabilities, {
        serverPaging: true,
        page: { name: 'page', base: 1 },
        offset: null,
        size: { name: 'pageSize' },
        search: { name: 'search' },
        sort: { name: 'sortBy', direction: { name: 'sortOrder', asc: 'ASC', desc: 'DESC' } },
        totalPath: ['total'],
    });
    assert.equal(orders.listCapabilities!.serverPaging, false);
});

test('derives fields with x- extensions, nesting and list item details', async () => {
    const { products, orders } = await models('shop.json');
    const field = (name: string) => products.formFields.find(f => f.name === name)!;

    // Columns come from the paginated list response items (Product = ProductInput & { productId, createdAt })
    assert.ok(products.columns.some(f => f.name === 'productId' && f.readOnly));
    assert.equal(products.formFields[0].name, 'name', 'x-order: 0 moves name first');
    assert.equal(field('name').label, 'Product name');
    assert.deepEqual(field('internalCode').hidden, { table: true, form: false });
    assert.equal(field('secret').writeOnly, true);
    assert.deepEqual(field('status').enum, ['draft', 'published']);
    assert.equal(field('description').nullable, true);
    assert.deepEqual(field('channels').items, { type: 'string', format: undefined, enum: ['web', 'store', 'marketplace'], isObject: false });
    assert.deepEqual(field('dimensions').properties!.map(f => f.name), ['width', 'height', 'unit']);
    assert.equal(field('metadata').isMap, true);
    assert.deepEqual(orders.columns.map(f => f.name), ['id', 'status', 'total', 'note']);
});

test('supports a custom prefix and grouping by tag', async () => {
    const byPrefix = await models('shop.json', { prefix: '/v1' });
    assert.ok(byPrefix.products);

    const byTag = await models('shop.json', { groupBy: 'tag' });
    assert.deepEqual(Object.keys(byTag).sort(), ['Categories', 'Documents', 'Orders', 'Products', 'default']);
    assert.equal(byTag.Products.basePath, '/v1/products');
    assert.equal(byTag.Products.crud.retrieve!.functionName, 'getProduct');
});

test('unwraps { success, data } envelopes and finds nested totals', async () => {
    const { users, teams, events } = await models('wrapped.yaml');
    const op = (name: string) => [...users.operations, ...teams.operations, ...events.operations].find(o => o.functionName === name)!;

    // Single records are unwrapped; lists and status-only bodies keep their shape but still fail on success: false
    for (const name of ['getUser', 'createUser', 'updateUser']) assert.deepEqual(op(name).envelope, { key: 'data' }, name);
    assert.deepEqual(op('listUsers').envelope, { key: null });
    assert.deepEqual(op('deleteUser').envelope, { key: null });
    assert.equal(op('getUser').returnSchema!.$ref, '#/components/schemas/User');

    // An object payload is unwrapped even for lists: { success, data: { items, totalCount } }
    assert.deepEqual(teams.crud.list!.envelope, { key: 'data' });
    assert.deepEqual(teams.columns.map(f => f.name), ['id', 'title']);

    // A resource with its own "data" field next to id and name is not an envelope
    assert.equal(events.crud.retrieve!.envelope, null);
    assert.deepEqual(events.columns.map(f => f.name), ['id', 'name', 'data']);

    // Fields come from the payload, not the envelope
    assert.deepEqual(users.columns.map(f => f.name), ['name', 'nickname', 'active', 'id']);
    assert.deepEqual(users.listCapabilities!.totalPath, ['meta', 'total']);
    assert.equal(users.listCapabilities!.serverPaging, true);
});

test('envelope option: an explicit key or false', async () => {
    const off = await models('wrapped.yaml', { envelope: false });
    assert.ok(off.users.operations.every(o => o.envelope === null));

    const explicit = await models('wrapped.yaml', { envelope: 'data' });
    // With an explicit key, any response carrying that property counts, including events' own "data" field
    assert.deepEqual(explicit.events.crud.retrieve!.envelope, { key: 'data' });
});

test('edit forms use the update body, create forms the create body', async () => {
    const { roles } = await models('wrapped.yaml');
    assert.deepEqual(roles.formFields.map(f => f.name), ['name', 'permissions']);
    assert.deepEqual(roles.editFields.map(f => f.name), ['name', 'description']);
});

test('item operations outside CRUD become row actions', async () => {
    const { users } = await models('wrapped.yaml');
    assert.deepEqual(
        users.actions.map(action => ({ label: action.label, Name: action.Name, fields: action.fields?.map(f => f.name) ?? null })),
        [
            { label: 'Set status', Name: 'SetUserStatus', fields: ['status', 'reason'] },
            { label: 'Reset password', Name: 'ResetUserPassword', fields: null },
        ]
    );
});

test('detects the sign-in endpoint and where its token is', async () => {
    const { login } = await build('wrapped.yaml');
    assert.ok(login);
    assert.equal(login.op.functionName, 'loginAuth'); // bare verbs get the resource name, like listUsers
    assert.deepEqual(login.fields.map(f => f.name), ['email', 'password']);
    // The response is { success, data: { token, user } }; the API function already returns data
    assert.deepEqual(login.tokenPath, ['token']);
    assert.equal((await build('shop.json')).login, null);
});

test('reports spec errors as one readable line per problem', () => {
    const message = formatValidationErrors([
        { instancePath: '/paths/~1roles/post/requestBody/content/application~1json/schema/required', keyword: 'minItems', params: { limit: 1 } },
        { instancePath: '/paths/~1roles/post/requestBody/content/application~1json/schema', keyword: 'required', params: { missingProperty: '$ref' } },
        { instancePath: '/paths/~1roles/post/requestBody', keyword: 'oneOf', params: {} },
        { instancePath: '/paths/~1users~1{id}/get/responses/200', keyword: 'required', params: { missingProperty: 'description' } },
        { instancePath: '/paths/~1users~1{id}/get/responses/200', keyword: 'additionalProperties', params: { additionalProperty: 'descriptio' } },
    ]);
    assert.equal(
        message,
        [
            'The OpenAPI document is invalid (2 problems):',
            '  paths["/roles"].post.requestBody.content["application/json"].schema.required: must not be empty (remove it or list at least one item)',
            '  paths["/users/{id}"].get.responses["200"]: missing "description"; unknown property "descriptio"',
        ].join('\n')
    );
});

test('converts Swagger 2.0 documents', async () => {
    const { pets } = await models('petstore-swagger2.yaml');
    assert.equal(pets.basePath, '/pets');
    assert.deepEqual(Object.keys(pets.crud).sort(), ['create', 'list', 'retrieve']);
    assert.deepEqual(pets.formFields.map(f => f.name), ['id', 'name', 'species']);
    assert.ok(pets.formFields[0].readOnly);
});
