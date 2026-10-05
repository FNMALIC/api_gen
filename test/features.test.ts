import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadSpec, buildModels } from '../src/spec.ts';
import { createTypeContext } from '../src/generators/types.ts';
import { applyResourceOptions, resolveUi, templateExpression } from '../src/ui.ts';
import { appFiles, createApp, generate, loadConfig, startMockServer, watch } from '../src/index.ts';
import { FIXTURES, generateFixture, tmpDir, typecheck } from './helpers.ts';

async function models(fixture: string) {
    const api = await loadSpec(path.join(FIXTURES, fixture));
    return { api, ...buildModels(api, createTypeContext(api)) };
}

test('links foreign keys to the resources they point at', async () => {
    const shop = await models('shop.json');
    const products = shop.models.find(model => model.key === 'products')!;
    const category = products.formFields.find(field => field.name === 'categoryId')!;
    assert.deepEqual(category.reference, { resource: 'product-categories', idKey: 'id', display: 'label', many: false });
    assert.equal(category.label, 'Category', 'labelled without the Id suffix');
    assert.equal(products.columns.find(field => field.name === 'productId')!.reference, undefined, "a record's own id is not a link");
    const orders = shop.models.find(model => model.key === 'orders')!;
    assert.equal(orders.formFields.find(field => field.name === 'productIds')!.reference?.many, true);

    const wrapped = await models('wrapped.yaml');
    const users = wrapped.models.find(model => model.key === 'users')!;
    assert.equal(users.formFields.find(field => field.name === 'roleId')!.reference?.resource, 'roles');
});

test('offers list query parameters as filters, finds sub-resources and permissions', async () => {
    const shop = await models('shop.json');
    const products = shop.models.find(model => model.key === 'products')!;
    assert.deepEqual(
        products.filters.map(filter => [filter.name, filter.kind, filter.label]),
        [
            ['status', 'enum', 'Status'],
            ['categoryId', 'reference', 'Category'],
        ],
        'paging, search and sort parameters are not filters'
    );
    const wrapped = await models('wrapped.yaml');
    const users = wrapped.models.find(model => model.key === 'users')!;
    assert.deepEqual(users.filters.map(filter => filter.kind), ['reference', 'boolean']);
    assert.deepEqual(users.subResources.map(sub => [sub.Name, sub.label, sub.columns.map(field => field.name)]), [
        ['ListUserSessions', 'Sessions', ['id', 'device', 'lastSeen']],
    ]);
    assert.deepEqual(users.permissions.delete, ['users.delete']);
    assert.equal(users.actions.length, 2, 'GET sub-resources are not row actions');
});

test('reads the session details of the sign-in response and finds refresh and logout endpoints', async () => {
    const { login } = await models('wrapped.yaml');
    assert.ok(login);
    assert.deepEqual(login.tokenPath, ['token']);
    assert.deepEqual(login.refreshTokenPath, ['refreshToken']);
    assert.deepEqual(login.permissionsPath, ['permissions']);
    assert.deepEqual(login.userNamePath, ['user', 'name']);
    assert.equal(login.logout?.op.path, '/api/auth/logout');
    assert.equal(login.refresh?.op.path, '/api/auth/refresh');
    assert.equal(login.refresh?.field, 'refreshToken');
});

test('UI strings become expressions: literals with one language, t() lookups with several', () => {
    assert.equal(templateExpression('Delete this {singular}?', { singular: 'user' }), '"Delete this user?"');
    assert.equal(templateExpression('Page {page} of {count}', { page: { code: 'page + 1' }, count: { code: 'total' } }), '`Page ${page + 1} of ${total}`');
    assert.equal(templateExpression('`{a}` ${b}', { a: { code: 'x' } }), '`\\`${x}\\` \\${b}`', 'backticks and ${ are escaped');

    const single = resolveUi({ locale: 'de' }, 'Shop');
    assert.equal(single.t('addNew'), '"Neu"');
    assert.equal(single.label('Users'), '"Users"');
    const multi = resolveUi({ locales: ['en', 'es'] }, 'Shop');
    assert.equal(multi.locale, 'en');
    assert.equal(multi.t('deleteTitle', { singular: multi.lower('User') }), 't("deleteTitle", { singular: tl("User").toLowerCase() })');
    assert.equal(multi.label('Users'), 'tl("Users")');
    assert.throws(() => resolveUi({ locales: ['en', 'xx' as 'en'] }, 'Shop'), /Unknown locale "xx"/);
});

