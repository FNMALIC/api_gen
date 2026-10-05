// User-facing options for the generated back-office: wording, language, theme and per-resource tweaks
import { kebabCase } from './helpers.ts';
import type { Model } from './model.ts';

/** Every string the generated UI shows. {placeholders} are filled in when generating. */
export interface Strings {
    addNew: string;
    /** {plural} */
    searchPlaceholder: string;
    loading: string;
    /** {plural} */
    loadFailed: string;
    loadOneFailed: string;
    noResults: string;
    /** {plural} */
    empty: string;
    /** {plural} */
    manage: string;
    actions: string;
    edit: string;
    delete: string;
    /** {singular} */
    deleteTitle: string;
    deleteDescription: string;
    /** {action} */
    actionConfirm: string;
    cancel: string;
    confirm: string;
    previous: string;
    next: string;
    /** {page} */
    page: string;
    /** {page} {count} */
    pageOf: string;
    create: string;
    save: string;
    saving: string;
    /** {singular} */
    createTitle: string;
    /** {singular} */
    editTitle: string;
    /** {Singular} */
    created: string;
    /** {Singular} */
    updated: string;
    /** {Singular} */
    deleted: string;
    /** {singular} */
    createFailed: string;
    /** {singular} */
    updateFailed: string;
    /** {singular} */
    deleteFailed: string;
    /** {action} */
    actionDone: string;
    /** {action} */
    actionFailed: string;
    /** {label} */
    required: string;
    /** {label} */
    notANumber: string;
    invalidEmail: string;
    invalidUrl: string;
    /** {label} (lowercase) */
    selectAtLeastOne: string;
    /** {label} (lowercase) */
    addAtLeastOne: string;
    invalidJson: string;
    /** {label} (lowercase) */
    selectPlaceholder: string;
    listPlaceholder: string;
    remove: string;
    yes: string;
    no: string;
    signIn: string;
    /** {title} */
    signInTitle: string;
    signingIn: string;
    signInFailed: string;
    signOut: string;
    toggleTheme: string;
}

const EN: Strings = {
    addNew: 'Add new',
    searchPlaceholder: 'Search {plural}...',
    loading: 'Loading...',
    loadFailed: 'Failed to load {plural}',
    loadOneFailed: 'Failed to load',
    noResults: 'No results.',
    empty: 'No {plural} yet.',
    manage: 'Manage your {plural}.',
    actions: 'Actions',
    edit: 'Edit',
    delete: 'Delete',
    deleteTitle: 'Delete this {singular}?',
    deleteDescription: 'This action cannot be undone.',
    actionConfirm: '{action}?',
    cancel: 'Cancel',
    confirm: 'Confirm',
    previous: 'Previous',
    next: 'Next',
    page: 'Page {page}',
    pageOf: 'Page {page} of {count}',
    create: 'Create',
    save: 'Save',
    saving: 'Saving...',
    createTitle: 'Create {singular}',
    editTitle: 'Edit {singular}',
    created: '{Singular} created',
    updated: '{Singular} updated',
    deleted: '{Singular} deleted',
    createFailed: 'Failed to create {singular}',
    updateFailed: 'Failed to update {singular}',
    deleteFailed: 'Failed to delete {singular}',
    actionDone: '{action}: done',
    actionFailed: '{action} failed',
    required: '{label} is required',
    notANumber: '{label} must be a number',
    invalidEmail: 'Invalid email',
    invalidUrl: 'Invalid URL',
    selectAtLeastOne: 'Select at least one {label}',
    addAtLeastOne: 'Add at least one {label}',
    invalidJson: 'Invalid JSON',
    selectPlaceholder: 'Select {label}',
    listPlaceholder: 'Type and press Enter',
    remove: 'Remove',
    yes: 'Yes',
    no: 'No',
    signIn: 'Sign in',
    signInTitle: 'Sign in to {title}',
    signingIn: 'Signing in...',
    signInFailed: 'Sign in failed',
    signOut: 'Sign out',
    toggleTheme: 'Toggle dark mode',
};

