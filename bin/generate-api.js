#!/usr/bin/env node
const fs = require('fs');
const yaml = require('js-yaml');
const swaggerParser = require('swagger-parser');
const path = require('path');

const inputFilePath = process.argv[2] || './schema.yaml'; 
const outputDir = process.argv[3] || './src'; 

// Ensure directory exists
function ensureDirSync(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}
// Function to generate CRUD dashboard for each model
function generateCRUDDashboard(methodsByModel, components, outputDir) {
    const dashboardFolder = `${outputDir}/pages`;
    ensureDirSync(dashboardFolder);

    for (const [modelName, methods] of Object.entries(methodsByModel)) {
        const capitalizedModelName = capitalizeFirstLetter(modelName);
        const modelInterface = components.schemas[capitalizedModelName];

        if (!modelInterface) {
            console.warn(`No interface found for ${capitalizedModelName}`);
            continue;
        }

        let formFields = '';
        let tableColumns = '';

        // Generate form fields based on the model interface
        for (const [propName, propSchema] of Object.entries(modelInterface.properties)) {
            const fieldType = mapTypeToTS(propSchema.type);
            formFields += `
                <Form.Item name="${propName}" label="${capitalizeFirstLetter(propName)}">
                    <Input />
                </Form.Item>
            `;

            // Generate table columns
            tableColumns += `
                {
                    title: "${capitalizeFirstLetter(propName)}",
                    dataIndex: "${propName}",
                    key: "${propName}"
                },
            `;
        }

        // Create the dashboard content
        const dashboardContent = `
            import React from "react";
            import { use${capitalizedModelName} } from "../hooks/use-${modelName}";
            import { Button, Table, Modal, Form, Input } from "antd";

            export const ${capitalizedModelName}Dashboard = () => {
                const { hooks } = use${capitalizedModelName}(false);
                const [isModalVisible, setIsModalVisible] = React.useState(false);
                const [editItem, setEditItem] = React.useState(null);

                const showModal = () => setIsModalVisible(true);
                const handleCancel = () => setIsModalVisible(false);

                const handleCreateOrUpdate = (values) => {
                    if (editItem) {
                        hooks.update.mutate(values);
                    } else {
                        hooks.create.mutate(values);
                    }
                    setIsModalVisible(false);
                };

                return (
                    <div>
                        <Button type="primary" onClick={showModal}>Add ${capitalizedModelName}</Button>
                        <Table
                            dataSource={hooks.list.data}
                            loading={hooks.list.isLoading}
                            columns={[
                                ${tableColumns}
                                {
                                    title: "Action",
                                    key: "action",
                                    render: (text, record) => (
                                        <span>
                                            <Button type="link" onClick={() => { setEditItem(record); showModal(); }}>Edit</Button>
                                            <Button type="link" danger onClick={() => hooks.delete.mutate(record.id)}>Delete</Button>
                                        </span>
                                    )
                                }
                            ]}
                        />

                        <Modal
                            title={editItem ? "Edit ${capitalizedModelName}" : "Add ${capitalizedModelName}"}
                            visible={isModalVisible}
                            onCancel={handleCancel}
                            footer={null}
                        >
                            <Form
                                initialValues={editItem || {}}
                                onFinish={handleCreateOrUpdate}
                            >
                                ${formFields}
                                <Form.Item>
                                    <Button type="primary" htmlType="submit">
                                        {editItem ? "Update" : "Create"}
                                    </Button>
                                </Form.Item>
                            </Form>
                        </Modal>
                    </div>
                );
            };
        `;

        // Write the dashboard file
        const filePath = `${dashboardFolder}/${capitalizedModelName}Dashboard.tsx`;
        fs.writeFileSync(filePath, dashboardContent);

        console.log(`Generated ${capitalizedModelName}Dashboard at ${filePath}`);
    }
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
            return 'any[]'; // or handle array types more specifically
        default:
            return 'any'; // fallback type
    }
}

// Capitalize first letter of a string
function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

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

                // Add method to the list of methods for this model
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