test('the design file sets references, cells, components, filters, icons and permissions', async () => {
    const { models: built, login } = await models('wrapped.yaml');
    const ui = resolveUi(
        {
            resources: {
                users: {
                    icon: 'users',
                    filters: ['active'],
                    permissions: { create: 'users.write', delete: ['admin'], actions: { setUserStatus: 'users.status' } },
                    fields: {
                        roleId: { display: 'description' },
                        nickname: { reference: 'teams', cell: 'badge', component: '@/components/NicknameInput' },
                        name: { cellComponent: '@/components/cells#NameCell' },
                    },
                },
                roles: { fields: { name: { reference: 'nothing' } } },
            },
        },
        'Wrapped'
    );
    const { models: designed, warnings } = applyResourceOptions(built, ui, login);
    const users = designed.find(model => model.key === 'users')!;
    assert.equal(users.icon, 'users');
    assert.deepEqual(users.filters.map(filter => filter.name), ['active']);
    assert.deepEqual(users.permissions.create, ['users.write']);
    assert.deepEqual(users.permissions.delete, ['admin']);
    assert.deepEqual(users.permissions.actions.SetUserStatus, ['users.status']);
    assert.equal(users.formFields.find(field => field.name === 'roleId')!.reference?.display, 'description');
    const nickname = users.columns.find(field => field.name === 'nickname')!;
    assert.equal(nickname.reference?.resource, 'teams');
    assert.equal(nickname.cell, 'badge');
    assert.equal(nickname.component, '@/components/NicknameInput');
    assert.deepEqual(warnings, ['ui.resources.roles.fields.name.reference: no resource named "nothing"']);
});

test('custom input and cell components are imported and type-check', async () => {
    const design = {
        resources: {
            users: {
                fields: {
                    nickname: { component: '@/components/NicknameInput' },
                    name: { cellComponent: '@/components/cells#NameCell' },
                },
            },
        },
    };
    const { dir, read } = await generateFixture('wrapped.yaml', { ui: design });
    assert.match(read('pages/users/UserForm.tsx'), /import NicknameInput from "@\/components\/NicknameInput";/);
    assert.match(read('pages/users/UserForm.tsx'), /<NicknameInput\s+name=\{field\.name\}\s+value=\{field\.value\}\s+onChange=\{field\.onChange\}\s+onBlur=\{field\.onBlur\}\s*\/>/);
    assert.match(read('pages/users/UsersList.tsx'), /import \{ NameCell \} from "@\/components\/cells";/);
    assert.match(read('pages/users/UsersList.tsx'), /render: \(value, row\) => <NameCell value=\{value\} row=\{row\} \/>/);
    // The app's own components
    fs.writeFileSync(
        path.join(dir, 'src/components/NicknameInput.tsx'),
        'export default function NicknameInput(props: { name: string; value?: string | null; onChange: (value: string) => void; onBlur: () => void }) {\n    return <input name={props.name} value={props.value ?? ""} onChange={(e) => props.onChange(e.target.value)} onBlur={props.onBlur} />;\n}\n'
    );
    fs.writeFileSync(path.join(dir, 'src/components/cells.tsx'), 'export function NameCell({ value }: { value: unknown; row: Record<string, unknown> }) {\n    return <strong>{String(value)}</strong>;\n}\n');
    typecheck(dir);
});

