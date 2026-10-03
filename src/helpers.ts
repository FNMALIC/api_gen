import type { Model, RouterName, TemplateKind, Templates } from './model.ts';

// Capitalize first letter of a string
export function capitalizeFirstLetter(string: string): string {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

// Split "user-profiles", "user_profiles", "UserProfiles" or "user.profiles" into words
export function words(string: string): string[] {
    return String(string)
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .split(/[^A-Za-z0-9]+/)
        .filter(Boolean);
}

// "user-profiles" -> "userProfiles" (always a valid identifier)
export function camelCase(string: string): string {
    const result = words(string)
        .map((word, index) => (index === 0 ? word.charAt(0).toLowerCase() + word.slice(1) : capitalizeFirstLetter(word)))
        .join('');
    if (!result) return '_';
    return /^[0-9]/.test(result) ? `_${result}` : result;
}

// "user-profiles" -> "UserProfiles"
export function pascalCase(string: string): string {
    return capitalizeFirstLetter(camelCase(string));
}

// "userProfiles" -> "user-profiles"
export function kebabCase(string: string): string {
    return words(string).map(word => word.toLowerCase()).join('-');
}

// "firstName" / "first_name" -> "First Name"
export function humanize(string: string): string {
    return words(string).map(capitalizeFirstLetter).join(' ');
}

export const RESERVED_WORDS = new Set([
    'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else',
    'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof',
    'new', 'null', 'return', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var', 'void',
    'while', 'with', 'yield', 'let', 'static', 'implements', 'interface', 'package', 'private', 'protected',
    'public', 'await', 'async',
]);

function isIdentifier(string: string): boolean {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(string);
}

// Make a string usable as a variable or parameter name
export function safeIdentifier(string: string): string {
    const identifier = camelCase(string);
    return RESERVED_WORDS.has(identifier) ? `${identifier}_` : identifier;
}

// Object key as written in TypeScript: bare when possible, quoted otherwise
export function propertyKey(name: string): string {
    return isIdentifier(name) ? name : JSON.stringify(name);
}

const IRREGULAR: Record<string, string> = {
    person: 'people', child: 'children', man: 'men', woman: 'women', mouse: 'mice', goose: 'geese', foot: 'feet', tooth: 'teeth',
};
const UNCOUNTABLE = new Set(['data', 'metadata', 'media', 'news', 'series', 'species', 'information', 'equipment', 'feedback', 'health', 'auth', 'staff']);

function matchCase(text: string, sample: string): string {
    return sample === sample.toUpperCase() && /[A-Z]/.test(sample) ? text.toUpperCase() : text;
}

function singularWord(word: string): string {
    const lower = word.toLowerCase();
    if (UNCOUNTABLE.has(lower)) return word;
    const irregular = Object.entries(IRREGULAR).find(([, plural]) => plural === lower);
    if (irregular) return matchCase(irregular[0], word);
    if (/[^aeiou]ies$/i.test(word)) return word.slice(0, -3) + matchCase('y', word.slice(-3));
    if (/(ss|us|is)$/i.test(word)) return word;
    if (/(s|x|z|ch|sh)es$/i.test(word)) return word.slice(0, -2);
    if (/s$/i.test(word)) return word.slice(0, -1);
    return word;
}

function pluralWord(word: string): string {
    const lower = word.toLowerCase();
    if (UNCOUNTABLE.has(lower)) return word;
    if (IRREGULAR[lower]) return matchCase(IRREGULAR[lower], word);
    if (/[^aeiou]y$/i.test(word)) return word.slice(0, -1) + matchCase('ies', word.slice(-1));
    if (/(s|x|z|ch|sh)$/i.test(word)) return word + matchCase('es', word.slice(-1));
    return word + matchCase('s', word.slice(-1));
}

// Inflect the last word: "product-categories" -> "product category"; "user" -> "users"
export function singularize(string: string): string {
    const parts = words(string);
    if (parts.length === 0) return string;
    parts[parts.length - 1] = singularWord(parts[parts.length - 1]);
    return parts.join(' ');
}

export function pluralize(string: string): string {
    const parts = words(singularize(string));
    if (parts.length === 0) return string;
    parts[parts.length - 1] = pluralWord(parts[parts.length - 1]);
    return parts.join(' ');
}

/**
 * Let users replace generated files: templates[kind]({ model, router, defaultContent }) returns the new content,
 * or undefined/null to keep the default.
 */
export function applyTemplate(
    templates: Templates | null | undefined,
    kind: TemplateKind,
    defaultContent: string,
    context: { model: Model | null; router: RouterName }
): string {
    const template = templates?.[kind];
    if (typeof template !== 'function') return defaultContent;
    const result = template({ ...context, defaultContent });
    return typeof result === 'string' ? result : defaultContent;
}