function generateReactQueryHooks(methodsByModel, hooksFolder) {
    for (const [modelName, methods] of Object.entries(methodsByModel)) {
        const capitalizedModelName = capitalizeFirstLetter(modelName);

        // Import only the necessary methods
        let imports = methods.map(method => `import { ${method} } from "../api/${modelName}";`).join('\n');
        
        // Dynamically create hooks for the model
        let hookContent = `
            "use client";
            import React from "react";
            import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
            ${imports}

            export const use${capitalizedModelName} = (params, enable = false, ${modelName}Id = null) => {
                const queryClient = useQueryClient();
                const [isSuccess, setIsSuccess] = React.useState(false);
                const [errorMessage, setErrorMessage] = React.useState("");

                let hooks = {};
        `;

        methods.forEach(method => {
            if (method.startsWith('list')) {
                hookContent += `
                // Fetch all ${modelName}s
                hooks['list'] = useQuery({
                    queryKey: ['${modelName}s'],
                    queryFn: ${method},
                    enabled: !enable,
                    staleTime: 300000,
                });
                `;
            } else if (method.startsWith('retrieve')) {
                hookContent += `
                // Fetch a single ${modelName} by ID
                hooks['retrieve'] = useQuery({
                    queryKey: ['view${capitalizedModelName}', ${modelName}Id],
                    queryFn: () => ${method}(${modelName}Id),
                    enabled: enable && ${modelName}Id !== null,
                    staleTime: 300000,
                });
                `;
            } else if (method.startsWith('create')) {
                hookContent += `
                // Mutation for creating ${modelName}
                hooks['create'] = useMutation(${method}, {
                    onSuccess: () => queryClient.invalidateQueries(['${modelName}s']),
                    onError: (error) => setErrorMessage(error.message),
                });
                `;
            } else if (method.startsWith('update')) {
                hookContent += `
                // Mutation for updating ${modelName}
                hooks['update'] = useMutation(${method}, {
                    onSuccess: () => queryClient.invalidateQueries(['${modelName}s']),
                    onError: (error) => setErrorMessage(error.message),
                });
                `;
            } else if (method.startsWith('destroy') || method.startsWith('delete')) {
                hookContent += `
                // Mutation for deleting ${modelName}
                hooks['delete'] = useMutation(${method}, {
                    onSuccess: () => queryClient.invalidateQueries(['${modelName}s']),
                    onError: (error) => setErrorMessage(error.message),
                });
                `;
            }
        });

        hookContent += `
                return {
                    hooks,
                    isSuccess,
                    errorMessage
                };
            };
        `;

        fs.writeFileSync(`${hooksFolder}/use-${modelName}.ts`, hookContent);
    }
}


// Main function to generate everything
async function generateAPI() {
    try {
        const fileContents = fs.readFileSync(inputFilePath, 'utf8');
        const swaggerDoc = yaml.load(fileContents);
        const parsedSchema = await swaggerParser.validate(swaggerDoc);
        const paths = parsedSchema.paths;
        const components = parsedSchema.components || {};

        const apiFolder = `${outputDir}/api`;
        const utilsFolder = `${outputDir}/utils`;
        const typesFolder = `${outputDir}/types`;
        const hooksFolder = `${outputDir}/hooks`;
        const pagesFolder = `${outputDir}/pages`;

        ensureDirSync(apiFolder);
        ensureDirSync(utilsFolder);
        ensureDirSync(typesFolder);
        ensureDirSync(hooksFolder);
        ensureDirSync(pagesFolder);

        generateAxiosInstanceFile(utilsFolder);
        const { apiMethodsByModel, interfaces, methodsByModel } = generateAPIFunctions(paths, components);
        writeAPIFiles(apiMethodsByModel, interfaces, apiFolder, typesFolder);
        generateReactQueryHooks(methodsByModel, hooksFolder);
        generateCRUDDashboard(methodsByModel, components, outputDir);

        console.log("API, TypeScript interfaces, and hooks generated successfully!");
    } catch (error) {
        console.error("Error generating files:", error);
    }
}

generateAPI();
