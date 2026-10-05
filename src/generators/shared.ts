// Pieces shared by the dashboard generators
import { hookNames } from './hooks.ts';
import { pascalCase } from '../helpers.ts';
import { findModel, isMultiLocale, type Ui } from '../ui.ts';
import type { Model, Reference } from '../model.ts';

/** Rows asked for when filling a select from another resource */
export const OPTIONS_PAGE_SIZE = 100;

/** The list query of a resource asking for its first OPTIONS_PAGE_SIZE rows, merged with extra entries */
export function firstPageQuery(model: Model, extra: string[] = []): string | null {
    const list = model.crud.list;
    if (!list) return null;
    const caps = model.listCapabilities;
    const entries: string[] = [];
    if (caps?.serverPaging && caps.size) {
        if (caps.page) entries.push(`${JSON.stringify(caps.page.name)}: ${caps.page.base}`);
        if (caps.offset) entries.push(`${JSON.stringify(caps.offset.name)}: 0`);
        entries.push(`${JSON.stringify(caps.size.name)}: ${OPTIONS_PAGE_SIZE}`);
    }
    entries.push(...extra);
    return entries.length > 0 ? `{ ${entries.join(', ')} }` : null;
}

/** A call to a resource's list hook, e.g. useRoles({ limit: 100 } as Parameters<typeof useRoles>[0]) */
export function listHookCall(model: Model, extra: string[] = []): string {
    const hook = hookNames(model).list;
    const query = model.crud.list && model.crud.list.queryParams.length > 0 ? firstPageQuery(model, extra) : null;
    return query ? `${hook}(${query} as Parameters<typeof ${hook}>[0])` : `${hook}()`;
}

export interface ReferenceSource {
    model: Model;
    hook: string;
    importPath: string;
    /** Variable holding the options or labels, e.g. roleOptions */
    variable: string;
}

export function referenceSource(models: Model[], reference: Reference, suffix: 'Options' | 'Labels'): ReferenceSource | null {
    const model = findModel(models, reference.resource);
    if (!model || !model.crud.list) return null;
    const base = `${model.Singular.charAt(0).toLowerCase()}${model.Singular.slice(1)}`;
    return { model, hook: hookNames(model).list, importPath: `@/hooks/use${model.Plural}`, variable: `${base}${pascalCase(reference.display)}${suffix}` };
}

/** Group named imports by module: { "@/hooks/useRoles": ["useRoles"] } -> import lines */
export class Imports {
    private modules = new Map<string, Set<string>>();
    private defaults = new Map<string, string>();

    add(module: string, ...names: Array<string | false | null | undefined>): this {
        const set = this.modules.get(module) ?? new Set();
        names.forEach(name => name && set.add(name));
        this.modules.set(module, set);
        return this;
    }

    addDefault(module: string, name: string): this {
        this.defaults.set(module, name);
        return this;
    }

    toString(): string {
        const lines: string[] = [];
        for (const module of new Set([...this.defaults.keys(), ...this.modules.keys()])) {
            const names = [...(this.modules.get(module) ?? [])].sort();
            const parts = [this.defaults.get(module), names.length > 0 && `{ ${names.join(', ')} }`].filter(Boolean);
            if (parts.length > 0) lines.push(`import ${parts.join(', ')} from "${module}";`);
        }
        return lines.join('\n');
    }
}

/**
 * A component from the design file: "@/components/ColorPicker" (default export) or "@/components/inputs#ColorPicker".
 * Returns the name to use in JSX.
 */
export function importComponent(imports: Imports, spec: string): string {
    const [module, named] = spec.split('#');
    if (named) {
        imports.add(module, named);
        return named;
    }
    const name = pascalCase(module.split('/').pop() ?? 'Custom') || 'Custom';
    imports.addDefault(module, name);
    return name;
}

/** The i18n import a file needs when several languages are generated: t() and/or tl(), as the code uses them */
export function i18nImport(ui: Ui, code: string, module = '@/components/api-gen/i18n'): string {
    if (!isMultiLocale(ui)) return '';
    const names = [/(^|[^\w.$])t\(/m.test(code) && 't', /(^|[^\w.$])tl\(/m.test(code) && 'tl'].filter(Boolean);
    return names.length > 0 ? `\nimport { ${names.join(', ')} } from "${module}";` : '';
}
