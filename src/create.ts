// generate-api create: a new Vite + React + Tailwind + shadcn/ui app with the dashboard generated into it
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createDesignFile, loadConfig, SCHEMA_URL } from './config.ts';
import { generate, type GenerateResult } from './generate.ts';
import { SHADCN_COMPONENTS } from './generators/dashboard.ts';
import { loadSpec } from './spec.ts';
import { HTTP_METHODS, type OpenAPIDocument } from './model.ts';

export interface CreateOptions {
    /** Folder of the new app */
    dir: string;
    /** OpenAPI document: path or URL. A local file is copied into the app. */
    input: string;
    /** Install dependencies and the shadcn/ui components (default true) */
    install?: boolean;
    /** Overwrite files in a folder that is not empty */
    force?: boolean;
    /** A design file to start from instead of the one written from the document */
    design?: string;
    /** Print what happens (default console.log) */
    log?: (line: string) => void;
}

export const APP_DEPENDENCIES = ['react@19', 'react-dom@19'];
export const APP_DEV_DEPENDENCIES = [
    'vite@7',
    '@vitejs/plugin-react@5',
    'typescript@5',
    '@types/react@19',
    '@types/react-dom@19',
    'tailwindcss@4',
    '@tailwindcss/vite@4',
    'api-gen-package',
];
/** What `shadcn init` installs: the helpers its components import */
export const SHADCN_BASE_DEPENDENCIES = ['class-variance-authority', 'clsx', 'tailwind-merge', 'lucide-react', 'tw-animate-css'];

// The document's base path (https://api.example.com/v1 -> /v1), which becomes the axios baseURL
function serverPath(api: OpenAPIDocument): string {
    try {
        return new URL(api.servers?.[0]?.url ?? '/', 'http://localhost').pathname.replace(/\/$/, '');
    } catch {
        return '';
    }
}

function serverOrigin(api: OpenAPIDocument): string | null {
    const url = api.servers?.[0]?.url;
    return url && /^https?:\/\//i.test(url) ? new URL(url).origin : null;
}

// First path segments the API answers on (/v1, /api, /users, ...), proxied to the API by the dev server
function apiPrefixes(api: OpenAPIDocument): string[] {
    const base = serverPath(api);
    const prefixes = new Set<string>();
    for (const [route, item] of Object.entries(api.paths ?? {})) {
        if (!HTTP_METHODS.some(method => item[method])) continue;
        const first = `${base}${route}`.split('/').filter(Boolean)[0];
        if (first && !first.startsWith('{')) prefixes.add(`/${first}`);
    }
    return [...prefixes].sort();
}

const INDEX_CSS = `@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

/* shadcn/ui's neutral theme. Colors, radius and font from the design file (ui.theme) are layered on top. */
@theme inline {
    --radius-sm: calc(var(--radius) - 4px);
    --radius-md: calc(var(--radius) - 2px);
    --radius-lg: var(--radius);
    --radius-xl: calc(var(--radius) + 4px);
    --color-background: var(--background);
    --color-foreground: var(--foreground);
    --color-card: var(--card);
    --color-card-foreground: var(--card-foreground);
    --color-popover: var(--popover);
    --color-popover-foreground: var(--popover-foreground);
    --color-primary: var(--primary);
    --color-primary-foreground: var(--primary-foreground);
    --color-secondary: var(--secondary);
    --color-secondary-foreground: var(--secondary-foreground);
    --color-muted: var(--muted);
    --color-muted-foreground: var(--muted-foreground);
    --color-accent: var(--accent);
    --color-accent-foreground: var(--accent-foreground);
    --color-destructive: var(--destructive);
    --color-border: var(--border);
    --color-input: var(--input);
    --color-ring: var(--ring);
}

:root {
    --radius: 0.625rem;
    --background: oklch(1 0 0);
    --foreground: oklch(0.145 0 0);
    --card: oklch(1 0 0);
    --card-foreground: oklch(0.145 0 0);
    --popover: oklch(1 0 0);
    --popover-foreground: oklch(0.145 0 0);
    --primary: oklch(0.205 0 0);
    --primary-foreground: oklch(0.985 0 0);
    --secondary: oklch(0.97 0 0);
    --secondary-foreground: oklch(0.205 0 0);
    --muted: oklch(0.97 0 0);
    --muted-foreground: oklch(0.556 0 0);
    --accent: oklch(0.97 0 0);
    --accent-foreground: oklch(0.205 0 0);
    --destructive: oklch(0.577 0.245 27.325);
    --border: oklch(0.922 0 0);
    --input: oklch(0.922 0 0);
    --ring: oklch(0.708 0 0);
}

.dark {
    --background: oklch(0.145 0 0);
    --foreground: oklch(0.985 0 0);
    --card: oklch(0.205 0 0);
    --card-foreground: oklch(0.985 0 0);
    --popover: oklch(0.205 0 0);
    --popover-foreground: oklch(0.985 0 0);
    --primary: oklch(0.922 0 0);
    --primary-foreground: oklch(0.205 0 0);
    --secondary: oklch(0.269 0 0);
    --secondary-foreground: oklch(0.985 0 0);
    --muted: oklch(0.269 0 0);
    --muted-foreground: oklch(0.708 0 0);
    --accent: oklch(0.269 0 0);
    --accent-foreground: oklch(0.985 0 0);
    --destructive: oklch(0.704 0.191 22.216);
    --border: oklch(1 0 0 / 10%);
    --input: oklch(1 0 0 / 15%);
    --ring: oklch(0.556 0 0);
}

@layer base {
    * {
        @apply border-border outline-ring/50;
    }
    body {
        @apply bg-background text-foreground;
    }
}
`;

