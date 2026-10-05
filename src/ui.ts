// User-facing options for the generated back-office: wording, language, theme and per-resource tweaks
import { kebabCase, pascalCase } from './helpers.ts';
import { LOCALES, type Locale, type Strings } from './locales.ts';
import { referenceTo } from './spec.ts';
import type { CellKind, Field, LoginInfo, Model } from './model.ts';

export { LOCALES, LOCALE_NAMES, type Locale, type Strings } from './locales.ts';

export interface ThemeOptions {
    /** shadcn/ui color tokens for light mode, e.g. { primary: "#2563eb", destructive: "oklch(0.58 0.22 27)" } */
    colors?: Record<string, string>;
    /** The same tokens for dark mode (default: the light values for primary/ring, nothing else) */
    darkColors?: Record<string, string>;
    /** Corner radius, e.g. "0.25rem" (square) or "1rem" (round) */
    radius?: string;
    /** CSS font-family for the dashboard */
    font?: string;
}

/** Input used for a text field in forms */
export type Widget = 'text' | 'textarea' | 'password' | 'email' | 'url' | 'date' | 'datetime';
export const WIDGETS: Widget[] = ['text', 'textarea', 'password', 'email', 'url', 'date', 'datetime'];

export const CELLS: CellKind[] = ['text', 'number', 'currency', 'boolean', 'badge', 'date', 'datetime', 'link', 'email', 'image', 'list', 'json'];

export interface FieldOptions {
    /** Column and form label */
    label?: string;
    /** Hide everywhere (true), or only in the "table" or the "form" */
    hidden?: boolean | 'table' | 'form';
    /** Position in forms (lower first) */
    order?: number;
    /** Help text under the input */
    help?: string;
    placeholder?: string;
    /** Input for text fields, e.g. "textarea" for long text */
    widget?: Widget;
    /** The resource this id points at, e.g. "roles" for roleId (false: not a reference) */
    reference?: string | false;
    /** Property of the referenced rows to show, e.g. "name" */
    display?: string;
    /** How the table and the detail page show the value */
    cell?: CellKind;
    /** Your own input component: "@/components/ColorPicker" (default export) or "@/components/inputs#ColorPicker" */
    component?: string;
    /** Your own cell component, imported the same way; receives { value, row } */
    cellComponent?: string;
}

export interface ActionOptions {
    /** Button label */
    label?: string;
    /** Leave the button out (the API function and hook are still generated) */
    hidden?: boolean;
}

type PermissionList = string | string[];

export interface PermissionOptions {
    list?: PermissionList;
    view?: PermissionList;
    create?: PermissionList;
    update?: PermissionList;
    delete?: PermissionList;
    /** By operationId of the row action */
    actions?: Record<string, PermissionList>;
}

export interface ResourceOptions {
    /** Plural label, e.g. "Utilisateurs" */
    label?: string;
    /** Singular label, e.g. "Utilisateur" */
    singularLabel?: string;
    /** Text under the title of the list page */
    description?: string;
    /** Leave this resource out of the dashboard (API functions and hooks are still generated) */
    hidden?: boolean;
    /** Sidebar icon: a lucide-react icon name, e.g. "users" or "ShoppingCart" */
    icon?: string;
    /** Table columns, in order. Others are left out. */
    columns?: string[];
    /** Filters above the table (list query parameters), in order; false for none */
    filters?: string[] | false;
    /** Permissions the signed-in user needs (any of them) to see each button */
    permissions?: PermissionOptions;
    /** Per-field options, by property name */
    fields?: Record<string, FieldOptions>;
    /** Per-row-action options, by operationId (or generated function name) */
    actions?: Record<string, ActionOptions>;
}

