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
import { useToast } from "@/components/ui/use-toast";
${imports}

export const use${capitalizedModelName} = (enable = false, ${modelName}Id = null) => {
    const queryClient = useQueryClient();
    const [isSuccess, setIsSuccess] = React.useState(false);
    const [errorMessage, setErrorMessage] = React.useState("");
    const { toast } = useToast();

    // Queries and Mutations
`;

        methods.forEach(method => {
            if (method.startsWith('list')) {
                hookContent += `
    const { data: ${modelName}s, isLoading: allLoading, error: allFetchError, refetch } = useQuery({
        queryKey: ['${modelName}s'],
        queryFn: ${method},
        staleTime: 300000,
        enabled: !enable,
    });
                `;
            } else if (method.startsWith('retrieve')) {
                hookContent += `
    const { data: one${capitalizedModelName}, isLoading: singleLoading, error: singleFetchError } = useQuery({
        queryKey: ['view${capitalizedModelName}', ${modelName}Id],
        queryFn: () => ${method}(${modelName}Id),
        staleTime: 300000,
        enabled: enable && ${modelName}Id !== null,
    });
                `;
            } else if (method.startsWith('create')) {
                hookContent += `
    const { mutate: add${capitalizedModelName}Mutation, isPending: isAdding${capitalizedModelName} } = useMutation({
        mutationFn: (data) => ${method}(data),
        onSuccess: () => {
            queryClient.invalidateQueries(['${modelName}s']);
            toast({
                title: "${capitalizedModelName} created",
                description: "Successfully created.",
            });
            setIsSuccess(true);
        },
        onError: (error) => {
            setErrorMessage(error.message);
            toast({
                title: "Failed to create ${capitalizedModelName}",
                description: error.message,
            });
        },
    });
                `;
            } else if (method.startsWith('update')) {
                hookContent += `
    const { mutate: update${capitalizedModelName}Mutation, isPending: isUpdating${capitalizedModelName} } = useMutation({
        mutationFn: (data) => ${method}(${modelName}Id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['${modelName}s']);
            toast({
                title: "${capitalizedModelName} updated",
                description: "Successfully updated.",
            });
            setIsSuccess(true);
        },
        onError: (error) => {
            setErrorMessage(error.message);
            toast({
                title: "Failed to update ${capitalizedModelName}",
                description: error.message,
            });
        },
    });
                `;
            } else if (method.startsWith('delete')) {
                hookContent += `
    const { mutate: delete${capitalizedModelName}Mutation, isPending: isDeleting${capitalizedModelName} } = useMutation({
        mutationFn: (id) => ${method}(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['${modelName}s']);
            toast({
                title: "${capitalizedModelName} deleted",
                description: "Successfully deleted.",
            });
            setIsSuccess(true);
        },
        onError: (error) => {
            setErrorMessage(error.message);
            toast({
                title: "Failed to delete ${capitalizedModelName}",
                description: error.message,
            });
        },
    });
                `;
            }
        });

        hookContent += `
    // Functions to call the mutations
    const add${capitalizedModelName} = async (new${capitalizedModelName}) => {
        await add${capitalizedModelName}Mutation(new${capitalizedModelName});
    };

    const update${capitalizedModelName} = async (edit${capitalizedModelName}) => {
        await update${capitalizedModelName}Mutation(edit${capitalizedModelName});
    };

    const delete${capitalizedModelName} = async (id) => {
        await delete${capitalizedModelName}Mutation(id);
    };

    return {
        ${modelName}s,
        allLoading,
        allFetchError,
        one${capitalizedModelName},
        singleLoading,
        singleFetchError,
        add${capitalizedModelName},
        isAdding${capitalizedModelName},
        update${capitalizedModelName},
        isUpdating${capitalizedModelName},
        delete${capitalizedModelName},
        isDeleting${capitalizedModelName},
        isSuccess,
        errorMessage,
    };
};
        `;

        fs.writeFileSync(`${hooksFolder}/use${capitalizedModelName}.ts`, hookContent);
    }
}

module.exports = {
    generateReactQueryHooks
};
