const fs = require('fs');
const { mapTypeToTS, capitalizeFirstLetter } = require('../utils/helpers');

// Generate axios instance file
function generateAxiosInstanceFile(utilsFolder) {
    const axiosInstance = `
        import axios from 'axios';
        const instance = axios.create({
          baseURL: "/",
        });
        export default instance;
    `;
    fs.writeFileSync(`${utilsFolder}/api.ts`, axiosInstance);
}

// Generate TypeScript interfaces for API methods
function generateInterfaces(details, components, capitalizedModelName) {
    let paramsInterface = '';
    let payloadInterface = '';

    if (details.parameters && details.parameters.length > 0) {
        paramsInterface = `export interface ${capitalizedModelName}Params {\n`;
        details.parameters.forEach(param => {
            paramsInterface += `  ${param.name}: ${mapTypeToTS(param.schema.type)};\n`;
        });
        paramsInterface += '}\n\n';
    }

    if (details.requestBody && details.requestBody.content) {
        const schema = details.requestBody.content[Object.keys(details.requestBody.content)[0]].schema;
        if (schema && schema.$ref) {
            const refName = schema.$ref.split('/').pop();
            if (components.schemas[refName]) {
                payloadInterface = `export interface ${capitalizedModelName}Payload {\n`;
                for (const [propName, propSchema] of Object.entries(components.schemas[refName].properties)) {
                    payloadInterface += `  ${propName}: ${mapTypeToTS(propSchema.type)};\n`;
                }
                payloadInterface += '}\n\n';
            }
        }
    }

    return { paramsInterface, payloadInterface };
}

// Generate API method functions for each model and return a list of methods created for each model
function generateAPIFunctions(paths, components) {
    const apiMethodsByModel = {};
    const interfaces = {};
    const methodsByModel = {};

    for (const [path, methods] of Object.entries(paths)) {
        const modelMatch = path.match(/^\/api\/([^/]+)/);
        if (modelMatch) {
            const modelName = modelMatch[1];
            const capitalizedModelName = capitalizeFirstLetter(modelName);

            if (!apiMethodsByModel[modelName]) {
                apiMethodsByModel[modelName] = `import instance from "../utils/api";\n`;
                apiMethodsByModel[modelName] += `import { ${capitalizedModelName}Params, ${capitalizedModelName}Payload } from "../types/${modelName}";\n\n`;
            }

            if (!methodsByModel[modelName]) {
                methodsByModel[modelName] = [];
            }

            for (const [method, details] of Object.entries(methods)) {
                const operationId = details.operationId || method + capitalizeFirstLetter(path.split('/').pop());
                const functionName = `${operationId}${capitalizedModelName}`;
                const url = path.replace(/{([^}]+)}/g, '${params.$1}');

                const { paramsInterface, payloadInterface } = generateInterfaces(details, components, capitalizedModelName);

                interfaces[modelName] = (interfaces[modelName] || '') + paramsInterface + payloadInterface;

                apiMethodsByModel[modelName] += `
                // ${details.operationId || method}
                export const ${functionName} = async (params: ${capitalizedModelName}Params, payload: ${capitalizedModelName}Payload = null) => {
                    const url = \`${url}\`;
                    return await instance.${method}(url, payload)
                        .then(response => response.data)
                        .catch(error => error);
                };
                `;

                methodsByModel[modelName].push(functionName);
            }
        }
    }

    return { apiMethodsByModel, interfaces, methodsByModel };
}

// Write API and interface files
function writeAPIFiles(apiMethodsByModel, interfaces, apiFolder, typesFolder) {
    for (const [modelName, fileContent] of Object.entries(apiMethodsByModel)) {
        fs.writeFileSync(`${apiFolder}/${modelName}.ts`, fileContent);
    }
    for (const [modelName, fileContent] of Object.entries(interfaces)) {
        fs.writeFileSync(`${typesFolder}/${modelName}.ts`, fileContent);
    }
}

module.exports = {
    generateAxiosInstanceFile,
    generateAPIFunctions,
    writeAPIFiles
};