test('Next.js output with login, permissions, two languages and icons type-checks', async () => {
    const config = await loadConfig(path.join(FIXTURES, 'wrapped.design.yaml'));
    const { dir, read, exists } = await generateFixture('wrapped.yaml', { router: 'next', ui: config.ui });
    assert.ok(exists('app/(dashboard)/dashboard/page.tsx'));
    assert.ok(exists('app/(dashboard)/users/[id]/page.tsx'));
    assert.ok(exists('app/(dashboard)/users/[id]/edit/page.tsx'));
    const session = read('components/api-gen/session.ts');
    assert.match(session, /import \* as authApi from "@\/api\/auth";/);
    assert.match(session, /refreshing \?\?= /);
    assert.match(read('app/login/page.tsx'), /router\.replace\("\/dashboard"\)/);
    typecheck(dir);
});

test('the mock API serves records shaped like the document', async () => {
    const mock = await startMockServer({ input: path.join(FIXTURES, 'wrapped.yaml'), port: 0, rows: 12 });
    try {
        const get = async (url: string, init?: RequestInit) => {
            const response = await fetch(`${mock.url}${url}`, init);
            const body: any = response.status === 204 ? null : await response.json();
            return { status: response.status, body };
        };
        const list = await get('/api/users?page=2&limit=5');
        assert.equal(list.status, 200);
        assert.equal(list.body.success, true);
        assert.deepEqual(list.body.data.map((user: { id: number }) => user.id), [6, 7, 8, 9, 10]);
        assert.equal(list.body.meta.total, 12);
        const roleIds = (await get('/api/roles')).body.data.map((role: { id: number }) => role.id);
        assert.ok(list.body.data.every((user: { roleId: number }) => roleIds.includes(user.roleId)), 'foreign keys point at existing records');

        const filtered = await get(`/api/users?page=1&limit=50&roleId=${list.body.data[0].roleId}`);
        assert.ok(filtered.body.data.every((user: { roleId: number }) => user.roleId === list.body.data[0].roleId));

        const one = await get('/api/users/3');
        assert.equal(one.body.data.id, 3);
        const missing = await get('/api/users', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
        assert.equal(missing.status, 422);
        assert.deepEqual(Object.keys(missing.body.errors), ['name']);
        const created = await get('/api/users', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"name":"Zed"}' });
        assert.equal(created.status, 201);
        assert.equal(created.body.data.name, 'Zed');
        assert.equal((await get('/api/users/1', { method: 'DELETE' })).status, 200);
        assert.equal((await get('/api/users/1')).status, 404);

        const signIn = await get('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"email":"a@b.c","password":"x"}' });
        assert.match(signIn.body.data.token, /^mock-token-/);
        assert.equal(typeof signIn.body.data.refreshToken, 'string');
        assert.equal((await get('/api/users/2/sessions')).body.data.length, 5);
        assert.equal((await fetch(`${mock.url}/api/users`, { method: 'OPTIONS' })).headers.get('access-control-allow-origin'), '*');
    } finally {
        await mock.close();
    }
});

test('create writes a Vite app with the design file, a dev proxy to the API and the dashboard', async () => {
    const dir = path.join(tmpDir('create'), 'admin');
    const result = await createApp({ dir, input: path.join(FIXTURES, 'shop.json'), install: false, log: () => {} });
    for (const file of ['package.json', 'vite.config.ts', 'tsconfig.json', 'components.json', 'index.html', 'openapi.json', 'api-gen.config.yaml', 'src/main.tsx', 'src/index.css', 'src/pages/routes.tsx', 'src/pages/HomePage.tsx']) {
        assert.ok(fs.existsSync(path.join(dir, file)), file);
    }
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    assert.equal(pkg.scripts.mock, 'generate-api mock openapi.json');
    assert.match(fs.readFileSync(path.join(dir, 'vite.config.ts'), 'utf8'), /"\/v1": proxy/);
    assert.match(fs.readFileSync(path.join(dir, 'api-gen.config.yaml'), 'utf8'), /^input: openapi\.json$/m);
    assert.match(fs.readFileSync(path.join(dir, 'src/utils/api.ts'), 'utf8'), /baseURL: "\/"/);
    assert.ok(result.dependencies.includes('react-router-dom'));
    await assert.rejects(createApp({ dir, input: path.join(FIXTURES, 'shop.json'), install: false, log: () => {} }), /is not empty/);

    // The proxy covers the server's base path
    const api = await loadSpec(path.join(FIXTURES, 'petstore-swagger2.yaml'));
    assert.match(appFiles('pets', api, 'openapi.yaml')['vite.config.ts'], /"\/api": proxy/);
});

