/**
 * End-to-end test: generate a dashboard into a real Vite + React + shadcn/ui app (scaffolded like
 * `generate-api create` does), type-check and build it, then click through it in Chromium against a mocked API.
 *
 *   npm run test:e2e
 *
 * Environment:
 *   E2E_UI=fallback   use test/e2e/fallback-ui instead of `npx shadcn add` (for networks without the shadcn registry)
 *   E2E_UI=init       set shadcn/ui up with `shadcn init` and its current defaults (Base UI and the newest style)
 *                     instead of the classic Radix "new-york" style
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
import { appFiles, generate, loadConfig, loadSpec, type GenerateOptions } from '../../src/index.ts';
import { APP_DEPENDENCIES, APP_DEV_DEPENDENCIES, SHADCN_BASE_DEPENDENCIES } from '../../src/create.ts';
import { binScript } from '../helpers.ts';
import { SHADCN_COMPONENTS, dashboardDependencies } from '../../src/generators/dashboard.ts';

const ROOT = path.join(import.meta.dirname, '..', '..');
const APP = path.join(ROOT, 'test', '.tmp', 'e2e-app');
const FALLBACK_UI = path.join(import.meta.dirname, 'fallback-ui');
const useFallbackUi = process.env.E2E_UI === 'fallback';
const useShadcnInit = process.env.E2E_UI === 'init';

// Exactly what the CLI tells users to install (the designs use icons), so a missing package fails the test.
// api-gen-package itself is this checkout, not the published version.
const DEPENDENCIES = [...APP_DEPENDENCIES, ...dashboardDependencies('react-router', { icons: true })];
const DEV_DEPENDENCIES = APP_DEV_DEPENDENCIES.filter(name => name !== 'api-gen-package');
const FALLBACK_DEPENDENCIES = [
    '@radix-ui/react-slot',
    '@radix-ui/react-label',
    '@radix-ui/react-checkbox',
    '@radix-ui/react-select',
    '@radix-ui/react-alert-dialog',
    'class-variance-authority',
    'clsx',
    'tailwind-merge',
    'tw-animate-css',
];

// npm and npx are .cmd shims on Windows, which only run through a shell
function run(command: 'npm' | 'npx', args: string[]) {
    execFileSync(command, args, { cwd: APP, stdio: 'inherit', env: { ...process.env, CI: '1' }, shell: process.platform === 'win32' });
}

// Run an app dependency's CLI (tsc, vite) with node, on any platform
function appBin(packageName: string, binName: string, args: string[]) {
    return [binScript(APP, packageName, binName), ...args];
}

function writeFile(relativePath: string, content: string) {
    fs.mkdirSync(path.dirname(path.join(APP, relativePath)), { recursive: true });
    fs.writeFileSync(path.join(APP, relativePath), content);
}

// The app `generate-api create` writes; shadcn init brings its own components.json and CSS
async function scaffoldApp() {
    const api = await loadSpec(path.join(ROOT, 'test', 'fixtures', 'shop.json'));
    for (const [file, content] of Object.entries(appFiles('e2e-app', api, 'openapi.json'))) {
        if (useShadcnInit && (file === 'components.json' || file === 'src/index.css')) continue;
        writeFile(file, content);
    }
    if (useShadcnInit) writeFile('src/index.css', '@import "tailwindcss";\n');
}

async function installApp() {
    const installed = fs.existsSync(path.join(APP, 'node_modules', 'vite')) && fs.existsSync(path.join(APP, 'node_modules', 'lucide-react'));
    if (process.env.E2E_REUSE && installed) return;

    fs.rmSync(APP, { recursive: true, force: true });
    fs.mkdirSync(APP, { recursive: true });
    await scaffoldApp();
    run('npm', ['install', '--no-audit', '--no-fund', ...DEPENDENCIES]);
    run('npm', ['install', '--no-audit', '--no-fund', '-D', ...DEV_DEPENDENCIES]);
    if (useShadcnInit) {
        // Whatever a new project gets today, answering every prompt with its default
        execFileSync('npx', ['--yes', 'shadcn@latest', 'init', '--yes', '--defaults', '--force'], {
            cwd: APP,
            stdio: ['ignore', 'inherit', 'inherit'],
            env: { ...process.env, CI: '1' },
            shell: process.platform === 'win32',
        });
        console.log(`components.json after shadcn init:\n${fs.readFileSync(path.join(APP, 'components.json'), 'utf8')}`);
        run('npx', ['--yes', 'shadcn@latest', 'add', '--yes', '--overwrite', ...SHADCN_COMPONENTS]);
    } else if (useFallbackUi) {
        run('npm', ['install', '--no-audit', '--no-fund', ...FALLBACK_DEPENDENCIES]);
        fs.cpSync(FALLBACK_UI, path.join(APP, 'src'), { recursive: true });
    } else {
        // What `generate-api create` installs, then the real components from the registry
        run('npm', ['install', '--no-audit', '--no-fund', ...SHADCN_BASE_DEPENDENCIES]);
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
    categoryId?: number;
    imageUrl?: string;
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

const CATEGORIES = [
    { id: 1, label: 'Lamps' },
    { id: 2, label: 'Desks' },
];

function resetApi() {
    api.products = Array.from({ length: 23 }, (_, i) => ({
        productId: `p${i + 1}`,
        name: `Product ${String(i + 1).padStart(2, '0')}`,
        price: 10 + i,
        status: i % 3 ? 'published' : 'draft',
        categoryId: (i % 2) + 1,
        imageUrl: `https://example.com/images/p${i + 1}.png`,
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
        if (query.status) rows = rows.filter(row => row.status === query.status);
        if (query.categoryId) rows = rows.filter(row => String(row.categoryId) === query.categoryId);
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
        // Validation errors per field, Laravel style
        if (body.name === 'Invalid') return route.fulfill({ status: 422, json: { message: 'The given data was invalid.', errors: { name: ['Name must be unique'] } } });
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
    if (url.pathname === '/v1/product-categories' && method === 'GET') return route.fulfill({ json: CATEGORIES });
    if (url.pathname === '/v1/orders' && method === 'GET') return route.fulfill({ json: [{ id: 1, status: 'paid', total: 12.5, productIds: ['p1', 'p2'] }] });
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

// Regenerate the dashboard for a fixture into the app, replacing the previous one
async function generateInto(fixture: string, options: Partial<GenerateOptions> = {}) {
    for (const dir of ['api', 'types', 'schemas', 'hooks', 'pages', 'utils', 'components/api-gen']) {
        fs.rmSync(path.join(APP, 'src', dir), { recursive: true, force: true });
    }
    fs.rmSync(path.join(APP, 'src', '.api-gen-manifest.json'), { force: true });
    await generate({ input: path.join(ROOT, 'test', 'fixtures', fixture), output: path.join(APP, 'src'), zod: true, ...options });
    // A generated login page manages the token itself; otherwise register a fixed one
    const hasAuth = fs.existsSync(path.join(APP, 'src', 'utils', 'auth.ts')) && !fs.existsSync(path.join(APP, 'src', 'components', 'api-gen', 'session.ts'));
    writeFile(
        'src/main.tsx',
        `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { dashboardRoutes } from "./pages/routes";${hasAuth ? `
import { setCredentials } from "./utils/auth";` : ''}
import "./index.css";
${hasAuth ? `
setCredentials("bearerAuth", () => "secret-token");` : ''}
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
}

function typecheckApp() {
    execFileSync(process.execPath, appBin('typescript', 'tsc', ['-p', APP]), { cwd: APP, stdio: 'inherit' });
}

async function buildAndServe(): Promise<{ server: ChildProcess; baseUrl: string }> {
    execFileSync(process.execPath, appBin('vite', 'vite', ['build', '--logLevel', 'warn']), { cwd: APP, stdio: 'inherit' });
    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const server = spawn(process.execPath, appBin('vite', 'vite', ['preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1']), {
        cwd: APP,
        stdio: 'ignore',
    });
    await waitForServer(baseUrl);
    return { server, baseUrl };
}

// ---------------------------------------------------------------------------------------------------------------

describe('generated dashboard (Vite + React Router + shadcn/ui)', { timeout: 20 * 60_000 }, () => {
    let server: ChildProcess | undefined;
    let browser: Browser | undefined;
    let page: Page;
    let baseUrl = '';
    const pageErrors: string[] = [];

    before(async () => {
        await installApp();
        await generateInto('shop.json');
    });

    after(async () => {
        await browser?.close();
        server?.kill();
    });

    it('type-checks against the real components with strict settings', typecheckApp);

    it('builds and serves', async () => {
        ({ server, baseUrl } = await buildAndServe());
        browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
        page = await browser.newPage({ acceptDownloads: true });
        page.on('pageerror', error => pageErrors.push(error.message));
        await page.route('**/v1/**', handle);
        resetApi();
    });

    const mainText = async () => (await page.locator('main').innerText()).replace(/\s+/g, ' ');
    const productNames = async () => (await mainText()).match(/Product \d+/g) ?? [];
    const lastRequest = (pathname: string) => [...api.requests].reverse().find(request => request.path === pathname)!;

    it('opens on a home page with the number of records of each resource', async () => {
        await page.goto(baseUrl);
        await page.getByRole('heading', { name: 'Shop' }).waitFor();
        const card = page.locator('main a', { hasText: 'Products' });
        await card.getByText('23').waitFor();
        assert.deepEqual(lastRequest('/v1/products').query, { page: '1', pageSize: '1' }, 'counts with a one-row page and the total');
        await card.click();
        await page.waitForURL(`${baseUrl}/products`);
    });

    it('lists with server-side pagination and sends credentials', async () => {
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

    it('shows names for references, amounts, images and badges', async () => {
        await page.goto(`${baseUrl}/products`);
        await page.getByText('Product 01').waitFor();
        const firstRow = page.locator('tbody tr').first();
        await firstRow.getByText('Lamps').waitFor();
        assert.match(await firstRow.innerText(), /\$10\.00/, 'price as an amount');
        assert.equal(await firstRow.locator('img').getAttribute('src'), 'https://example.com/images/p1.png');
        assert.ok(api.requests.some(request => request.path === '/v1/product-categories'), 'category names come from GET /product-categories');
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

    it('filters with the list query parameters', async () => {
        await page.goto(`${baseUrl}/products`);
        await page.getByText('Product 01').waitFor();
        await page.getByRole('combobox', { name: 'Status' }).selectOption('draft');
        await page.getByText('Page 1 of 1').waitFor();
        assert.equal(lastRequest('/v1/products').query.status, 'draft');
        assert.equal((await productNames()).length, 8);

        await page.getByRole('combobox', { name: 'Category' }).selectOption({ label: 'Desks' });
        await page.waitForFunction('document.querySelectorAll("tbody tr").length === 4');
        assert.deepEqual(lastRequest('/v1/products').query, { page: '1', pageSize: '10', status: 'draft', categoryId: '2' });

        await page.getByRole('button', { name: 'Clear filters' }).click();
        await page.getByText('Page 1 of 3').waitFor();
    });

    it('exports the rows as CSV', async () => {
        const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()]);
        assert.equal(download.suggestedFilename(), 'products.csv');
        const csv = fs.readFileSync(await download.path(), 'utf8');
        assert.match(csv.split('\r\n')[0], /^\uFEFFProduct name,Price,Status,Category/);
        assert.match(csv, /Product 01,10,Draft|Product 01,10,draft/);
        assert.match(csv, /Lamps/, 'references by name');
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
        await page.locator('select[name=status]').selectOption('published');
        await page.locator('select[name=categoryId]').selectOption({ label: 'Desks' });
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
            categoryId: 2,
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
        await page.locator('select[name=status]').selectOption('draft');
        await page.getByRole('button', { name: 'Create' }).click();
        await page.getByText('Name already taken').waitFor();
        assert.equal(new URL(page.url()).pathname, '/products/create', 'stays on the form');
        // The optional "dimensions" object was left empty: not validated, not sent
        assert.deepEqual(api.lastBody, { name: 'Taken', price: 1, status: 'draft', featured: false, tags: [], channels: [] });
    });

    it('shows validation errors from the server under their fields', async () => {
        await page.locator('input[name=name]').fill('Invalid');
        await page.getByRole('button', { name: 'Create' }).click();
        const message = page.locator('form').getByText('Name must be unique');
        await message.waitFor();
        assert.equal(await page.locator('input[name=name]').getAttribute('aria-invalid'), 'true');
    });

    it('shows a record on its detail page', async () => {
        await page.goto(`${baseUrl}/products`);
        await page.getByRole('link', { name: 'Product 03' }).click();
        await page.waitForURL(`${baseUrl}/products/p3`);
        await page.getByText('Lamps').waitFor();
        const details = (await page.locator('dl').innerText()).replace(/\s+/g, ' ');
        assert.match(details, /Product name Product 03/);
        assert.match(details, /Category Lamps/);
        assert.ok(await page.getByRole('link', { name: 'Edit' }).isVisible());
    });

    it('edits a product with its values prefilled', async () => {
        await page.getByRole('link', { name: 'Edit' }).click();
        await page.waitForURL(`${baseUrl}/products/p3/edit`);
        await page.locator('input[name=name]').waitFor();
        assert.equal(await page.locator('input[name=name]').inputValue(), 'Product 03');
        assert.equal(await page.locator('select[name=categoryId]').inputValue(), '1');
        assert.equal(await page.locator("input[name='dimensions.width']").inputValue(), '5');
        assert.deepEqual(JSON.parse(await page.locator('textarea').inputValue()), { color: 'red' });

        await page.locator('input[name=name]').fill('Product 03 v2');
        await page.getByRole('button', { name: 'Save' }).click();
        await page.waitForURL(`${baseUrl}/products/p3`);
        const body = api.lastBody as Record<string, unknown>;
        assert.equal(body.name, 'Product 03 v2');
        assert.deepEqual(body.channels, ['web']);
        assert.ok(!('productId' in body), 'read-only fields are not sent');
    });

    it('blocks submitting invalid JSON', async () => {
        api.lastBody = null;
        await page.goto(`${baseUrl}/products/p3/edit`);
        await page.locator('textarea').fill('{bad');
        await page.getByRole('button', { name: 'Save' }).click();
        await page.getByText('Invalid JSON').waitFor();
        assert.equal(api.lastBody, null);
    });

    it('deletes after confirmation', async () => {
        await page.goto(`${baseUrl}/products`);
        await page.getByPlaceholder('Search products...').fill('product 05');
        await page.getByText('Page 1 of 1').waitFor();
        await page.getByRole('button', { name: 'Delete', exact: true }).click();
        await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
        await page.getByText('No results.').waitFor();
        assert.ok(api.requests.some(request => request.method === 'DELETE' && request.path === '/v1/products/p5'));
    });

    it('deletes the selected rows at once', async () => {
        await page.goto(`${baseUrl}/products`);
        await page.getByText('Product 01').waitFor();
        const rows = page.locator('tbody tr');
        await rows.nth(0).getByRole('checkbox').click();
        await rows.nth(1).getByRole('checkbox').click();
        await page.getByText('2 selected').waitFor();
        await page.getByRole('button', { name: 'Delete selected' }).click();
        await page.getByRole('alertdialog').getByText('Delete 2 items?').waitFor();
        await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
        await page.getByText('2 deleted').waitFor();
        const deleted = api.requests.filter(request => request.method === 'DELETE').map(request => request.path);
        assert.ok(deleted.includes('/v1/products/p1') && deleted.includes('/v1/products/p2'));
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

    it('opens the sidebar from a menu button on phones', async () => {
        await page.setViewportSize({ width: 390, height: 800 });
        await page.goto(`${baseUrl}/products`);
        await page.getByText('Product 03').waitFor();
        const sidebarLink = page.locator('aside').getByRole('link', { name: 'Orders' });
        assert.equal(await sidebarLink.isVisible() && (await sidebarLink.boundingBox())!.x >= 0, false, 'the sidebar starts off-screen');
        await page.getByRole('button', { name: 'Menu' }).click();
        await page.waitForFunction('document.querySelector("aside").getBoundingClientRect().x >= 0');
        await sidebarLink.click();
        await page.waitForURL(`${baseUrl}/orders`);
        await page.waitForFunction('document.querySelector("aside").getBoundingClientRect().right <= 0');
        await page.setViewportSize({ width: 1280, height: 800 });
    });

    it('had no uncaught errors in the page', () => {
        assert.deepEqual(pageErrors, []);
    });
});

// ---------------------------------------------------------------------------------------------------------------
// An API that wraps every response: { success, data, meta } (test/fixtures/wrapped.yaml)

describe('generated dashboard for a wrapped API with login, permissions, row actions and a French/English YAML design', { timeout: 20 * 60_000 }, () => {
    let server: ChildProcess | undefined;
    let browser: Browser | undefined;
    let page: Page;
    let baseUrl = '';
    const pageErrors: string[] = [];
    let users: Array<{ id: number; name: string; nickname?: string; roleId?: number; active?: boolean }> = [];
    let roles: Array<{ id: number; name: string; description?: string; permissions: string[] }> = [];
    let lastBody: unknown = null;
    // Tokens the API accepts; a refresh replaces them
    let validTokens = new Set<string>();
    let refreshCount = 0;
    const requests: Array<{ method: string; path: string; query: Record<string, string>; authorization?: string }> = [];

    const envelope = (data: unknown, extra: Record<string, unknown> = {}) => ({ json: { success: true, data, ...extra } });

    async function handleWrapped(route: Route) {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method();
        const query = Object.fromEntries(url.searchParams);
        requests.push({ method, path: url.pathname, query, authorization: request.headers()['authorization'] });
        const userMatch = url.pathname.match(/^\/api\/users\/(\d+)$/);
        const roleMatch = url.pathname.match(/^\/api\/roles\/(\d+)$/);
        const actionMatch = url.pathname.match(/^\/api\/users\/(\d+)\/(status|reset-password)$/);
        const sessionsMatch = url.pathname.match(/^\/api\/users\/(\d+)\/sessions$/);

        if (url.pathname === '/api/auth/login' && method === 'POST') {
            const { email, password } = request.postDataJSON() as { email: string; password: string };
            if (password !== 'secret') return route.fulfill({ status: 401, json: { success: false, message: 'Mot de passe incorrect' } });
            const token = `token-for-${email}`;
            validTokens.add(token);
            const admin = email.startsWith('admin');
            return route.fulfill(
                envelope({
                    token,
                    refreshToken: `refresh-for-${email}`,
                    permissions: admin ? ['*'] : ['users.read'],
                    user: { id: 99, name: admin ? 'Admin' : 'Viewer' },
                })
            );
        }
        if (url.pathname === '/api/auth/refresh' && method === 'POST') {
            const { refreshToken } = request.postDataJSON() as { refreshToken: string };
            refreshCount++;
            const token = `${refreshToken.replace('refresh-for-', 'token-for-')}-${refreshCount}`;
            validTokens.add(token);
            return route.fulfill(envelope({ token, refreshToken }));
        }
        // Everything else needs a token the API handed out
        const token = request.headers()['authorization']?.replace(/^Bearer /, '');
        if (!token || !validTokens.has(token)) {
            return route.fulfill({ status: 401, json: { success: false, message: 'Unauthorized' } });
        }
        if (url.pathname === '/api/auth/logout' && method === 'POST') {
            validTokens.delete(token);
            return route.fulfill({ status: 204 });
        }
        if (url.pathname === '/api/users' && method === 'GET') {
            const limit = Number(query.limit);
            const pageNumber = Number(query.page);
            let rows = users;
            if (query.roleId) rows = rows.filter(user => String(user.roleId) === query.roleId);
            if (query.active) rows = rows.filter(user => String(!!user.active) === query.active);
            return route.fulfill(envelope(rows.slice((pageNumber - 1) * limit, pageNumber * limit), { meta: { total: rows.length, page: pageNumber } }));
        }
        if (url.pathname === '/api/users' && method === 'POST') {
            lastBody = request.postDataJSON();
            // Some APIs report failures with HTTP 200 and success: false, with messages per field
            return route.fulfill({ json: { success: false, message: 'Name already taken', errors: { name: ['Ce nom est déjà pris'] } } });
        }
        if (sessionsMatch && method === 'GET') {
            return route.fulfill(envelope([{ id: 1, device: 'Firefox on Linux', lastSeen: '2026-03-01T08:00:00Z' }]));
        }
        if (userMatch && method === 'GET') return route.fulfill(envelope(users.find(user => user.id === Number(userMatch[1]))));
        if (userMatch && method === 'PUT') {
            lastBody = request.postDataJSON();
            users = users.map(user => (user.id === Number(userMatch[1]) ? { ...user, ...(lastBody as object) } : user));
            return route.fulfill(envelope(users.find(user => user.id === Number(userMatch[1]))));
        }
        if (userMatch && method === 'DELETE') {
            users = users.filter(user => user.id !== Number(userMatch[1]));
            return route.fulfill({ json: { success: true, message: 'Deleted' } });
        }
        if (actionMatch && method === 'POST') {
            lastBody = request.postData() ? request.postDataJSON() : null;
            return route.fulfill(envelope(users.find(user => user.id === Number(actionMatch[1]))));
        }
        if (url.pathname === '/api/roles' && method === 'GET') return route.fulfill(envelope(roles));
        if (roleMatch && method === 'GET') return route.fulfill(envelope(roles.find(role => role.id === Number(roleMatch[1]))));
        if (roleMatch && method === 'PATCH') {
            lastBody = request.postDataJSON();
            return route.fulfill(envelope(roles.find(role => role.id === Number(roleMatch[1]))));
        }
        if (url.pathname === '/api/events' && method === 'GET') return route.fulfill({ json: [] });
        return route.fulfill({ status: 404, json: { success: false, message: `No mock for ${method} ${url.pathname}` } });
    }

    before(async () => {
        await installApp();
        // Design from a YAML file, as a developer would write it
        const design = await loadConfig(path.join(ROOT, 'test', 'fixtures', 'wrapped.design.yaml'));
        await generateInto('wrapped.yaml', { ui: design.ui });
        users = Array.from({ length: 25 }, (_, i) => ({
            id: i + 1,
            name: `User ${String(i + 1).padStart(2, '0')}`,
            nickname: `nick${i + 1}`,
            roleId: i % 5 === 0 ? 2 : 1,
            active: i % 2 === 0,
        }));
        roles = [
            { id: 1, name: 'Editor', description: 'Can edit', permissions: ['users.read'] },
            { id: 2, name: 'Owner', description: 'Owns everything', permissions: ['users.read', 'users.write'] },
        ];
    });

    after(async () => {
        await browser?.close();
        server?.kill();
    });

    it('type-checks against the real components with strict settings', typecheckApp);

    it('builds and serves', async () => {
        ({ server, baseUrl } = await buildAndServe());
        browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
        // A French browser, so the dashboard starts in the design's default language
        page = await browser.newPage({ locale: 'fr-FR' });
        page.on('pageerror', error => pageErrors.push(error.message));
        await page.route('**/api/**', handleWrapped);
    });

    const mainText = async () => (await page.locator('main').innerText()).replace(/\s+/g, ' ');
    const signIn = async (email: string) => {
        await page.goto(`${baseUrl}/login`);
        await page.locator('input[name=email]').fill(email);
        await page.locator('input[name=password]').fill('secret');
        await page.getByRole('button', { name: 'Se connecter' }).click();
        await page.waitForURL(`${baseUrl}/`);
    };

    it('sends signed-out visitors to the login page and signs in', async () => {
        await page.goto(`${baseUrl}/users`);
        await page.waitForURL(`${baseUrl}/login`);
        await page.getByText('Connexion à Mon back-office').waitFor();
        await page.getByLabel('Adresse e-mail').waitFor();
        assert.equal(await page.getByLabel('Adresse e-mail').getAttribute('placeholder'), 'vous@exemple.com');

        await page.locator('input[name=email]').fill('admin@example.com');
        await page.locator('input[name=password]').fill('wrong');
        await page.getByRole('button', { name: 'Se connecter' }).click();
        await page.getByText('Mot de passe incorrect').waitFor();

        await page.locator('input[name=password]').fill('secret');
        await page.getByRole('button', { name: 'Se connecter' }).click();
        // Signed in: the home page, with a card per resource
        await page.waitForURL(`${baseUrl}/`);
        await page.locator('main a', { hasText: 'Utilisateurs' }).getByText('25').waitFor();
        assert.equal(requests.at(-1)?.authorization, 'Bearer token-for-admin@example.com');
        await page.getByText('Connecté en tant que Admin').waitFor();
    });

    it('shows the title, French labels, icons, the design and the custom primary color', async () => {
        await page.goto(`${baseUrl}/users`);
        await page.getByText('User 01').waitFor();
        await page.locator('aside').getByText('Mon back-office').waitFor();
        await page.getByText("Comptes des personnes qui utilisent l'application.").waitFor();
        const headers = (await page.locator('thead').innerText()).replace(/\s+/g, ' ').trim();
        assert.equal(headers, 'Name Surnom Rôle Active Actions', 'only the columns the design lists, with its labels');
        const nav = (await page.locator('aside nav').innerText()).replace(/\s+/g, ' ').trim();
        assert.equal(nav, 'Accueil Roles Utilisateurs Events', 'home first, then the sidebar in ui.nav order; teams hidden');
        assert.equal(await page.locator('aside nav svg').count(), 3, 'icons for home, roles and users');
        assert.match(await mainText(), /Page 1 sur 3/);
        assert.ok(await page.getByRole('link', { name: 'Ajouter' }).isVisible());
        const primary = await page.evaluate('getComputedStyle(document.documentElement).getPropertyValue("--primary").trim()');
        assert.equal(primary, '#16a34a');
    });

    it('lists rows from the envelope, reads the total from meta.total and shows role names', async () => {
        assert.equal((await mainText()).match(/User \d+/g)?.length, 10);
        assert.deepEqual(requests.filter(request => request.path === '/api/users').at(-1)?.query, { page: '1', limit: '10' });
        const firstRow = (await page.locator('tbody tr').first().innerText()).replace(/\s+/g, ' ');
        assert.match(firstRow, /User 01 nick1 Owner Oui/);
    });

    it('filters by role and status', async () => {
        await page.getByRole('combobox', { name: 'Rôle' }).selectOption({ label: 'Owner' });
        await page.getByText('Page 1 sur 1').waitFor();
        assert.equal((await mainText()).match(/User \d+/g)?.length, 5);
        await page.getByRole('combobox', { name: 'Active' }).selectOption({ label: 'Oui' });
        await page.waitForFunction('document.querySelectorAll("tbody tr").length === 3');
        assert.deepEqual(requests.filter(request => request.path === '/api/users').at(-1)?.query, { page: '1', limit: '10', roleId: '2', active: 'true' });
        await page.getByRole('button', { name: 'Effacer les filtres' }).click();
        await page.getByText('Page 1 sur 3').waitFor();
    });

    it('shows a user with its sessions in a tab', async () => {
        await page.getByRole('link', { name: 'User 03' }).click();
        await page.waitForURL(`${baseUrl}/users/3`);
        await page.getByText('Firefox on Linux').waitFor();
        assert.match((await page.locator('dl').innerText()).replace(/\s+/g, ' '), /Rôle Editor/);
    });

    it('prefills the edit form from the wrapped record, with the role picked from the roles, and saves it', async () => {
        await page.goto(`${baseUrl}/users/3/edit`);
        await page.locator('input[name=name]').waitFor();
        assert.equal(await page.locator('input[name=name]').inputValue(), 'User 03');
        assert.equal(await page.locator('input[name=nickname]').inputValue(), 'nick3');
        await page.locator('select[name=roleId] option', { hasText: 'Owner' }).waitFor({ state: 'attached' });
        assert.equal(await page.locator('select[name=roleId]').inputValue(), '1');

        await page.locator('input[name=nickname]').fill('third');
        await page.locator('select[name=roleId]').selectOption({ label: 'Owner' });
        await page.getByRole('button', { name: 'Enregistrer' }).click();
        await page.waitForURL(`${baseUrl}/users/3`);
        assert.deepEqual(lastBody, { name: 'User 03', nickname: 'third', roleId: 2, active: true });
    });

    it('edits roles with the fields of the update body only, and lists their users', async () => {
        await page.goto(`${baseUrl}/roles/1/edit`);
        await page.locator('input[name=name]').waitFor();
        assert.equal(await page.locator('input[name=description]').inputValue(), 'Can edit');
        assert.equal(await page.getByText('Permissions').count(), 0, 'PATCH /roles/{id} does not accept permissions');
        await page.locator('input[name=description]').fill('Edits users');
        await page.getByRole('button', { name: 'Enregistrer' }).click();
        await page.waitForURL(`${baseUrl}/roles/1`);
        assert.deepEqual(lastBody, { name: 'Editor', description: 'Edits users' });
        // Users can be filtered by role, so the role page lists its users
        await page.getByRole('tab', { name: 'Utilisateurs' }).waitFor();
        await page.getByText('User 02').waitFor();
        assert.equal(requests.filter(request => request.path === '/api/users').at(-1)?.query.roleId, '1');

        await page.goto(`${baseUrl}/roles/create`);
        await page.getByText('Permissions').waitFor();
    });

    it('runs row actions with and without a form', async () => {
        await page.goto(`${baseUrl}/users`);
        await page.getByText('User 01').waitFor();

        await page.getByRole('button', { name: 'Changer le statut' }).first().click();
        const statusDialog = page.getByRole('dialog');
        await statusDialog.locator('select[name=status]').selectOption('suspended');
        await statusDialog.locator('textarea[name=reason]').fill('Spam');
        await statusDialog.getByRole('button', { name: 'Changer le statut' }).click();
        await page.getByText('Changer le statut : effectué').waitFor();
        assert.deepEqual(lastBody, { status: 'suspended', reason: 'Spam' });
        assert.ok(requests.some(request => request.method === 'POST' && request.path === '/api/users/1/status'));

        await page.getByRole('button', { name: 'Réinitialiser le mot de passe' }).first().click();
        await page.getByRole('alertdialog').getByRole('button', { name: 'Réinitialiser le mot de passe' }).click();
        await page.getByText('Réinitialiser le mot de passe : effectué').waitFor();
        assert.ok(requests.some(request => request.method === 'POST' && request.path === '/api/users/1/reset-password'));
    });

    it('treats success: false as an error and shows its messages, per field too', async () => {
        await page.goto(`${baseUrl}/users/create`);
        await page.locator('input[name=name]').fill('Taken');
        await page.getByRole('button', { name: 'Créer' }).click();
        await page.getByText('Name already taken').waitFor();
        await page.locator('form').getByText('Ce nom est déjà pris').waitFor();
        assert.equal(new URL(page.url()).pathname, '/users/create', 'stays on the form');
    });

    it('deletes through a status-only response', async () => {
        await page.goto(`${baseUrl}/users`);
        await page.getByText('User 01').waitFor();
        await page.getByRole('button', { name: 'Supprimer', exact: true }).first().click();
        await page.getByRole('alertdialog').getByRole('button', { name: 'Supprimer' }).click();
        await page.getByText('Utilisateur : supprimé').waitFor();
        await page.getByText('User 11').waitFor();
        assert.ok(!users.some(user => user.id === 1));
    });

    it('refreshes an expired token once and retries', async () => {
        validTokens = new Set();
        await page.goto(`${baseUrl}/users`);
        await page.getByText('User 02').waitFor();
        assert.ok(requests.some(request => request.path === '/api/auth/refresh'));
        assert.match(requests.filter(request => request.path === '/api/users').at(-1)?.authorization ?? '', /^Bearer token-for-admin@example\.com-\d+$/);
        assert.equal(new URL(page.url()).pathname, '/users', 'still signed in');
    });

    it('switches to English', async () => {
        await page.locator('aside').getByRole('combobox', { name: 'Langue' }).selectOption('en');
        await page.getByRole('link', { name: 'Add new' }).waitFor();
        const nav = (await page.locator('aside nav').innerText()).replace(/\s+/g, ' ').trim();
        assert.equal(nav, 'Home Roles Users Events', 'built-in strings and translated labels');
        await page.getByText('Accounts of the people who use the app.').waitFor();
        await page.locator('aside').getByRole('combobox', { name: 'Language' }).selectOption('fr');
        await page.getByRole('link', { name: 'Ajouter' }).waitFor();
    });

    it('signs out on the server too', async () => {
        await page.getByRole('button', { name: 'Se déconnecter' }).click();
        await page.waitForURL(`${baseUrl}/login`);
        assert.ok(requests.some(request => request.method === 'POST' && request.path === '/api/auth/logout'));
        await page.goto(`${baseUrl}/users`);
        await page.waitForURL(`${baseUrl}/login`);
    });

    it('hides what the signed-in user may not do', async () => {
        await signIn('viewer@example.com');
        await page.goto(`${baseUrl}/users`);
        await page.getByText('User 02').waitFor();
        assert.equal(await page.getByRole('button', { name: 'Supprimer', exact: true }).count(), 0, 'DELETE /users/{id} needs users.delete');
        assert.ok(await page.getByRole('link', { name: 'Modifier' }).first().isVisible());
    });

    it('had no uncaught errors in the page', () => {
        assert.deepEqual(pageErrors, []);
    });
});
