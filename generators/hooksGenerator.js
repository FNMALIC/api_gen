const { HEADER } = require('./apiGenerator');

// Path ids arrive as strings from the router; convert them to what the API function expects
function idArgument(op, variable) {
    return op.pathParams[0].isNumber ? `Number(${variable})` : `String(${variable})`;
}

function generateHook(model) {
    const { name, Name, listVar } = model;
    const { list, retrieve, create, update, delete: remove } = model.crud;
    const label = Name;
    const idVar = `${name}Id`;
    const queryKey = `${name}QueryKey`;
    const hasMutations = !!(create || update || remove);

    const parts = [];
    const returned = [];

    if (list) {
        parts.push(`
    const { data: ${listVar}, isLoading: allLoading, error: allFetchError, refetch } = useQuery({
        queryKey: ${queryKey},
        queryFn: () => api.${list.functionName}(),
        staleTime: 300000,
        enabled: !enable,
    });`);
        returned.push(listVar, 'allLoading', 'allFetchError', 'refetch');
    }

    if (retrieve) {
        parts.push(`
    const { data: one${Name}, isLoading: singleLoading, error: singleFetchError } = useQuery({
        queryKey: [...${queryKey}, ${idVar}],
        queryFn: () => api.${retrieve.functionName}(${idArgument(retrieve, idVar)}),
        staleTime: 300000,
        enabled: enable && ${idVar} !== null,
    });`);
        returned.push(`one${Name}`, 'singleLoading', 'singleFetchError');
    }

    const mutation = (op, { verb, past, mutationVar, pendingVar, wrapper, param, call }) => {
        parts.push(`
    const { mutate: ${mutationVar}, isPending: ${pendingVar} } = useMutation({
        mutationFn: (${param}) => ${call},
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ${queryKey} });
            toast.success("${label} ${past}", { description: "Successfully ${past}." });
            setIsSuccess(true);
        },
        onError: onError("${verb}"),
    });
    const ${wrapper.name} = (${wrapper.param}) => ${mutationVar}(${wrapper.arg});`);
        returned.push(wrapper.name, pendingVar);
    };

    if (create) {
        mutation(create, {
            verb: 'create',
            past: 'created',
            mutationVar: `add${Name}Mutation`,
            pendingVar: `isAdding${Name}`,
            param: `data: Parameters<typeof api.${create.functionName}>[0]`,
            call: `api.${create.functionName}(data)`,
            wrapper: { name: `add${Name}`, param: `data: Parameters<typeof api.${create.functionName}>[0]`, arg: 'data' },
        });
    }
    if (update) {
        mutation(update, {
            verb: 'update',
            past: 'updated',
            mutationVar: `update${Name}Mutation`,
            pendingVar: `isUpdating${Name}`,
            param: `data: Parameters<typeof api.${update.functionName}>[1]`,
            call: `api.${update.functionName}(${idArgument(update, idVar)}, data)`,
            wrapper: { name: `update${Name}`, param: `data: Parameters<typeof api.${update.functionName}>[1]`, arg: 'data' },
        });
    }
    if (remove) {
        mutation(remove, {
            verb: 'delete',
            past: 'deleted',
            mutationVar: `delete${Name}Mutation`,
            pendingVar: `isDeleting${Name}`,
            param: 'id: string | number',
            call: `api.${remove.functionName}(${idArgument(remove, 'id')})`,
            wrapper: { name: `delete${Name}`, param: 'id: string | number', arg: 'id' },
        });
    }

    const hasQueries = !!(list || retrieve);
    const reactImports = [hasQueries && 'useQuery', hasMutations && 'useMutation', hasMutations && 'useQueryClient'].filter(Boolean);
    // Unused parameters are prefixed with "_" so strict tsconfigs (noUnusedParameters) accept them
    const enableParam = hasQueries ? 'enable' : '_enable';
    const idParam = retrieve || update ? idVar : `_${idVar}`;

    return `"use client";
${HEADER}${hasMutations ? 'import { useState } from "react";\n' : ''}import { ${reactImports.join(', ')} } from "@tanstack/react-query";${hasMutations ? `
import { toast } from "sonner";` : ''}
import * as api from "../api/${name}";

export const ${queryKey} = [${JSON.stringify(name)}] as const;

export const use${Name} = (${enableParam} = false, ${idParam}: string | number | null = null) => {${hasMutations ? `
    const queryClient = useQueryClient();
    const [isSuccess, setIsSuccess] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");

    const onError = (action: string) => (error: Error) => {
        setErrorMessage(error.message);
        toast.error(\`Failed to \${action} ${label}\`, { description: error.message });
    };` : ''}
${parts.join('\n')}

    return {
        ${[...returned, ...(hasMutations ? ['isSuccess', 'errorMessage'] : [])].join(',\n        ')},
    };
};
`;
}

// hooks/use<Model>.ts for every model with at least one CRUD operation
function generateReactQueryHooks(models) {
    const files = {};
    for (const model of models) {
        if (Object.keys(model.crud).length === 0) continue;
        files[`hooks/use${model.Name}.ts`] = generateHook(model);
    }
    return files;
}

module.exports = {
    generateReactQueryHooks,
};
