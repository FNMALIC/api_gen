const fs = require('fs');

// Ensure directory exists
function ensureDirSync(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

// Capitalize first letter of a string
function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

// Helper function to map Swagger types to TypeScript types
function mapTypeToTS(type) {
    switch (type) {
        case 'integer':
            return 'number';
        case 'boolean':
            return 'boolean';
        case 'string':
            return 'string';
        case 'array':
            return 'any[]'; 
        default:
            return 'any';
    }
}

module.exports = {
    ensureDirSync,
    capitalizeFirstLetter,
    mapTypeToTS
};