export interface UiOptions {
    /** Shown in the sidebar and on the login page (default: the document's info.title) */
    title?: string;
    /** Built-in wording: en (default), fr, es, de, pt, it */
    locale?: Locale;
    /** Languages people can switch between in the sidebar; the first (or "locale") is the default */
    locales?: Locale[];
    /** Translations of your own labels per language, e.g. { fr: { Users: "Utilisateurs" } } */
    translations?: Record<string, Record<string, string>>;
    /** Override any UI string, e.g. { addNew: "New" } */
    labels?: Partial<Strings>;
    /** Rows per page (default 10) */
    pageSize?: number;
    /** Currency of amount columns (price, total, ...), e.g. "EUR" (default USD) */
    currency?: string;
    /** A home page with the count of every resource (default true) */
    home?: boolean;
    /** Shortcut for theme.colors.primary */
    primaryColor?: string;
    theme?: ThemeOptions;
    /** Show a light/dark switch in the sidebar (default true) */
    darkModeToggle?: boolean;
    /** Sidebar order, by resource name. Resources not listed follow in their spec order. */
    nav?: string[];
    /** Per-resource labels, columns, fields and actions, keyed by resource name as in the URL ("users", "product-categories") */
    resources?: Record<string, ResourceOptions>;
}

/** A value in generated code: plain text, or a JavaScript expression */
export type Value = string | { code: string };

export interface Ui {
    title: string;
    /** Wording of the default language */
    strings: Strings;
    locale: Locale;
    /** More than one: strings are looked up at runtime and the sidebar gets a language switch */
    locales: Locale[];
    translations: Record<string, Record<string, string>>;
    pageSize: number;
    currency: string;
    home: boolean;
    darkModeToggle: boolean;
    theme: ThemeOptions;
    resources: Record<string, ResourceOptions>;
    nav: string[];
    /** Expression for a UI string, e.g. "Delete this user?" or t("deleteTitle", { singular: ... }) */
    t(key: keyof Strings, values?: Record<string, Value>): string;
    /** Expression for one of your labels, e.g. "Users" or tl("Users") */
    label(text: string): string;
    /** The label as a value to put in a UI string */
    labelValue(text: string): Value;
    /** The label in lower case as a value to put in a UI string */
    lower(text: string): Value;
}