const MAIN_TSX = `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { dashboardRoutes } from "./pages/routes";
import "./index.css";

const router = createBrowserRouter(dashboardRoutes);
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
        </QueryClientProvider>
    </StrictMode>
);
`;

const TSCONFIG = {
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
        types: ['vite/client'],
        paths: { '@/*': ['./src/*'] },
    },
    include: ['src'],
};

export const COMPONENTS_JSON = {
    $schema: 'https://ui.shadcn.com/schema.json',
    style: 'new-york',
    rsc: false,
    tsx: true,
    tailwind: { config: '', css: 'src/index.css', baseColor: 'neutral', cssVariables: true, prefix: '' },
    aliases: { components: '@/components', utils: '@/lib/utils', ui: '@/components/ui', lib: '@/lib', hooks: '@/hooks' },
    iconLibrary: 'lucide',
};

const UTILS_TS = `import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
`;

function viteConfig(prefixes: string[], apiOrigin: string | null): string {
    return `import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// API requests go through the dev server: to the mock API (npm run mock) by default,
// or to a real one with API_URL=${apiOrigin ?? 'https://api.example.com'} npm run dev
const target = process.env.API_URL ?? "http://localhost:4010";
// Page loads of dashboard URLs that share a prefix with the API stay in the app
const proxy = { target, changeOrigin: true, bypass: (req: { headers: { accept?: string }; url?: string }) => (req.headers.accept?.includes("text/html") ? req.url : undefined) };

export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
    server: {
        proxy: {${prefixes.map(prefix => `\n            ${JSON.stringify(prefix)}: proxy,`).join('')}
        },
    },
});
`;
}

/**
 * The files of a new app, without installing anything. The design file is written separately (it needs the spec).
 * Returned paths are relative to the app folder.
 */
export function appFiles(name: string, api: OpenAPIDocument, specFile: string): Record<string, string> {
    return {
        'package.json':
            JSON.stringify(
                {
                    name: name.toLowerCase().replace(/[^a-z0-9-~]+/g, '-').replace(/^-+|-+$/g, '') || 'admin',
                    private: true,
                    version: '0.0.0',
                    type: 'module',
                    scripts: {
                        dev: 'vite',
                        build: 'tsc -p . && vite build',
                        preview: 'vite preview',
                        generate: 'generate-api',
                        'generate:watch': 'generate-api --watch',
                        mock: `generate-api mock ${specFile}`,
                    },
                },
                null,
                2
            ) + '\n',
        'index.html': `<!doctype html>
<html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${(api.info?.title ?? 'Admin').replace(/[<&]/g, '')}</title>
    </head>
    <body>
        <div id="root"></div>
        <script type="module" src="/src/main.tsx"></script>
    </body>
</html>
`,
        'vite.config.ts': viteConfig(apiPrefixes(api), serverOrigin(api)),
        'tsconfig.json': JSON.stringify(TSCONFIG, null, 2) + '\n',
        'components.json': JSON.stringify(COMPONENTS_JSON, null, 2) + '\n',
        '.gitignore': 'node_modules\ndist\n',
        'src/index.css': INDEX_CSS,
        'src/main.tsx': MAIN_TSX,
        'src/lib/utils.ts': UTILS_TS,
    };
}