test('watch regenerates when the design file changes', async () => {
    const dir = tmpDir('watch');
    const configFile = path.join(dir, 'api-gen.config.yaml');
    const write = (title: string) => fs.writeFileSync(configFile, `input: ${path.join(FIXTURES, 'users.yaml').split(path.sep).join('/')}\noutput: ./src\nui:\n  title: ${title}\n`);
    write('First');
    const titles: string[] = [];
    let resolveSecond: () => void;
    const second = new Promise<void>(resolve => (resolveSecond = resolve));
    const reload = async () => {
        const config = await loadConfig(configFile);
        return { ...config, input: config.input!, format: false };
    };
    const stop = watch(await reload(), {
        configFile,
        reload,
        onResult: () => {
            titles.push(/"(First|Second)"/.exec(fs.readFileSync(path.join(dir, 'src/pages/LayoutWithSidebar.tsx'), 'utf8'))?.[1] ?? '?');
            if (titles.length === 1) setTimeout(() => write('Second'), 50);
            if (titles.length === 2) resolveSecond();
        },
        onError: error => assert.fail(error),
    });
    try {
        await Promise.race([second, new Promise((_, reject) => setTimeout(() => reject(new Error('no regeneration')), 10_000))]);
    } finally {
        stop();
    }
    assert.deepEqual(titles, ['First', 'Second']);
    // generate() itself is untouched by watch
    assert.ok((await generate({ input: path.join(FIXTURES, 'users.yaml'), output: path.join(dir, 'other'), format: false })).written.length > 0);
});

test('the bookstore example generates without warnings and type-checks', async () => {
    const example = path.join(FIXTURES, '..', '..', 'examples', 'bookstore');
    const config = await loadConfig(path.join(example, 'api-gen.config.yaml'));
    const { input: _input, output: _output, ...options } = config;
    const { dir, read, result } = await generateFixture(path.join('..', '..', 'examples', 'bookstore', 'openapi.yaml'), options);
    assert.deepEqual(result.warnings, []);
    assert.match(read('pages/books/BooksList.tsx'), /lookup: "authorNameLabels"/);
    assert.match(read('pages/authors/AuthorDetail.tsx'), /BooksOfAuthorTab/);
    assert.match(read('pages/books/BookDetail.tsx'), /useListBookReviews/);
    assert.match(read('pages/orders/OrderForm.tsx'), /<CheckboxGroup\s+options=\{bookTitleOptions\}/);
    typecheck(dir);
});

test('create --example starts from a shipped example and its design', async () => {
    const { exampleFiles } = await import('../src/create.ts');
    assert.throws(() => exampleFiles('nope'), /No example named "nope"\. Examples: bookstore/);
    const dir = path.join(tmpDir('create-example'), 'books');
    const { input, design } = exampleFiles('bookstore');
    const result = await createApp({ dir, input, design, install: false, log: () => {} });
    const config = fs.readFileSync(path.join(dir, 'api-gen.config.yaml'), 'utf8');
    assert.match(config, /^input: openapi\.yaml$/m);
    assert.match(config, /^output: \.\/src$/m);
    assert.match(config, /\$schema=https:\/\/unpkg\.com\/api-gen-package\/config\.schema\.json/);
    assert.deepEqual(result.warnings, []);
    assert.match(fs.readFileSync(path.join(dir, 'src/components/api-gen/i18n.ts'), 'utf8'), /Librairie/);
});