const escapeTemplate = (text: string) => text.replace(/[\\`]/g, match => `\\${match}`).replace(/\$\{/g, '\\${');

/** An expression for a string with {placeholders} filled from values */
export function templateExpression(template: string, values: Record<string, Value> = {}): string {
    const dynamic = Object.values(values).some(value => typeof value !== 'string');
    if (!dynamic) return JSON.stringify(fill(template, values as Record<string, string>));
    // Literal text is escaped as a whole, so "$" followed by "{" can't form an interpolation
    let body = '';
    let literal = '';
    template.replace(/\{(\w+)\}|([^{]+|\{)/g, (match, key: string | undefined, text: string | undefined) => {
        const value = key !== undefined ? values[key] : undefined;
        if (text !== undefined || value === undefined) literal += match;
        else if (typeof value === 'string') literal += value;
        else {
            body += escapeTemplate(literal) + `\${${value.code}}`;
            literal = '';
        }
        return '';
    });
    body += escapeTemplate(literal);
    return `\`${body}\``;
}

export function resolveUi(options: UiOptions | undefined, documentTitle: string | undefined): Ui {
    const locales = options?.locales && options.locales.length > 0 ? [...new Set(options.locales)] : null;
    const locale = options?.locale ?? locales?.[0] ?? 'en';
    for (const code of [locale, ...(locales ?? [])]) {
        if (!LOCALES[code]) throw new Error(`Unknown locale "${code}". Use: ${Object.keys(LOCALES).join(', ')}`);
    }
    const allLocales = locales ? (locales.includes(locale) ? locales : [locale, ...locales]) : [locale];
    const multi = allLocales.length > 1;
    const theme: ThemeOptions = { ...options?.theme };
    if (options?.primaryColor) theme.colors = { ...theme.colors, primary: options.primaryColor };
    const pageSize = options?.pageSize ?? 10;
    if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error(`pageSize must be a positive whole number, got ${pageSize}`);
    const strings: Strings = { ...LOCALES[locale], ...options?.labels };

    const valuesCode = (values: Record<string, Value>) =>
        Object.keys(values).length === 0
            ? ''
            : `, { ${Object.entries(values).map(([key, value]) => `${key}: ${typeof value === 'string' ? JSON.stringify(value) : value.code}`).join(', ')} }`;

    return {
        title: options?.title || documentTitle || 'Admin',
        strings,
        locale,
        locales: allLocales,
        translations: options?.translations ?? {},
        pageSize,
        currency: options?.currency ?? 'USD',
        home: options?.home ?? true,
        darkModeToggle: options?.darkModeToggle ?? true,
        theme,
        resources: options?.resources ?? {},
        nav: options?.nav ?? [],
        t: (key, values = {}) => (multi ? `t(${JSON.stringify(key)}${valuesCode(values)})` : templateExpression(strings[key], values)),
        label: text => (multi ? `tl(${JSON.stringify(text)})` : JSON.stringify(text)),
        labelValue: text => (multi ? { code: `tl(${JSON.stringify(text)})` } : text),
        lower: text => (multi ? { code: `tl(${JSON.stringify(text)}).toLowerCase()` } : text.toLowerCase()),
    };
}

/** True when strings are looked up at runtime (several languages) */
export const isMultiLocale = (ui: Ui) => ui.locales.length > 1;

/** Fill {placeholders} in a UI string */
export function fill(text: string, values: Record<string, string | number>): string {
    return text.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

const resourceKeys = (model: Model) => [model.key, model.slug, model.name];

function resourceOptions(model: Model, ui: Ui): ResourceOptions | undefined {
    return resourceKeys(model).map(key => ui.resources[key]).find(Boolean);
}

export function findModel(models: Model[], key: string): Model | undefined {
    return models.find(model => resourceKeys(model).includes(key));
}

function applyFieldOptions(field: Field, options: FieldOptions, models: Model[], warn: (message: string) => void): Field {
    const hidden = options.hidden === undefined ? field.hidden : { table: options.hidden === true || options.hidden === 'table', form: options.hidden === true || options.hidden === 'form' };
    let reference = field.reference;
    if (options.reference === false) {
        reference = undefined;
    } else if (typeof options.reference === 'string') {
        const target = findModel(models, options.reference);
        if (!target) warn(`reference: no resource named "${options.reference}"`);
        else if (!target.crud.list) warn(`reference: "${options.reference}" has no list operation to pick from`);
        else reference = referenceTo(target, field.type === 'array', options.display);
    } else if (options.display && reference) {
        reference = { ...reference, display: options.display };
    } else if (options.display) {
        warn(`display: "${field.name}" is not a reference; add reference: <resource>`);
    }
    return {
        ...field,
        label: options.label ?? field.label,
        hidden,
        order: options.order ?? field.order,
        description: options.help ?? field.description,
        placeholder: options.placeholder ?? field.placeholder,
        widget: options.widget ?? field.widget,
        reference,
        cell: options.cell ?? field.cell,
        component: options.component ?? field.component,
        cellComponent: options.cellComponent ?? field.cellComponent,
        properties: field.properties,
    };
}

const byOrder = (a: Field, b: Field) => a.order - b.order;
const permissionList = (value: PermissionList | undefined) => (value === undefined ? undefined : typeof value === 'string' ? [value] : value);

/** "users" -> "Users", "shopping-cart" -> "ShoppingCart": the lucide-react export */
export const iconName = (icon: string) => pascalCase(icon);

/**
 * Apply the design options (labels, columns, fields, actions, sidebar order) to the models.
 * Names that match nothing are reported as warnings, so typos in the design file don't go unnoticed.
 */
export function applyResourceOptions(
    models: Model[],
    ui: Ui,
    login: LoginInfo | null = null
): { models: Model[]; login: LoginInfo | null; warnings: string[] } {
    const warnings: string[] = [];
    const known = models.flatMap(resourceKeys);
    for (const key of Object.keys(ui.resources)) {
        if (!known.includes(key)) warnings.push(`ui.resources.${key}: no resource with that name. Resources: ${models.map(m => m.key).join(', ')}`);
    }
    for (const key of ui.nav) {
        if (!known.includes(key)) warnings.push(`ui.nav: no resource named "${key}"`);
    }
    for (const code of Object.keys(ui.translations)) {
        if (!ui.locales.includes(code as Locale)) warnings.push(`ui.translations.${code}: not one of ui.locales (${ui.locales.join(', ')})`);
    }

    const updated = models.map(model => {
        const options = resourceOptions(model, ui);
        if (!options) return model;
        const where = `ui.resources.${model.key}`;
        const next: Model = {
            ...model,
            pluralLabel: options.label ?? model.pluralLabel,
            singularLabel: options.singularLabel ?? model.singularLabel,
            description: options.description ?? model.description,
            icon: options.icon ?? model.icon,
        };
        if (options.icon !== undefined && !/^[A-Za-z][A-Za-z0-9-]*$/.test(options.icon)) {
            warnings.push(`${where}.icon: "${options.icon}" is not a lucide icon name (e.g. users, shopping-cart)`);
            next.icon = undefined;
        }

        const reported = new Set<string>();
        for (const [name, fieldOptions] of Object.entries(options.fields ?? {})) {
            if (fieldOptions.widget && !WIDGETS.includes(fieldOptions.widget)) {
                warnings.push(`${where}.fields.${name}.widget: "${fieldOptions.widget}" is not one of ${WIDGETS.join(', ')}`);
            }
            if (fieldOptions.cell && !CELLS.includes(fieldOptions.cell)) {
                warnings.push(`${where}.fields.${name}.cell: "${fieldOptions.cell}" is not one of ${CELLS.join(', ')}`);
            }
            const loginFields = login?.model.key === model.key ? login.fields : [];
            const lists = [next.formFields, next.editFields, next.columns, loginFields, ...next.actions.map(action => action.fields ?? [])];
            if (!lists.some(list => list.some(field => field.name === name))) {
                const names = [...new Set(lists.flat().map(field => field.name))];
                warnings.push(`${where}.fields.${name}: no field with that name. Fields: ${names.join(', ')}`);
            }
        }
        const apply = (fields: Field[]) =>
            fields
                .map(field => {
                    const fieldOptions = options.fields?.[field.name];
                    if (!fieldOptions) return field;
                    return applyFieldOptions(field, fieldOptions, models, message => {
                        const line = `${where}.fields.${field.name}.${message}`;
                        if (!reported.has(line)) warnings.push(line);
                        reported.add(line);
                    });
                })
                .sort(byOrder);
        next.formFields = apply(next.formFields);
        next.editFields = apply(next.editFields);
        next.columns = apply(next.columns);

        if (options.columns) {
            for (const name of options.columns) {
                if (!next.columns.some(field => field.name === name)) {
                    warnings.push(`${where}.columns: no column "${name}". Columns: ${next.columns.map(field => field.name).join(', ')}`);
                }
            }
            next.tableColumns = options.columns;
        }

        if (options.filters === false) {
            next.filters = [];
        } else if (options.filters) {
            for (const name of options.filters) {
                if (!next.filters.some(filter => filter.name === name)) {
                    warnings.push(`${where}.filters: no filter "${name}". Filters: ${next.filters.map(filter => filter.name).join(', ') || 'none (the list operation has no other query parameters)'}`);
                }
            }
            next.filters = options.filters.map(name => next.filters.find(filter => filter.name === name)).filter(filter => !!filter);
        }
        // A filter takes the label of the column with the same name
        next.filters = next.filters.map(filter => {
            const label = options.fields?.[filter.name]?.label;
            return label ? { ...filter, label } : filter;
        });

        const actionOptions = options.actions ?? {};
        const findAction = (key: string) => next.actions.find(action => [action.op.operationId, action.op.functionName, action.Name].includes(key));
        for (const key of Object.keys(actionOptions)) {
            if (!findAction(key)) {
                warnings.push(`${where}.actions.${key}: no row action with that name. Actions: ${next.actions.map(action => action.op.operationId ?? action.op.functionName).join(', ') || 'none'}`);
            }
        }
        next.actions = next.actions
            .map(action => {
                const found = [action.op.operationId, action.op.functionName, action.Name].map(key => key && actionOptions[key]).find(Boolean);
                return found ? { ...action, label: found.label ?? action.label, hidden: found.hidden ?? false } : action;
            })
            .map(action => ({ ...action, fields: action.fields && options.fields ? apply(action.fields) : action.fields }));

        if (options.permissions) {
            const { actions: actionPermissions = {}, ...crud } = options.permissions;
            const permissions = { ...next.permissions, actions: { ...next.permissions.actions } };
            for (const [kind, value] of Object.entries(crud) as Array<[keyof typeof crud, PermissionList]>) {
                permissions[kind] = permissionList(value);
            }
            for (const [key, value] of Object.entries(actionPermissions)) {
                const action = findAction(key);
                if (action) permissions.actions[action.Name] = permissionList(value) ?? [];
                else warnings.push(`${where}.permissions.actions.${key}: no row action with that name`);
            }
            next.permissions = permissions;
        }
        return next;
    });

    // Sidebar order: listed resources first, in that order
    const position = (model: Model) => {
        const index = ui.nav.findIndex(key => resourceKeys(model).includes(key));
        return index === -1 ? ui.nav.length : index;
    };
    const ordered = updated.map((model, index) => ({ model, index })).sort((a, b) => position(a.model) - position(b.model) || a.index - b.index);
    const orderedModels = ordered.map(({ model }) => model);

    // The login form takes the field options of its resource (e.g. ui.resources.auth.fields.email)
    let designedLogin = login;
    if (login) {
        const sameKey = (model: Model | undefined) => (model ? orderedModels.find(candidate => candidate.key === model.key) ?? model : model);
        const loginModel = sameKey(login.model) ?? login.model;
        const fieldOptions = resourceOptions(login.model, ui)?.fields ?? {};
        const fields = login.fields
            .map(field => (fieldOptions[field.name] ? applyFieldOptions(field, fieldOptions[field.name], models, () => {}) : field))
            .sort(byOrder);
        designedLogin = {
            ...login,
            model: loginModel,
            fields,
            logout: login.logout && { ...login.logout, model: sameKey(login.logout.model) ?? login.logout.model },
            refresh: login.refresh && { ...login.refresh, model: sameKey(login.refresh.model) ?? login.refresh.model },
        };
    }
    return { models: orderedModels, login: designedLogin, warnings };
}

export function isHidden(model: Model, ui: Ui): boolean {
    return !!resourceOptions(model, ui)?.hidden;
}

// Readable text on a solid color: black or white depending on the color's luminance (hex colors only)
function contrastColor(color: string): string | null {
    const hex = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
    if (!hex) return null;
    const full = hex.length === 3 ? [...hex].map(c => c + c).join('') : hex;
    const [r, g, b] = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luminance > 0.4 ? '#0a0a0a' : '#fafafa';
}

function tokens(colors: Record<string, string>): string[] {
    const lines: string[] = [];
    for (const [name, value] of Object.entries(colors)) {
        lines.push(`--${kebabCase(name)}: ${value};`);
    }
    // A primary color also sets what is drawn on it and around it, unless given explicitly
    if (colors.primary) {
        if (!colors.primaryForeground && !colors['primary-foreground']) {
            const foreground = contrastColor(colors.primary);
            if (foreground) lines.push(`--primary-foreground: ${foreground};`);
        }
        if (!colors.ring) lines.push(`--ring: ${colors.primary};`);
        if (!colors.sidebarPrimary && !colors['sidebar-primary']) lines.push(`--sidebar-primary: ${colors.primary};`);
    }
    return lines;
}

/** components/api-gen/theme.css, or null when no theme option is set */
export function generateThemeCss(theme: ThemeOptions): string | null {
    const light = theme.colors ?? {};
    const dark = theme.darkColors ?? (light.primary ? { primary: light.primary } : {});
    if (Object.keys(light).length === 0 && Object.keys(dark).length === 0 && !theme.radius && !theme.font) return null;

    const lightLines = tokens(light);
    const blocks = [
        `/* Generated by api-gen-package from the "ui.theme" options. Do not edit by hand.
   The selectors outrank shadcn/ui's ":root" and ".dark", so these values win whichever CSS file loads last. */`,
    ];
    if (theme.radius) blocks.push(`:root:root {\n    --radius: ${theme.radius};\n}`);
    if (lightLines.length > 0) blocks.push(`:root:not(.dark) {\n${lightLines.map(line => `    ${line}`).join('\n')}\n}`);
    const darkLines = tokens(dark);
    if (darkLines.length > 0) blocks.push(`:root.dark {\n${darkLines.map(line => `    ${line}`).join('\n')}\n}`);
    if (theme.font) blocks.push(`.api-gen-dashboard {\n    font-family: ${theme.font};\n}`);
    return blocks.join('\n\n') + '\n';
}