const FR: Strings = {
    addNew: 'Ajouter',
    searchPlaceholder: 'Rechercher des {plural}...',
    loading: 'Chargement...',
    loadFailed: 'Impossible de charger les {plural}',
    loadOneFailed: 'Impossible de charger',
    noResults: 'Aucun résultat.',
    empty: 'Aucun élément pour le moment.',
    manage: 'Gérez vos {plural}.',
    actions: 'Actions',
    edit: 'Modifier',
    delete: 'Supprimer',
    deleteTitle: 'Supprimer cet élément ?',
    deleteDescription: 'Cette action est irréversible.',
    actionConfirm: '{action} ?',
    cancel: 'Annuler',
    confirm: 'Confirmer',
    previous: 'Précédent',
    next: 'Suivant',
    page: 'Page {page}',
    pageOf: 'Page {page} sur {count}',
    create: 'Créer',
    save: 'Enregistrer',
    saving: 'Enregistrement...',
    createTitle: 'Créer : {singular}',
    editTitle: 'Modifier : {singular}',
    created: '{Singular} : créé',
    updated: '{Singular} : modifié',
    deleted: '{Singular} : supprimé',
    createFailed: 'Échec de la création',
    updateFailed: 'Échec de la modification',
    deleteFailed: 'Échec de la suppression',
    actionDone: '{action} : effectué',
    actionFailed: '{action} : échec',
    required: '{label} est obligatoire',
    notANumber: '{label} doit être un nombre',
    invalidEmail: 'Adresse e-mail invalide',
    invalidUrl: 'URL invalide',
    selectAtLeastOne: 'Choisissez au moins une option ({label})',
    addAtLeastOne: 'Ajoutez au moins une valeur ({label})',
    invalidJson: 'JSON invalide',
    selectPlaceholder: 'Choisir ({label})',
    listPlaceholder: 'Saisissez puis appuyez sur Entrée',
    remove: 'Retirer',
    yes: 'Oui',
    no: 'Non',
    signIn: 'Se connecter',
    signInTitle: 'Connexion à {title}',
    signingIn: 'Connexion...',
    signInFailed: 'Échec de la connexion',
    signOut: 'Se déconnecter',
    toggleTheme: 'Basculer le thème sombre',
};

export const LOCALES = { en: EN, fr: FR } as const;
export type Locale = keyof typeof LOCALES;

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

export interface ResourceOptions {
    /** Plural label, e.g. "Utilisateurs" */
    label?: string;
    /** Singular label, e.g. "Utilisateur" */
    singularLabel?: string;
    /** Leave this resource out of the dashboard (API functions and hooks are still generated) */
    hidden?: boolean;
}

export interface UiOptions {
    /** Shown in the sidebar and on the login page (default: the document's info.title) */
    title?: string;
    /** Built-in wording: "en" (default) or "fr" */
    locale?: Locale;
    /** Override any UI string, e.g. { addNew: "New" } */
    labels?: Partial<Strings>;
    /** Rows per page (default 10) */
    pageSize?: number;
    /** Shortcut for theme.colors.primary */
    primaryColor?: string;
    theme?: ThemeOptions;
    /** Show a light/dark switch in the sidebar (default true) */
    darkModeToggle?: boolean;
    /** Per-resource labels and visibility, keyed by resource name as in the URL ("users", "product-categories") */
    resources?: Record<string, ResourceOptions>;
}

export interface Ui {
    title: string;
    strings: Strings;
    pageSize: number;
    darkModeToggle: boolean;
    theme: ThemeOptions;
    resources: Record<string, ResourceOptions>;
}

export function resolveUi(options: UiOptions | undefined, documentTitle: string | undefined): Ui {
    const locale = options?.locale ?? 'en';
    if (!LOCALES[locale]) throw new Error(`Unknown locale "${locale}". Use: ${Object.keys(LOCALES).join(', ')}`);
    const theme: ThemeOptions = { ...options?.theme };
    if (options?.primaryColor) theme.colors = { ...theme.colors, primary: options.primaryColor };
    const pageSize = options?.pageSize ?? 10;
    if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error(`pageSize must be a positive whole number, got ${pageSize}`);
    return {
        title: options?.title || documentTitle || 'Admin',
        strings: { ...LOCALES[locale], ...options?.labels },
        pageSize,
        darkModeToggle: options?.darkModeToggle ?? true,
        theme,
        resources: options?.resources ?? {},
    };
}

/** Fill {placeholders} in a UI string */
export function fill(text: string, values: Record<string, string | number>): string {
    return text.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

/** Apply per-resource label overrides and drop hidden resources from the dashboard */
export function applyResourceOptions(models: Model[], ui: Ui): Model[] {
    return models.map(model => {
        const options = ui.resources[model.key] ?? ui.resources[model.slug] ?? ui.resources[model.name];
        if (!options) return model;
        return {
            ...model,
            pluralLabel: options.label ?? model.pluralLabel,
            singularLabel: options.singularLabel ?? model.singularLabel,
        };
    });
}

export function isHidden(model: Model, ui: Ui): boolean {
    const options = ui.resources[model.key] ?? ui.resources[model.slug] ?? ui.resources[model.name];
    return !!options?.hidden;
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

    const root = [...tokens(light), ...(theme.radius ? [`--radius: ${theme.radius};`] : [])];
    const blocks = [`/* Generated by api-gen-package from the "ui.theme" options. Do not edit by hand. */`];
    if (root.length > 0) blocks.push(`:root {\n${root.map(line => `    ${line}`).join('\n')}\n}`);
    const darkLines = tokens(dark);
    if (darkLines.length > 0) blocks.push(`.dark {\n${darkLines.map(line => `    ${line}`).join('\n')}\n}`);
    if (theme.font) blocks.push(`.api-gen-dashboard {\n    font-family: ${theme.font};\n}`);
    return blocks.join('\n\n') + '\n';
}
