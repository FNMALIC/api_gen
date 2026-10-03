import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { generate, type GenerateOptions } from '../src/index.ts';

export const ROOT = path.join(import.meta.dirname, '..');
export const FIXTURES = path.join(import.meta.dirname, 'fixtures');
// Inside the repo so generated code resolves this package's node_modules (react, axios, ...)
const TMP_ROOT = path.join(import.meta.dirname, '.tmp');
const STUBS = path.join(import.meta.dirname, 'typecheck', 'stubs');

export function tmpDir(name: string): string {
    fs.mkdirSync(TMP_ROOT, { recursive: true });
    return fs.mkdtempSync(path.join(TMP_ROOT, `${name}-`));
}

export async function generateFixture(fixture: string, options: Partial<GenerateOptions> = {}) {
    const dir = tmpDir(path.basename(fixture, path.extname(fixture)));
    const output = path.join(dir, 'src');
    const result = await generate({ input: path.join(FIXTURES, fixture), output, ...options });
    const read = (file: string) => fs.readFileSync(path.join(output, file), 'utf8');
    const exists = (file: string) => fs.existsSync(path.join(output, file));
    return { dir, output, result, read, exists };
}

/** Type-check generated code with strict settings, using shadcn/ui and Next.js stubs */
export function typecheck(dir: string): void {
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
                // shadcn/ui components come from the stubs; components/api-gen is generated
                '@/components/*': [`${stubs}/components/*`, './src/components/*'],
                '@/lib/*': [`${stubs}/lib/*`],
                '@/*': ['./src/*'],
                'next/link': [`${stubs}/next/link.tsx`],
                'next/navigation': [`${stubs}/next/navigation.ts`],
            },
        },
        include: ['src', stubs],
    };
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));
    try {
        execFileSync(path.join(ROOT, 'node_modules', '.bin', 'tsc'), ['-p', dir], { encoding: 'utf8', stdio: 'pipe' });
    } catch (error) {
        const { stdout, stderr } = error as { stdout: string; stderr: string };
        assert.fail(`tsc failed:\n${stdout}${stderr}`);
    }
}
