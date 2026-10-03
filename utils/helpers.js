// Capitalize first letter of a string
function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

// Split "user-profiles", "user_profiles", "UserProfiles" or "user.profiles" into words
function words(string) {
    return String(string)
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .split(/[^A-Za-z0-9]+/)
        .filter(Boolean);
}

// "user-profiles" -> "userProfiles" (always a valid identifier)
function camelCase(string) {
    const result = words(string)
        .map((word, index) => (index === 0 ? word.charAt(0).toLowerCase() + word.slice(1) : capitalizeFirstLetter(word)))
        .join('');
    if (!result) return '_';
    return /^[0-9]/.test(result) ? `_${result}` : result;
}

// "user-profiles" -> "UserProfiles"
function pascalCase(string) {
    return capitalizeFirstLetter(camelCase(string));
}

// "userProfiles" -> "user-profiles"
function kebabCase(string) {
    return words(string).map(word => word.toLowerCase()).join('-');
}

// "firstName" / "first_name" -> "First Name"
function humanize(string) {
    return words(string).map(capitalizeFirstLetter).join(' ');
}

const RESERVED_WORDS = new Set([
    'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else',
    'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof',
    'new', 'null', 'return', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var', 'void',
    'while', 'with', 'yield', 'let', 'static', 'implements', 'interface', 'package', 'private', 'protected',
    'public', 'await', 'async',
]);

function isIdentifier(string) {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(string);
}

// Make a string usable as a variable or parameter name
function safeIdentifier(string) {
    const identifier = camelCase(string);
    return RESERVED_WORDS.has(identifier) ? `${identifier}_` : identifier;
}

// Object key as written in TypeScript: bare when possible, quoted otherwise
function propertyKey(name) {
    return isIdentifier(name) ? name : JSON.stringify(name);
}

module.exports = {
    capitalizeFirstLetter,
    camelCase,
    pascalCase,
    kebabCase,
    humanize,
    safeIdentifier,
    propertyKey,
    RESERVED_WORDS,
};
