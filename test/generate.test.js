const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { generate } = require('../lib/generate');
const { FIXTURES, generateFixture } = require('./helpers');

const STUBS = path.join(__dirname, 'typecheck', 'stubs');

// Type-check generated code with strict settings, using shadcn/ui and Next.js stubs
function typecheck(dir) {
    const stubs = path.relative(dir, STUBS);
    const tsconfig = {
        compilerOptions: {
            target: 'ES2022',
            lib: ['ES2022', 'DOM', 'DOM.Iterable'],
            module: 'ESNext',
            moduleResolution: 'bundler',
            jsx: 'react-jsx',
            strict: true,
            noUnusedLocals: true,
            noUnusedParameters: true,
            noFallthroughCasesInSwitch: true,
            verbatimModuleSyntax: true,
            skipLibCheck: true,
            noEmit: true,
            paths: {
                '@/components/*': [`${stubs}/components/*`],
                '@/lib/*': [`${stubs}/lib/*`],
                '@/*': ['./src/*'],
                'next/link': [`${stubs}/next/link.tsx`],
                'next/navigation': [`${stubs}/next/navigation.ts`],
            },
        },
        include: ['src', stubs],
    };
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));
    const tsc = path.join(__dirname, '..', 'node_modules', '.bin', 'tsc');
    try {
        execFileSync(tsc, ['-p', dir], { encoding: 'utf8', stdio: 'pipe' });
    } catch (error) {
        assert.fail(`tsc failed:\n${error.stdout}${error.stderr}`);
    }
}

test('generates a working React Router project from YAML', async () => {
    const { dir, read, exists, result } = await generateFixture('users.yaml');

    assert.deepEqual(result.warnings, []);
    for (const file of [
        'types/index.ts',
        'api/users.ts',
        'utils/api.ts',
        'hooks/useUsers.ts',
        'pages/routes.tsx',
        'pages/LayoutWithSidebar.tsx',
        'pages/users/UsersList.tsx',
        'pages/users/UsersForm.tsx',
        'pages/users/CreateUsers.tsx',
        'pages/users/EditUsers.tsx',
    ]) {
        assert.ok(exists(file), `${file} should exist`);
    }

    const api = read('api/users.ts');
    assert.match(api, /export const listUsers = async \(config\?: AxiosRequestConfig\): Promise<User\[\]>/);
    assert.match(api, /export const updateUsers = async \(id: number, body: User, config\?: AxiosRequestConfig\)/);
    assert.doesNotMatch(api, /\.catch\(/, 'errors must propagate to React Query');
    assert.match(read('utils/api.ts'), /setAuthTokenGetter/);
    assert.match(read('hooks/useUsers.ts'), /api\.deleteUsers\(Number\(id\)\)/);

    typecheck(dir);
});

test('generates a working Next.js App Router project from JSON with partial CRUD', async () => {
    const { dir, read, exists, result } = await generateFixture('shop.json', { router: 'next' });

    assert.ok(result.warnings.some(warning => warning.includes('"health"')));
    assert.ok(exists('app/(dashboard)/layout.tsx'));
    assert.ok(exists('app/(dashboard)/products/page.tsx'));
    assert.ok(exists('app/(dashboard)/products/create/page.tsx'));
    assert.ok(exists('app/(dashboard)/products/[id]/page.tsx'));
    assert.ok(exists('app/(dashboard)/product-categories/page.tsx'));
    // Orders can be listed and created, but not edited or deleted
    assert.ok(exists('app/(dashboard)/orders/create/page.tsx'));
    assert.ok(!exists('app/(dashboard)/orders/[id]/page.tsx'));
    assert.doesNotMatch(read('app/(dashboard)/orders/page.tsx'), /AlertDialog|Edit/);
    // Categories are read-only: no hooks mutations, no form
    assert.doesNotMatch(read('hooks/useProductCategories.ts'), /useMutation/);
    assert.ok(!exists('app/(dashboard)/product-categories/ProductCategoriesForm.tsx'));
    // String ids are passed through, not converted to numbers
    assert.match(read('hooks/useProducts.ts'), /api\.getProduct\(String\(productsId\)\)/);
    assert.match(read('app/(dashboard)/products/page.tsx'), /row\["productId"\]/);

    typecheck(dir);
});

test('React Router output for the shop spec type-checks too', async () => {
    const { dir } = await generateFixture('shop.json');
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

test('groups by tag', async () => {
    const { exists } = await generateFixture('shop.json', { groupBy: 'tag' });
    assert.ok(exists('api/products.ts'));
    assert.ok(exists('api/categories.ts'));
    assert.ok(exists('api/default_.ts'));
});

test('rejects invalid documents and options', async () => {
    await assert.rejects(generate({ input: path.join(FIXTURES, 'missing.yaml') }), /ENOENT|Error opening file/);
    await assert.rejects(generate({ input: path.join(FIXTURES, 'users.yaml'), only: ['nope'] }), /Unknown target/);
    await assert.rejects(generate({ input: path.join(FIXTURES, 'users.yaml'), router: 'vue' }), /Unknown router/);
    await assert.rejects(generate({ input: path.join(FIXTURES, 'users.yaml'), prefix: '/nope' }), /No paths start with/);
});

test('CLI exits with code 1 on errors', () => {
    const cli = path.join(__dirname, '..', 'bin', 'generate-api.js');
    let status = 0;
    let stderr = '';
    try {
        execFileSync(process.execPath, [cli, path.join(FIXTURES, 'missing.yaml'), '--no-format'], { stdio: 'pipe' });
    } catch (error) {
        status = error.status;
        stderr = String(error.stderr);
    }
    assert.equal(status, 1);
    assert.match(stderr, /^error: /);
});
