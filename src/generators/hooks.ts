import { HEADER } from './api.ts';
import { camelCase } from '../helpers.ts';
import type { FileMap, Model, Operation } from '../model.ts';

// Path ids arrive as strings from the router; convert them to what the API function expects
function idArgument(op: Operation, variable: string): string {
    return op.pathParams[0].isNumber ? `Number(${variable})` : `String(${variable})`;
}

export const hookNames = (model: Model) => ({
    list: `use${model.PluralOrList}`,
    detail: `use${model.Singular}`,
    create: `useCreate${model.Singular}`,
    update: `useUpdate${model.Singular}`,
    delete: `useDelete${model.Singular}`,
    keys: `${camelCase(model.Singular)}Keys`,
});

function generateHook(model: Model): string {
    const { list, retrieve, create, update, delete: remove } = model.crud;
    const names = hookNames(model);
    const keys = names.keys;
    const label = model.singularLabel;
    const lower = label.toLowerCase();
    const hasMutations = !!(create || update || remove);
    const listHasQuery = !!(list && list.queryParams.length > 0);

    const parts: string[] = [];

    parts.push(`export const ${keys} = {
    all: [${JSON.stringify(model.name)}] as const,
    list: (query?: unknown) => [...${keys}.all, "list", query ?? {}] as const,
    detail: (id: string | number) => [...${keys}.all, "detail", String(id)] as const,
};`);

    if (list) {
        const queryArg = listHasQuery ? `query?: Parameters<typeof api.${list.functionName}>[0], ` : '';
        parts.push(`/** ${list.method.toUpperCase()} ${list.path} */
export const ${names.list} = (${queryArg}options: { enabled?: boolean } = {}) =>
    useQuery({
        queryKey: ${keys}.list(${listHasQuery ? 'query' : ''}),
        queryFn: () => api.${list.functionName}(${listHasQuery ? 'query' : ''}),
        placeholderData: keepPreviousData,
        enabled: options.enabled ?? true,
    });`);
    }

    if (retrieve) {
        parts.push(`/** ${retrieve.method.toUpperCase()} ${retrieve.path} */
export const ${names.detail} = (id: string | number | null | undefined) =>
    useQuery({
        queryKey: ${keys}.detail(id ?? ""),
        queryFn: () => api.${retrieve.functionName}(${idArgument(retrieve, 'id')}),
        enabled: id !== null && id !== undefined && id !== "",
    });`);
    }

    const mutationHook = ({ name, op, signature, variables, call, past, verb }: {
        name: string;
        op: Operation;
        signature: string;
        variables: string;
        call: string;
        past: string;
        verb: string;
    }) => `/** ${op.method.toUpperCase()} ${op.path} */
export const ${name} = (${signature}) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (${variables}) => ${call},
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ${keys}.all });
            toast.success(${JSON.stringify(`${label} ${past}`)});
        },
        onError: (error: Error) => {
            toast.error(${JSON.stringify(`Failed to ${verb} ${lower}`)}, { description: error.message });
        },
    });
};`;

    if (create) {
        parts.push(mutationHook({
            name: names.create,
            op: create,
            signature: '',
            variables: `data: Parameters<typeof api.${create.functionName}>[0]`,
            call: `api.${create.functionName}(data)`,
            past: 'created',
            verb: 'create',
        }));
    }
    if (update) {
        parts.push(mutationHook({
            name: names.update,
            op: update,
            signature: 'id: string | number',
            variables: `data: Parameters<typeof api.${update.functionName}>[1]`,
            call: `api.${update.functionName}(${idArgument(update, 'id')}, data)`,
            past: 'updated',
            verb: 'update',
        }));
    }
    if (remove) {
        parts.push(mutationHook({
            name: names.delete,
            op: remove,
            signature: '',
            variables: 'id: string | number',
            call: `api.${remove.functionName}(${idArgument(remove, 'id')})`,
            past: 'deleted',
            verb: 'delete',
        }));
    }

    const queryImports = [
        list && 'keepPreviousData',
        hasMutations && 'useMutation',
        (list || retrieve) && 'useQuery',
        hasMutations && 'useQueryClient',
    ].filter(Boolean);

    return `"use client";
${HEADER}import { ${queryImports.join(', ')} } from "@tanstack/react-query";${hasMutations ? `
import { toast } from "sonner";` : ''}
import * as api from "../api/${model.name}";

${parts.join('\n\n')}
`;
}

// hooks/use<Resources>.ts for every model with at least one CRUD operation
export function generateReactQueryHooks(models: Model[]): FileMap {
    const files: FileMap = {};
    for (const model of models) {
        if (Object.keys(model.crud).length === 0) continue;
        files[`hooks/use${model.Plural}.ts`] = generateHook(model);
    }
    return files;
}

