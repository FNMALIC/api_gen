const fs = require('fs');
const { capitalizeFirstLetter } = require('../utils/helpers');

function generateReactQueryHooks(methodsByModel, hooksFolder) {
    for (const [modelName, methods] of Object.entries(methodsByModel)) {
        const capitalizedModelName = capitalizeFirstLetter(modelName);

        // Import necessary modules, including react-toastify
        let imports = methods.map(method => `import { ${method} } from "../api/${modelName}";`).join('\n');
        
        let hookContent = `
            "use client";
            import React from "react";
            import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
            import { toast } from "react-toastify";
            import 'react-toastify/dist/ReactToastify.css';
            ${imports}

            export const use${capitalizedModelName} = (params, enable = false, ${modelName}Id = null) => {
                const queryClient = useQueryClient();
                const [isSuccess, setIsSuccess] = React.useState(false);
                const [errorMessage, setErrorMessage] = React.useState("");

                let hooks = {};

                // Function to display success notification
                const notifySuccess = (message) => toast.success(message);

                // Function to display error notification
                const notifyError = (message) => toast.error(message);
        `;

        methods.forEach(method => {
            if (method.startsWith('list')) {
                hookContent += `
                hooks['list'] = useQuery({
                    queryKey: ['${modelName}s'],
                    queryFn: ${method},
                    enabled: !enable,
                    staleTime: 300000,
                });
                `;
            } else if (method.startsWith('retrieve')) {
                hookContent += `
                hooks['retrieve'] = useQuery({
                    queryKey: ['view${capitalizedModelName}', ${modelName}Id],
                    queryFn: () => ${method}(${modelName}Id),
                    enabled: enable && ${modelName}Id !== null,
                    staleTime: 300000,
                });
                `;
            } else if (method.startsWith('create')) {
                hookContent += `
                hooks['create'] = useMutation({
                    mutationFn: (data) => ${method}(data),
                    onSuccess: (res) => {
                        queryClient.invalidateQueries({ queryKey: ['${modelName}s'] });
                        setIsSuccess(true);
                        notifySuccess('${capitalizedModelName} created successfully!');
                    },
                    onError: (err) => {
                        setErrorMessage(err.message);
                        setIsSuccess(false);
                        notifyError('Failed to create ${capitalizedModelName}: ' + err.message);
                    },
                });
                `;
            } else if (method.startsWith('update')) {
                hookContent += `
                hooks['update'] = useMutation({
                    mutationFn: (data) => ${method}(${modelName}Id, data),
                    onSuccess: (res) => {
                        queryClient.invalidateQueries({ queryKey: ['${modelName}s'] });
                        setIsSuccess(true);
                        notifySuccess('${capitalizedModelName} updated successfully!');
                    },
                    onError: (err) => {
                        setErrorMessage(err.message);
                        setIsSuccess(false);
                        notifyError('Failed to update ${capitalizedModelName}: ' + err.message);
                    },
                });
                `;
            } else if (method.startsWith('delete')) {
                hookContent += `
                hooks['delete'] = useMutation({
                    mutationFn: (id) => ${method}(id),
                    onSuccess: (res) => {
                        queryClient.invalidateQueries({ queryKey: ['${modelName}s'] });
                        setIsSuccess(true);
                        notifySuccess('${capitalizedModelName} deleted successfully!');
                    },
                    onError: (err) => {
                        setErrorMessage(err.message);
                        setIsSuccess(false);
                        notifyError('Failed to delete ${capitalizedModelName}: ' + err.message);
                    },
                });
                `;
            }
        });

        hookContent += `
            return { ...hooks, isSuccess, errorMessage };
        };
        `;

        fs.writeFileSync(`${hooksFolder}/use${capitalizedModelName}.ts`, hookContent);
    }
}

module.exports = {
    generateReactQueryHooks
};
