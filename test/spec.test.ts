import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadSpec, buildModels, splitPrefix } from '../src/spec.ts';
import { createTypeContext } from '../src/generators/types.ts';
import { singularize, pluralize, pascalCase } from '../src/helpers.ts';
import type { Model } from '../src/model.ts';
import { FIXTURES } from './helpers.ts';

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
        totalKey: 'total',
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

test('converts Swagger 2.0 documents', async () => {
    const { pets } = await models('petstore-swagger2.yaml');
    assert.equal(pets.basePath, '/pets');
    assert.deepEqual(Object.keys(pets.crud).sort(), ['create', 'list', 'retrieve']);
    assert.deepEqual(pets.formFields.map(f => f.name), ['id', 'name', 'species']);
    assert.ok(pets.formFields[0].readOnly);
});
