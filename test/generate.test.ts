import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { generate } from '../src/index.ts';
import { FIXTURES, ROOT, generateFixture, tmpDir, typecheck } from './helpers.ts';

const CLI = path.join(ROOT, 'src', 'cli.ts');

test('generates a working React Router project from YAML', async () => {
    const { dir, read, exists, result } = await generateFixture('users.yaml');

    assert.deepEqual(result.warnings, []);
    for (const file of [
        'types/index.ts',
        'api/users.ts',
        'utils/api.ts',
        'hooks/useUsers.ts',
        'components/api-gen/fields.tsx',
        'pages/routes.tsx',
        'pages/LayoutWithSidebar.tsx',
        'pages/users/UsersList.tsx',
        'pages/users/UserForm.tsx',
        'pages/users/CreateUser.tsx',
        'pages/users/EditUser.tsx',
    ]) {
        assert.ok(exists(file), `${file} should exist`);
    }
    assert.ok(!exists('utils/auth.ts'), 'no security schemes, no auth file');

    const api = read('api/users.ts');
    assert.match(api, /export const listUsers = async \(config\?: AxiosRequestConfig\): Promise<User\[\]>/);
    assert.match(api, /export const updateUser = async \(id: number, body: User, config\?: AxiosRequestConfig\)/);
    assert.match(api, /export const deleteUser = /);
    assert.doesNotMatch(api, /\.catch\(/, 'errors must propagate to React Query');

    const hooks = read('hooks/useUsers.ts');
    for (const hook of ['useUsers', 'useUser', 'useCreateUser', 'useUpdateUser', 'useDeleteUser']) {
        assert.match(hooks, new RegExp(`export const ${hook} = `));
    }
    assert.match(hooks, /api\.deleteUser\(Number\(id\)\)/);
    assert.match(hooks, /toast\.success\("User created"\)/);

    typecheck(dir);
});

test('generates a working Next.js App Router project with auth, server-side lists and rich forms', async () => {
    const { dir, read, exists, result } = await generateFixture('shop.json', { router: 'next' });

    assert.ok(result.warnings.some(warning => warning.includes('"health"')));
    assert.ok(exists('app/(dashboard)/layout.tsx'));
    assert.ok(exists('app/(dashboard)/products/page.tsx'));
    assert.ok(exists('app/(dashboard)/products/create/page.tsx'));
    assert.ok(exists('app/(dashboard)/products/[id]/page.tsx'));
    // Orders can be listed and created, but not edited or deleted
    assert.ok(exists('app/(dashboard)/orders/create/page.tsx'));
    assert.ok(!exists('app/(dashboard)/orders/[id]/page.tsx'));
    assert.doesNotMatch(read('app/(dashboard)/orders/page.tsx'), /AlertDialog|Edit/);
    // Categories are read-only
    assert.doesNotMatch(read('hooks/useProductCategories.ts'), /useMutation/);
    assert.ok(!exists('app/(dashboard)/product-categories/ProductCategoryForm.tsx'));

    // Auth: per-operation alternatives, public endpoints untouched
    assert.match(read('utils/auth.ts'), /export type SecuritySchemeName = "bearerAuth" \| "apiKey" \| "basic" \| "queryKey";/);
    assert.match(read('api/products.ts'), /withAuth\([^]*\[\["bearerAuth"\], \["apiKey"\]\]/);
    assert.doesNotMatch(read('api/health.ts'), /withAuth/);
    assert.match(read('api/products.ts'), /headers\?: \{ "X-Request-Id"\?: string \}/);

    // Server-side pagination, search and sort
    const list = read('app/(dashboard)/products/page.tsx');
    assert.match(list, /page: page \+ 1/);
    assert.match(list, /pageSize: PAGE_SIZE/);
    assert.match(list, /search: debouncedSearch \|\| undefined/);
    assert.match(list, /sortOrder: sort \? \(sort\.direction === "asc" \? "ASC" : "DESC"\) : undefined/);
    assert.match(list, /\["total"\]/);
    assert.doesNotMatch(list, /internalCode|secret/, 'x-hidden: table and writeOnly fields stay out of the table');
    // String ids are passed through, not converted to numbers
    assert.match(read('hooks/useProducts.ts'), /api\.getProduct\(String\(id\)\)/);

    // Form field kinds
    const form = read('app/(dashboard)/products/ProductForm.tsx');
    assert.match(form, /<ListInput type="text"/);
    assert.match(form, /<CheckboxGroup/);
    assert.match(form, /<DateTimeInput/);
    assert.match(form, /<JsonInput/);
    assert.match(form, /name="dimensions\.width"/);
    // Optional nested object: its required "width" only applies once something in it is filled in
    assert.match(form, /dimensions: z[^]*\.nullish\(\)[^]*\.superRefine\(/);
    assert.match(form, /<FormDescription>When the product goes on sale<\/FormDescription>/);
    assert.match(form, /Product name/);
    // Multipart create
    assert.match(read('app/(dashboard)/documents/create/page.tsx'), /toFormData\(values\)/);
    assert.match(read('app/(dashboard)/documents/DocumentForm.tsx'), /<FileInput/);

    typecheck(dir);
});

test('React Router output with zod response validation type-checks', async () => {
    const { dir, read } = await generateFixture('shop.json', { zod: true });
    assert.match(read('schemas/index.ts'), /export const ProductSchema: z\.ZodType<T\.Product> = /);
    assert.match(read('api/products.ts'), /z\.lazy\(\(\) => ProductSchema\)\.parse\(data\)/);
    typecheck(dir);
});

test('Swagger 2.0 input generates a working project', async () => {
    const { dir, exists, read } = await generateFixture('petstore-swagger2.yaml', { zod: true });
    assert.ok(exists('api/pets.ts'));
    // basePath becomes the server URL, which becomes the axios baseURL
    assert.match(read('utils/api.ts'), /baseURL: "\/api"/);
    assert.ok(exists('pages/pets/CreatePet.tsx'));
    typecheck(dir);
});

test('--only limits what is generated and utils/api.ts is never overwritten', async () => {
    const { output, exists, read } = await generateFixture('users.yaml', { only: ['api'], baseUrl: 'https://example.com' });
    assert.ok(exists('api/users.ts'));
    assert.ok(!exists('hooks/useUsers.ts'));
    assert.ok(!exists('pages/routes.tsx'));
    assert.match(read('utils/api.ts'), /baseURL: "https:\/\/example.com"/);

    fs.writeFileSync(path.join(output, 'utils/api.ts'), '// customized\n');
    const result = await generate({ input: path.join(FIXTURES, 'users.yaml'), output, only: ['api'], baseUrl: '/other' });
    assert.equal(read('utils/api.ts'), '// customized\n');
    assert.ok(result.warnings.some(warning => warning.includes('utils/api.ts already exists')));
});

test('removes files a previous run generated that are no longer produced', async () => {
    const dir = tmpDir('stale');
    const spec = path.join(dir, 'users.yaml');
    const output = path.join(dir, 'src');
    // Normalized so the edits below also work on CRLF checkouts (Windows)
    fs.writeFileSync(spec, fs.readFileSync(path.join(FIXTURES, 'users.yaml'), 'utf8').replace(/\r\n/g, '\n'));
    await generate({ input: spec, output });
    assert.ok(fs.existsSync(path.join(output, 'pages/users/EditUser.tsx')));

    // Drop the PUT endpoint: the edit page and its hook must go
    fs.writeFileSync(spec, fs.readFileSync(spec, 'utf8').replace(/    put:[^]*?responses: \{"200": \{description: ok\}\}\n/, ''));
    const partial = await generate({ input: spec, output, only: ['api'] });
    assert.deepEqual(partial.removed, [], 'an --only api run leaves hooks and pages alone');

    const { removed } = await generate({ input: spec, output });
    assert.deepEqual(removed, ['pages/users/EditUser.tsx']);
    assert.ok(!fs.existsSync(path.join(output, 'pages/users/EditUser.tsx')));
    assert.doesNotMatch(fs.readFileSync(path.join(output, 'hooks/useUsers.ts'), 'utf8'), /useUpdateUser/);

    // Files without the generated marker are never deleted
    fs.writeFileSync(path.join(output, 'pages/users/UserForm.tsx'), '// mine now\n');
    fs.writeFileSync(spec, fs.readFileSync(spec, 'utf8').replace(/    post:[^]*?\n  \/api\/users\/\{id\}:/, '  /api/users/{id}:'));
    const second = await generate({ input: spec, output });
    assert.ok(second.removed.includes('pages/users/CreateUser.tsx'));
    assert.ok(fs.existsSync(path.join(output, 'pages/users/UserForm.tsx')));
});

test('applies template overrides', async () => {
    const dir = tmpDir('templates');
    const templates = path.join(dir, 'templates.mjs');
    fs.writeFileSync(
        templates,
        `export default {
            listPage: ({ model, defaultContent }) => defaultContent.replace("Manage your", "Browse all " + model.pluralLabel + ":"),
            hooks: () => undefined,
        };\n`
    );
    const { read } = await generateFixture('users.yaml', { templates });
    assert.match(read('pages/users/UsersList.tsx'), /Browse all Users: users/);
    assert.match(read('hooks/useUsers.ts'), /export const useUsers/);
});

test('groups by tag', async () => {
    const { exists } = await generateFixture('shop.json', { groupBy: 'tag' });
    assert.ok(exists('api/products.ts'));
    assert.ok(exists('api/categories.ts'));
    assert.ok(exists('api/default_.ts'));
});

test('rejects invalid documents and options', async () => {
    const input = path.join(FIXTURES, 'users.yaml');
    await assert.rejects(generate({ input: path.join(FIXTURES, 'missing.yaml') }), /ENOENT|Error opening file/);
    await assert.rejects(generate({ input, only: ['nope' as 'api'] }), /Unknown target/);
    await assert.rejects(generate({ input, router: 'vue' as 'next' }), /Unknown router/);
    await assert.rejects(generate({ input, prefix: '/nope' }), /No paths start with/);
});

test('CLI reads a config file, lets flags override it, and exits with code 1 on errors', () => {
    const dir = tmpDir('cli');
    fs.writeFileSync(
        path.join(dir, 'api-gen.config.json'),
        JSON.stringify({ input: path.relative(dir, path.join(FIXTURES, 'shop.json')), output: 'out', router: 'next', format: false })
    );
    execFileSync(process.execPath, [CLI, '--only', 'api,hooks,dashboard'], { cwd: dir, stdio: 'pipe' });
    assert.ok(fs.existsSync(path.join(dir, 'out/app/(dashboard)/products/page.tsx')), 'router from the config file');

    execFileSync(process.execPath, [CLI, '--router', 'react-router', '-o', 'out2'], { cwd: dir, stdio: 'pipe' });
    assert.ok(fs.existsSync(path.join(dir, 'out2/pages/routes.tsx')), '--router overrides the config file');

    let status = 0;
    let stderr = '';
    try {
        execFileSync(process.execPath, [CLI, path.join(FIXTURES, 'missing.yaml')], { cwd: dir, stdio: 'pipe' });
    } catch (error) {
        ({ status, stderr } = error as { status: number; stderr: string });
    }
    assert.equal(status, 1);
    assert.match(String(stderr), /^error: /);
});