/** Examples shipped with the package: examples/<name>/openapi.yaml and api-gen.config.yaml */
export function exampleFiles(name: string): { input: string; design: string } {
    const root = new URL('../examples/', import.meta.url);
    const names = fs.existsSync(root) ? fs.readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name) : [];
    if (!names.includes(name)) throw new Error(`No example named "${name}". Examples: ${names.join(', ') || 'none'}`);
    const dir = new URL(`${name}/`, root);
    return { input: fileURLToPath(new URL('openapi.yaml', dir)), design: fileURLToPath(new URL('api-gen.config.yaml', dir)) };
}

function run(cwd: string, command: 'npm' | 'npx', args: string[]) {
    // npm and npx are .cmd shims on Windows, which only run through a shell
    execFileSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
}

/** Scaffold the app, generate the dashboard into it and (unless install is false) install everything */
export async function createApp({ dir, input, install = true, force = false, design, log = console.log }: CreateOptions): Promise<GenerateResult> {
    const root = path.resolve(dir);
    if (fs.existsSync(root) && fs.readdirSync(root).length > 0 && !force) {
        throw new Error(`${dir} is not empty. Pick another folder or pass --force.`);
    }
    const api = await loadSpec(input);
    fs.mkdirSync(root, { recursive: true });

    // A local document is copied in, so the app is self-contained
    let specFile = input;
    if (!/^https?:\/\//i.test(input)) {
        specFile = `openapi${path.extname(input) || '.yaml'}`;
        fs.copyFileSync(input, path.join(root, specFile));
    }
    const files = appFiles(path.basename(root), api, specFile);
    for (const [file, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        fs.writeFileSync(path.join(root, file), content);
    }
    const designFile = path.join(root, 'api-gen.config.yaml');
    if (design) {
        // Its own input and output point inside the example folder; here they are the app's
        const content = fs.readFileSync(design, 'utf8').replace(/^input: .*$/m, `input: ${specFile}`).replace(/^output: .*$/m, 'output: ./src');
        fs.writeFileSync(designFile, content.replace(/\$schema=\S*config\.schema\.json/, `$schema=${SCHEMA_URL}`));
    } else {
        fs.writeFileSync(designFile, await createDesignFile(/^https?:\/\//i.test(specFile) ? specFile : path.join(root, specFile), { output: path.join(root, 'src'), configDir: root }));
    }
    log(`Created ${path.relative(process.cwd(), root) || '.'} with the design file api-gen.config.yaml`);

    // The proxy serves the API on the app's own origin, so the client calls the document's base path
    const config = await loadConfig(designFile);
    const result = await generate({ ...config, input: config.input ?? path.join(root, specFile), output: path.join(root, 'src'), baseUrl: serverPath(api) || '/' });

    if (!install) {
        // Listed in package.json, so a plain `npm install` gets them
        const versions = (specs: string[]) =>
            Object.fromEntries(
                specs.map(spec => {
                    const [, name, major] = spec.match(/^(@?[^@]+)(?:@(\d+))?$/) ?? [, spec, undefined];
                    return [name as string, major ? `^${major}.0.0` : 'latest'];
                })
            );
        const pkgFile = path.join(root, 'package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
        pkg.dependencies = versions([...APP_DEPENDENCIES, ...result.dependencies, ...SHADCN_BASE_DEPENDENCIES]);
        pkg.devDependencies = versions(APP_DEV_DEPENDENCIES);
        fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');
    } else {
        log('Installing dependencies...');
        run(root, 'npm', ['install', '--no-audit', '--no-fund', ...APP_DEPENDENCIES, ...result.dependencies, ...SHADCN_BASE_DEPENDENCIES]);
        run(root, 'npm', ['install', '--no-audit', '--no-fund', '-D', ...APP_DEV_DEPENDENCIES]);
        log('Adding shadcn/ui components...');
        run(root, 'npx', ['--yes', 'shadcn@latest', 'add', '--yes', '--overwrite', ...SHADCN_COMPONENTS]);
    }
    return result;
}
