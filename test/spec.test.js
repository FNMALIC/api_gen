const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadSpec, buildModels, splitPrefix } = require('../lib/spec');
const { createTypeContext } = require('../generators/typesGenerator');
const { FIXTURES } = require('./helpers');

async function models(fixture, options) {
    const api = await loadSpec(path.join(FIXTURES, fixture));
    const result = buildModels(api, createTypeContext(api), options);
    return Object.fromEntries(result.models.map(model => [model.key, model]));
}

test('auto-detects /api and /vN prefixes', () => {
    assert.deepEqual(splitPrefix('/api/v2/users/{id}'), { prefixSegments: ['api', 'v2'], rest: ['users', '{id}'] });
    assert.deepEqual(splitPrefix('/users'), { prefixSegments: [], rest: ['users'] });
    assert.deepEqual(splitPrefix('/api/v1/users', '/api'), { prefixSegments: ['api'], rest: ['v1', 'users'] });
    assert.equal(splitPrefix('/other/users', '/api'), null);
});

test('groups by path and classifies CRUD operations', async () => {
    const { products, orders, 'product-categories': categories } = await models('shop.json');

    assert.equal(products.basePath, '/v1/products');
    assert.deepEqual(
        Object.fromEntries(Object.entries(products.crud).map(([action, op]) => [action, op.functionName])),
        {
            list: 'listProducts',
            create: 'createProduct',
            retrieve: 'getProduct',
            update: 'replaceProduct', // PUT preferred over PATCH
            delete: 'deleteProducts', // bare "delete" operationId gets the model name
        }
    );
    // Non-CRUD operations are still generated as API functions
    assert.ok(products.operations.some(op => op.functionName === 'uploadProductImage' && op.crud === null));

    assert.deepEqual(Object.keys(orders.crud).sort(), ['create', 'list']);
    assert.ok(orders.operations.some(op => op.functionName === 'postV1OrdersByOrderIdCancel'));

    assert.equal(categories.name, 'productCategories');
    assert.equal(categories.Name, 'ProductCategories');
    assert.equal(categories.slug, 'product-categories');
});

test('derives form fields from the request body and columns from the response', async () => {
    const { products, orders } = await models('shop.json');
    // Columns come from the paginated list response items (Product = ProductInput & { productId, createdAt })
    assert.ok(products.columns.some(field => field.name === 'productId' && field.readOnly));
    assert.ok(!products.formFields.some(field => field.name === 'productId'));
    const status = products.formFields.find(field => field.name === 'status');
    assert.deepEqual(status.enum, ['draft', 'published']);
    assert.equal(status.required, true);
    assert.equal(products.formFields.find(field => field.name === 'description').nullable, true);
    assert.deepEqual(orders.columns.map(field => field.name), ['id', 'status', 'total', 'note']);
});

test('supports a custom prefix and grouping by tag', async () => {
    const byPrefix = await models('shop.json', { prefix: '/v1' });
    assert.ok(byPrefix.products);

    const byTag = await models('shop.json', { groupBy: 'tag' });
    assert.deepEqual(Object.keys(byTag).sort(), ['Categories', 'Orders', 'Products', 'default']);
    assert.equal(byTag.Products.basePath, '/v1/products');
    assert.equal(byTag.Products.crud.retrieve.functionName, 'getProduct');
});
