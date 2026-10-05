/**
 * Records docs/demo.gif: the bookstore example running against the mock API.
 *
 *   node scripts/record-demo.ts <app-dir>
 *
 * <app-dir> is an app made with `generate-api create <app-dir> --example bookstore` with its dependencies
 * installed. Needs ffmpeg, and Chromium for Playwright (CHROMIUM_PATH to use a specific one).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { chromium, type Page } from 'playwright-core';
import { startMockServer } from '../src/index.ts';

const app = path.resolve(process.argv[2] ?? 'my-bookstore');
const root = path.join(import.meta.dirname, '..');
const work = path.join(root, 'test', '.tmp', 'demo-recording');
const output = path.join(root, 'docs', 'demo.gif');
const size = { width: 1280, height: 760 };
const port = 5199;

fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });

const mock = await startMockServer({ input: path.join(app, 'openapi.yaml'), port: 4010 });
const vite = spawn(process.execPath, [path.join(app, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: app, stdio: 'ignore' });
await new Promise(resolve => setTimeout(resolve, 4000));
const base = `http://127.0.0.1:${port}`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const context = await browser.newContext({ viewport: size, recordVideo: { dir: work, size } });
const page = await context.newPage();

const wait = (ms: number) => page.waitForTimeout(ms);

// Recordings don't show the mouse, so draw one that follows it
await context.addInitScript(() => {
    window.addEventListener('DOMContentLoaded', () => {
        const cursor = document.createElement('div');
        cursor.id = 'demo-cursor';
        cursor.innerHTML =
            '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l16 9-7 2-3 7z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
        Object.assign(cursor.style, { position: 'fixed', left: '0', top: '0', zIndex: '2147483647', pointerEvents: 'none', transition: 'transform 0.05s linear' });
        document.body.appendChild(cursor);
        const saved = sessionStorage.getItem('demo-cursor');
        if (saved) cursor.style.transform = saved;
        document.addEventListener('mousemove', event => {
            const transform = `translate(${event.clientX - 3}px, ${event.clientY - 2}px)`;
            cursor.style.transform = transform;
            sessionStorage.setItem('demo-cursor', transform);
        });
        document.addEventListener('mousedown', () => (cursor.style.scale = '0.85'));
        document.addEventListener('mouseup', () => (cursor.style.scale = '1'));
    });
});

let mouse = { x: size.width / 2, y: size.height / 2 };

async function moveTo(page: Page, selector: ReturnType<Page['locator']>) {
    await selector.scrollIntoViewIfNeeded();
    const box = await selector.boundingBox();
    if (!box) throw new Error('element not visible');
    const target = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(target.x, target.y, { steps: Math.max(8, Math.round(Math.hypot(target.x - mouse.x, target.y - mouse.y) / 25)) });
    mouse = target;
}

async function click(locator: ReturnType<Page['locator']>, pause = 500) {
    await locator.waitFor();
    await moveTo(page, locator);
    await wait(150);
    await page.mouse.down();
    await page.mouse.up();
    await wait(pause);
}

async function type(locator: ReturnType<Page['locator']>, text: string) {
    await click(locator, 150);
    await locator.pressSequentially(text, { delay: 70 });
    await wait(300);
}

async function select(locator: ReturnType<Page['locator']>, option: { label: string }) {
    await click(locator, 200);
    await locator.selectOption(option);
    await page.keyboard.press('Escape');
    await wait(900);
}

// A title card: what you type to get here
async function card(lines: Array<{ text: string; command?: boolean }>, title: string, hold: number) {
    await page.setContent(`<!doctype html><html><body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#0f0f14;font-family:ui-sans-serif,system-ui,sans-serif">
      <div style="width:1080px">
        <div style="color:#c4b5fd;font-size:30px;font-weight:700;margin-bottom:22px">${title}</div>
        <div style="background:#1b1b24;border:1px solid #2e2e3a;border-radius:14px;padding:26px 30px;font:19px/1.8 ui-monospace,SFMono-Regular,Menlo,monospace;color:#e5e7eb;min-height:200px" id="term"></div>
      </div></body></html>`);
    for (const line of lines) {
        await page.evaluate(command => {
            const row = document.createElement('div');
            row.innerHTML = command ? '<span style="color:#7c3aed">$ </span><span></span>' : '<span style="color:#9ca3af"></span>';
            document.getElementById('term')!.appendChild(row);
        }, !!line.command);
        for (const char of line.text) {
            await page.evaluate(c => {
                const spans = document.querySelectorAll('#term div:last-child span');
                spans[spans.length - 1].textContent += c;
            }, char);
            await wait(line.command ? 35 : 5);
        }
        await wait(line.command ? 450 : 150);
    }
    await wait(hold);
}

try {
    await card(
        [
            { text: 'npx -p api-gen-package generate-api create my-bookstore --example bookstore', command: true },
            { text: 'Created my-bookstore: dashboard generated, shadcn/ui installed' },
            { text: 'npm run mock', command: true },
            { text: 'Mock API for openapi.yaml on http://localhost:4010/v1' },
            { text: 'npm run dev', command: true },
        ],
        'OpenAPI file → admin panel, in one command',
        1400
    );

    // Sign in (the mock accepts anything); dark until the page has drawn, so there is no white flash
    await page.evaluate(() => (document.body.style.background = '#fff'));
    await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
    await wait(700);
    await type(page.locator('input[name=email]'), 'ada@bookstore.dev');
    await type(page.locator('input[name=password]'), 'secret');
    await click(page.getByRole('button', { name: 'Sign in' }), 1600);

    // List: filters, sorting, selection
    await click(page.locator('aside').getByRole('link', { name: 'Books' }), 1400);
    await select(page.getByRole('combobox', { name: 'Genre' }), { label: 'Fiction' });
    await click(page.getByRole('button', { name: 'Price' }), 1000);
    await click(page.getByRole('button', { name: 'Price ↑' }), 1200);
    await click(page.locator('tbody tr').nth(0).getByRole('checkbox'), 250);
    await click(page.locator('tbody tr').nth(1).getByRole('checkbox'), 1200);
    await click(page.getByRole('button', { name: 'Clear filters' }), 1000);

    // Detail page with a tab for the reviews
    await click(page.locator('tbody tr').nth(2).getByRole('link').first(), 1800);
    await moveTo(page, page.getByRole('tab', { name: 'Reviews' }));
    await wait(1400);

    // Create form: validation, then a reference picked by name
    await click(page.locator('aside').getByRole('link', { name: 'Books' }), 900);
    await click(page.getByRole('link', { name: 'Add new' }), 900);
    await click(page.getByRole('button', { name: 'Create' }), 900);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await wait(1600);
    await type(page.locator('input[name=title]'), 'The Left Hand of Darkness');
    await select(page.locator('select[name=authorId]'), { label: (await page.locator('select[name=authorId] option').nth(3).textContent()) ?? '' });
    await select(page.locator('select[name=genre]'), { label: 'Fiction' });
    await type(page.locator('input[name=price]'), '14.90');
    await wait(500);

    // Dark mode and French
    await click(page.getByRole('button', { name: 'Toggle dark mode' }), 900);
    await click(page.locator('aside').getByRole('link', { name: 'Authors' }), 900);
    await select(page.locator('aside').getByRole('combobox', { name: 'Language' }), { label: 'Français' });
    await page.getByRole('link', { name: 'Ajouter' }).waitFor();
    await wait(1800);

    await card(
        [
            { text: 'Tables, filters, relations, forms, login, permissions,' },
            { text: 'dark mode, 6 languages: plain React + shadcn/ui code in your repo.' },
            { text: 'github.com/FNMALIC/api_gen', command: true },
        ],
        'api-gen-package',
        2200
    );
} finally {
    await context.close();
    await browser.close();
    vite.kill();
    await mock.close();
}

const video = fs.readdirSync(work).find(file => file.endsWith('.webm'));
if (!video) throw new Error('No recording was made');
fs.mkdirSync(path.dirname(output), { recursive: true });
// Two passes: a palette made for this video, then the GIF with it
const filters = 'fps=12,scale=960:-1:flags=lanczos';
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(work, video), '-vf', `${filters},palettegen=max_colors=128:stats_mode=diff`, path.join(work, 'palette.png')]);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(work, video), '-i', path.join(work, 'palette.png'), '-lavfi', `${filters} [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, output]);
console.log(`Wrote ${path.relative(root, output)} (${(fs.statSync(output).size / 1024 / 1024).toFixed(1)} MB)`);
