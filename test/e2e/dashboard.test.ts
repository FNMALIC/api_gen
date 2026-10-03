/**
 * End-to-end test: generate a dashboard into a real Vite + React + shadcn/ui app, type-check and build it,
 * then click through it in Chromium against a mocked API.
 *
 *   npm run test:e2e
 *
 * Environment:
 *   E2E_UI=fallback   use test/e2e/fallback-ui instead of `npx shadcn add` (for networks without the shadcn registry)
 *   E2E_REUSE=1       keep test/.tmp/e2e-app between runs and skip reinstalling dependencies
 *   CHROMIUM_PATH     Chromium executable (default: the browser installed by `npx playwright-core install chromium`)
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { chromium, type Browser, type Page, type Route } from 'playwright-core';
import { generate } from '../../src/index.ts';
import { SHADCN_COMPONENTS } from '../../src/generators/dashboard.ts';

const ROOT = path.join(import.meta.dirname, '..', '..');
const APP = path.join(ROOT, 'test', '.tmp', 'e2e-app');
const FALLBACK_UI = path.join(import.meta.dirname, 'fallback-ui');
const useFallbackUi = process.env.E2E_UI === 'fallback';

const APP_DEPENDENCIES = [
    'react@19',
    'react-dom@19',
    'react-router-dom@7',
    '@tanstack/react-query@5',
    'axios@1',
    'sonner@2',
    'react-hook-form@7',
    'zod@4',
    '@hookform/resolvers@5',
];
const APP_DEV_DEPENDENCIES = ['vite@7', '@vitejs/plugin-react@5', 'typescript@5', '@types/react@19', '@types/react-dom@19', 'tailwindcss@4', '@tailwindcss/vite@4'];
const FALLBACK_DEPENDENCIES = [
    '@radix-ui/react-slot',
    '@radix-ui/react-label',
    '@radix-ui/react-checkbox',
    '@radix-ui/react-select',
    '@radix-ui/react-alert-dialog',
    'class-variance-authority',
    'clsx',
    'tailwind-merge',
];

function run(command: string, args: string[]) {
    execFileSync(command, args, { cwd: APP, stdio: 'inherit', env: { ...process.env, CI: '1' } });
}

function writeFile(relativePath: string, content: string) {
    fs.mkdirSync(path.dirname(path.join(APP, relativePath)), { recursive: true });
    fs.writeFileSync(path.join(APP, relativePath), content);
}

// A plain Vite + React + Tailwind app, configured the way the shadcn/ui Vite guide describes
function scaffoldApp() {
    writeFile('package.json', JSON.stringify({ name: 'e2e-app', private: true, type: 'module' }, null, 2));
    writeFile(
        'index.html',
        '<!doctype html>\n<html lang="en"><head><meta charset="UTF-8" /><title>e2e</title></head>' +
            '<body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n'
    );
    writeFile(
        'vite.config.ts',
        `import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
});
`
    );
    // Strict settings, matching Vite's react-ts template
    writeFile(
        'tsconfig.json',
        JSON.stringify(
            {
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
                    paths: { '@/*': ['./src/*'] },
                },
                include: ['src'],
            },
            null,
            2
        )
    );
    writeFile('src/index.css', '@import "tailwindcss";\n');
    writeFile(
        'components.json',
        JSON.stringify(
            {
                $schema: 'https://ui.shadcn.com/schema.json',
                style: 'new-york',
                rsc: false,
                tsx: true,
                tailwind: { config: '', css: 'src/index.css', baseColor: 'neutral', cssVariables: true, prefix: '' },
                aliases: { components: '@/components', utils: '@/lib/utils', ui: '@/components/ui', lib: '@/lib', hooks: '@/hooks' },
                iconLibrary: 'lucide',
            },
            null,
            2
        )
    );
}

function installApp() {
    const installed = fs.existsSync(path.join(APP, 'node_modules', 'vite'));
    if (process.env.E2E_REUSE && installed) return;

    fs.rmSync(APP, { recursive: true, force: true });
    fs.mkdirSync(APP, { recursive: true });
    scaffoldApp();
    run('npm', ['install', '--no-audit', '--no-fund', ...APP_DEPENDENCIES]);
    run('npm', ['install', '--no-audit', '--no-fund', '-D', ...APP_DEV_DEPENDENCIES]);
    if (useFallbackUi) {
        run('npm', ['install', '--no-audit', '--no-fund', ...FALLBACK_DEPENDENCIES]);
        fs.cpSync(FALLBACK_UI, path.join(APP, 'src'), { recursive: true });
    } else {
        run('npx', ['--yes', 'shadcn@latest', 'add', '--yes', '--overwrite', ...SHADCN_COMPONENTS]);
    }
}

async function freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(0, () => {
            const { port } = server.address() as net.AddressInfo;
            server.close(() => resolve(port));
        });
        server.on('error', reject);
    });
}

async function waitForServer(url: string, timeoutMs = 30_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            if ((await fetch(url)).ok) return;
        } catch {
            // not up yet
        }
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error(`Server at ${url} did not start`);
}

// ---------------------------------------------------------------------------------------------------------------
// Mock API for test/fixtures/shop.json

interface Product {
    productId: string;
    name: string;
    price: number;
    status: string;
    tags?: string[];
    channels?: string[];
    dimensions?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    availableFrom?: string;
    createdAt?: string;
}

const api = {
    products: [] as Product[],
    requests: [] as Array<{ method: string; path: string; query: Record<string, string>; authorization?: string }>,
    lastBody: null as unknown,
    lastContentType: '',
    lastRawBody: '',
};

function resetApi() {
    api.products = Array.from({ length: 23 }, (_, i) => ({
        productId: `p${i + 1}`,
        name: `Product ${String(i + 1).padStart(2, '0')}`,
        price: 10 + i,
        status: i % 3 ? 'published' : 'draft',
        tags: ['a', 'b'],
        availableFrom: '2026-01-15T10:30:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
    }));
    api.requests = [];
    api.lastBody = null;
}

async function handle(route: Route) {
    const request = route.request();
    const url = new URL(request.url());
    const query = Object.fromEntries(url.searchParams);
    api.requests.push({ method: request.method(), path: url.pathname, query, authorization: request.headers()['authorization'] });
    const method = request.method();

    if (url.pathname === '/v1/products' && method === 'GET') {
        let rows = api.products.filter(row => !query.search || row.name.toLowerCase().includes(query.search.toLowerCase()));
        if (query.sortBy) {
            const key = query.sortBy as keyof Product;
            const direction = query.sortOrder === 'DESC' ? -1 : 1;
            rows = [...rows].sort((a, b) => String(a[key]).localeCompare(String(b[key]), undefined, { numeric: true }) * direction);
        }
        const size = Number(query.pageSize);
        const page = Number(query.page);
        return route.fulfill({ json: { items: rows.slice((page - 1) * size, page * size), total: rows.length } });
    }
    if (url.pathname === '/v1/products' && method === 'POST') {
        api.lastBody = request.postDataJSON();
        const body = api.lastBody as Product;
        if (body.name === 'Taken') return route.fulfill({ status: 409, json: { message: 'Name already taken' } });
        return route.fulfill({ status: 201, json: { ...body, productId: 'new' } });
    }
    const productMatch = url.pathname.match(/^\/v1\/products\/([^/]+)$/);
    if (productMatch && method === 'GET') {
        const product = api.products.find(row => row.productId === productMatch[1]);
        if (!product) return route.fulfill({ status: 404, json: { message: 'Not found' } });
        return route.fulfill({ json: { ...product, channels: ['web'], dimensions: { width: 5, unit: 'cm' }, metadata: { color: 'red' } } });
    }
    if (productMatch && method === 'PUT') {
        api.lastBody = request.postDataJSON();
        api.products = api.products.map(row => (row.productId === productMatch[1] ? { ...row, ...(api.lastBody as Product) } : row));
        return route.fulfill({ json: { ...(api.lastBody as Product), productId: productMatch[1] } });
    }
    if (productMatch && method === 'DELETE') {
        api.products = api.products.filter(row => row.productId !== productMatch[1]);
        return route.fulfill({ status: 204 });
    }
    if (url.pathname === '/v1/documents' && method === 'GET') {
        return route.fulfill({ json: [{ id: 1, title: 'Handbook', url: 'https://example.com/h.pdf', uploadedAt: '2026-02-02T09:00:00Z' }] });
    }
    if (url.pathname === '/v1/documents' && method === 'POST') {
        api.lastContentType = request.headers()['content-type'] ?? '';
        api.lastRawBody = request.postData() ?? '';
        return route.fulfill({ status: 201, json: { id: 2, title: 'Contract' } });
    }
    return route.fulfill({ status: 404, json: { message: `No mock for ${method} ${url.pathname}` } });
}

// ---------------------------------------------------------------------------------------------------------------

describe('generated dashboard (Vite + React Router + shadcn/ui)', { timeout: 20 * 60_000 }, () => {
    let server: ChildProcess | undefined;
    let browser: Browser | undefined;
    let page: Page;
    let baseUrl = '';
    const pageErrors: string[] = [];

    before(async () => {
        installApp();
        for (const dir of ['api', 'types', 'schemas', 'hooks', 'pages', 'utils', 'components/api-gen']) {
            fs.rmSync(path.join(APP, 'src', dir), { recursive: true, force: true });
        }
        fs.rmSync(path.join(APP, 'src', '.api-gen-manifest.json'), { force: true });
        await generate({ input: path.join(ROOT, 'test', 'fixtures', 'shop.json'), output: path.join(APP, 'src'), zod: true });
        writeFile(
            'src/main.tsx',
            `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { dashboardRoutes } from "./pages/routes";
import { setCredentials } from "./utils/auth";
import "./index.css";

setCredentials("bearerAuth", () => "secret-token");
const router = createBrowserRouter(dashboardRoutes);
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
        </QueryClientProvider>
    </StrictMode>
);
`
        );
    });

    after(async () => {
        await browser?.close();
        server?.kill();
    });

    it('type-checks against the real components with strict settings', () => {
        execFileSync(path.join(APP, 'node_modules', '.bin', 'tsc'), ['-p', APP], { cwd: APP, stdio: 'inherit' });
    });

    it('builds and serves', async () => {
        execFileSync(path.join(APP, 'node_modules', '.bin', 'vite'), ['build', '--logLevel', 'warn'], { cwd: APP, stdio: 'inherit' });
        const port = await freePort();
        baseUrl = `http://127.0.0.1:${port}`;
        server = spawn(path.join(APP, 'node_modules', '.bin', 'vite'), ['preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
            cwd: APP,
            stdio: 'ignore',
        });
        await waitForServer(baseUrl);

        browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
        page = await browser.newPage();
        page.on('pageerror', error => pageErrors.push(error.message));
        await page.route('**/v1/**', handle);
        resetApi();
    });

    const mainText = async () => (await page.locator('main').innerText()).replace(/\s+/g, ' ');
    const productNames = async () => (await mainText()).match(/Product \d+/g) ?? [];
    const lastRequest = (pathname: string) => [...api.requests].reverse().find(request => request.path === pathname)!;

    it('lists with server-side pagination and sends credentials', async () => {
        await page.goto(`${baseUrl}/products`);
        await page.getByText('Product 01').waitFor();
        assert.equal((await productNames()).length, 10);
        assert.match(await mainText(), /Page 1 of 3/);
        assert.deepEqual(lastRequest('/v1/products').query, { page: '1', pageSize: '10' });
        assert.equal(lastRequest('/v1/products').authorization, 'Bearer secret-token');

        await page.getByRole('button', { name: 'Next' }).click();
        await page.getByText('Product 11').waitFor();
        assert.match(await mainText(), /Page 2 of 3/);
        assert.equal(lastRequest('/v1/products').query.page, '2');
    });

    it('searches and sorts on the server', async () => {
        await page.getByPlaceholder('Search products...').fill('product 2');
        await page.getByText('Page 1 of 1').waitFor();
        assert.deepEqual(await productNames(), ['Product 20', 'Product 21', 'Product 22', 'Product 23']);
        assert.equal(lastRequest('/v1/products').query.search, 'product 2');

        await page.getByPlaceholder('Search products...').fill('');
        await page.getByText('Page 1 of 3').waitFor();
        await page.getByRole('button', { name: 'Price' }).click();
        await page.getByRole('button', { name: 'Price ↑' }).click();
        await page.getByText('Product 23').first().waitFor();
        assert.equal((await productNames())[0], 'Product 23');
        assert.deepEqual(lastRequest('/v1/products').query, { page: '1', pageSize: '10', sortBy: 'price', sortOrder: 'DESC' });
        assert.ok((await mainText()).includes(new Date('2026-01-15T10:30:00.000Z').toLocaleString()), 'date-time cells are formatted');
    });

    it('validates and creates a product with every kind of field', async () => {
        await page.goto(`${baseUrl}/products/create`);
        await page.getByRole('button', { name: 'Create' }).click();
        for (const message of ['Product name is required', 'Price must be a number', 'Status is required']) {
            await page.getByText(message).waitFor();
        }
        assert.equal(api.lastBody, null, 'invalid forms are not submitted');

        await page.locator('input[name=name]').fill('Lamp');
        await page.locator('input[name=price]').fill('19.5');
        await page.getByRole('combobox').first().click();
        await page.getByRole('option', { name: 'Published' }).click();
        const tags = page.getByPlaceholder('Type and press Enter');
        await tags.fill('desk');
        await tags.press('Enter');
        await tags.fill('light');
        await tags.press('Enter');
        await page.locator('label', { hasText: 'Store' }).click();
        await page.locator("input[name='dimensions.width']").fill('30');
        await page.locator('input[type=datetime-local]').fill('2026-05-01T09:15');
        await page.locator('textarea').fill('{"color": "blue"}');
        await page.getByRole('button', { name: 'Create' }).click();
        await page.waitForURL(`${baseUrl}/products`);

        assert.deepEqual(api.lastBody, {
            name: 'Lamp',
            price: 19.5,
            status: 'published',
            featured: false,
            metadata: { color: 'blue' },
            tags: ['desk', 'light'],
            channels: ['store'],
            dimensions: { width: 30 },
            availableFrom: new Date('2026-05-01T09:15').toISOString(),
        });
        await page.getByText('Product created').waitFor();
    });

    it('shows the server error message when creating fails', async () => {
        await page.goto(`${baseUrl}/products/create`);
        await page.locator('input[name=name]').fill('Taken');
        await page.locator('input[name=price]').fill('1');
        await page.getByRole('combobox').first().click();
        await page.getByRole('option', { name: 'Draft' }).click();
        await page.getByRole('button', { name: 'Create' }).click();
        await page.getByText('Name already taken').waitFor();
        assert.equal(new URL(page.url()).pathname, '/products/create', 'stays on the form');
        // The optional "dimensions" object was left empty: not validated, not sent
        assert.deepEqual(api.lastBody, { name: 'Taken', price: 1, status: 'draft', featured: false, tags: [], channels: [] });
    });

    it('edits a product with its values prefilled', async () => {
        await page.goto(`${baseUrl}/products/p3`);
        await page.locator('input[name=name]').waitFor();
        assert.equal(await page.locator('input[name=name]').inputValue(), 'Product 03');
        assert.equal(await page.locator("input[name='dimensions.width']").inputValue(), '5');
        assert.deepEqual(JSON.parse(await page.locator('textarea').inputValue()), { color: 'red' });

        await page.locator('input[name=name]').fill('Product 03 v2');
        await page.getByRole('button', { name: 'Save' }).click();
        await page.waitForURL(`${baseUrl}/products`);
        const body = api.lastBody as Record<string, unknown>;
        assert.equal(body.name, 'Product 03 v2');
        assert.deepEqual(body.channels, ['web']);
        assert.ok(!('productId' in body), 'read-only fields are not sent');
    });

    it('blocks submitting invalid JSON', async () => {
        api.lastBody = null;
        await page.goto(`${baseUrl}/products/p3`);
        await page.locator('textarea').fill('{bad');
        await page.getByRole('button', { name: 'Save' }).click();
        await page.getByText('Invalid JSON').waitFor();
        assert.equal(api.lastBody, null);
    });

    it('deletes after confirmation', async () => {
        await page.goto(`${baseUrl}/products`);
        await page.getByPlaceholder('Search products...').fill('product 05');
        await page.getByText('Page 1 of 1').waitFor();
        await page.getByRole('button', { name: 'Delete' }).click();
        await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
        await page.getByText('No results.').waitFor();
        assert.ok(api.requests.some(request => request.method === 'DELETE' && request.path === '/v1/products/p5'));
    });

    it('uploads a file as multipart/form-data', async () => {
        await page.goto(`${baseUrl}/documents/create`);
        await page.locator('input[name=title]').fill('Contract');
        await page.locator('input[type=file]').setInputFiles({ name: 'contract.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
        await page.getByRole('button', { name: 'Create' }).click();
        await page.waitForURL(`${baseUrl}/documents`);
        assert.match(api.lastContentType, /^multipart\/form-data/);
        assert.match(api.lastRawBody, /filename="contract.pdf"/);
        assert.match(api.lastRawBody, /name="title"\r\n\r\nContract/);
    });

    it('had no uncaught errors in the page', () => {
        assert.deepEqual(pageErrors, []);
    });
});
