import { HEADER } from './api.ts';
import { hookNames } from './hooks.ts';
import {
    DIALOG_IMPORT,
    FIELDS_IMPORT,
    editable,
    generateDialogComponent,
    generateFieldsComponent,
    generateFormFile,
    generateFormPrimitives,
    type FormSpec,
} from './form.ts';
import { applyTemplate } from '../helpers.ts';
import { fill, generateThemeCss, isHidden, type Ui } from '../ui.ts';
import type { Field, FileMap, ListCapabilities, LoginInfo, Model, Operation, RouterName, TemplateKind, Templates } from '../model.ts';

// shadcn/ui components the generated dashboard imports from "@/components/ui/*". Forms, selects and dialogs are
// generated into components/api-gen/, so the dashboard works with both the Radix and the Base UI flavours of shadcn/ui.
export const SHADCN_COMPONENTS = ['button', 'card', 'table', 'input', 'textarea', 'checkbox', 'sonner'];

/** npm packages the generated code imports (besides React and the shadcn/ui components) */
export function dashboardDependencies(router: RouterName): string[] {
    return ['axios', '@tanstack/react-query', 'react-hook-form', 'zod', '@hookform/resolvers', 'sonner', ...(router === 'react-router' ? ['react-router-dom'] : [])];
}

const SESSION_IMPORT = '@/components/api-gen/session';

// Router-specific pieces; everything else in the pages is shared
export interface Router {
    directive: string;
    linkImport: string;
    link(href: string, children: string, className?: string): string;
    navigationImport(withParams: boolean): string;
    navigatorSetup: string;
    navigate(path: string): string;
    paramsSetup: string;
    /** formImport: from the create/edit pages; listFormImport: from the list page */
    files(model: Model): { list: string; create: string; edit: string; form: string; formImport: string; listFormImport: string };
    loginFiles: { page: string; form: string; formImport: string };
}

export const ROUTERS: Record<RouterName, Router> = {
    'react-router': {
        directive: '',
        linkImport: 'import { Link } from "react-router-dom";',
        link: (href, children, className) => `<Link to=${href}${className ? ` className={${className}}` : ''}>${children}</Link>`,
        navigationImport: withParams =>
            `import { ${withParams ? 'useNavigate, useParams' : 'useNavigate'} } from "react-router-dom";`,
        navigatorSetup: 'const navigate = useNavigate();',
        navigate: path => `navigate(${path})`,
        paramsSetup: 'const { id } = useParams();',
        files: model => ({
            list: `pages/${model.name}/${model.Plural}List.tsx`,
            create: `pages/${model.name}/Create${model.Singular}.tsx`,
            edit: `pages/${model.name}/Edit${model.Singular}.tsx`,
            form: `pages/${model.name}/${model.Singular}Form.tsx`,
            formImport: `./${model.Singular}Form`,
            listFormImport: `./${model.Singular}Form`,
        }),
        loginFiles: { page: 'pages/LoginPage.tsx', form: 'pages/LoginForm.tsx', formImport: './LoginForm' },
    },
    next: {
        directive: '"use client";\n',
        linkImport: 'import Link from "next/link";',
        link: (href, children, className) => `<Link href=${href}${className ? ` className={${className}}` : ''}>${children}</Link>`,
        navigationImport: withParams =>
            `import { ${withParams ? 'useParams, useRouter' : 'useRouter'} } from "next/navigation";`,
        navigatorSetup: 'const router = useRouter();',
        navigate: path => `router.push(${path})`,
        paramsSetup: 'const { id } = useParams<{ id: string }>();',
        files: model => ({
            list: `app/(dashboard)/${model.slug}/page.tsx`,
            create: `app/(dashboard)/${model.slug}/create/page.tsx`,
            edit: `app/(dashboard)/${model.slug}/[id]/page.tsx`,
            form: `app/(dashboard)/${model.slug}/${model.Singular}Form.tsx`,
            formImport: `../${model.Singular}Form`,
            listFormImport: `./${model.Singular}Form`,
        }),
        loginFiles: { page: 'app/login/page.tsx', form: 'app/login/LoginForm.tsx', formImport: './LoginForm' },
    },
};

const text = (value: string) => JSON.stringify(value);

const isScalar = (field: Field) => !['object', 'array', 'unknown'].includes(field.type);
// Arrays of plain values are shown joined ("a, b"); objects are left out of the table
const isDisplayable = (field: Field) => isScalar(field) || (field.type === 'array' && field.items && !field.items.isObject);

function tableColumns(model: Model): Field[] {
    return model.columns.filter(field => isDisplayable(field) && !field.writeOnly && !(field.hidden && field.hidden.table));
}

/**
 * Which list features run on the server (query parameters) and which in the browser.
 * With server-side paging, browser-side search/sort would only see one page, so they are turned off.
 */
type Mode = 'server' | 'client' | 'none';
interface ListModes {
    paging: 'server' | 'client';
    search: Mode;
    sort: Mode;
    caps: ListCapabilities;
}

const NO_CAPABILITIES: ListCapabilities = { serverPaging: false, page: null, offset: null, size: null, search: null, sort: null, totalPath: null };

function listModes(model: Model): ListModes {
    const caps = model.listCapabilities ?? NO_CAPABILITIES;
    const paging: ListModes['paging'] = caps.serverPaging ? 'server' : 'client';
    const search: Mode = caps.search ? 'server' : paging === 'client' ? 'client' : 'none';
    const sort: Mode = caps.sort ? 'server' : paging === 'client' ? 'client' : 'none';
    return { paging, search, sort, caps };
}

function serverQuerySource({ paging, search, sort, caps }: ListModes): string[] {
    const entries: string[] = [];
    if (paging === 'server' && caps.size) {
        if (caps.page) entries.push(`${JSON.stringify(caps.page.name)}: page${caps.page.base === 1 ? ' + 1' : ''}`);
        if (caps.offset) entries.push(`${JSON.stringify(caps.offset.name)}: page * PAGE_SIZE`);
        entries.push(`${JSON.stringify(caps.size.name)}: PAGE_SIZE`);
    }
    if (search === 'server' && caps.search) entries.push(`${JSON.stringify(caps.search.name)}: debouncedSearch || undefined`);
    if (sort === 'server' && caps.sort) {
        const { name, direction } = caps.sort;
        if (direction) {
            entries.push(`${JSON.stringify(name)}: sort?.key`);
            entries.push(
                `${JSON.stringify(direction.name)}: sort ? (sort.direction === "asc" ? ${JSON.stringify(direction.asc)} : ${JSON.stringify(direction.desc)}) : undefined`
            );
        } else {
            // Single parameter: "name" ascending, "-name" descending
            entries.push(`${JSON.stringify(name)}: sort ? \`\${sort.direction === "desc" ? "-" : ""}\${sort.key}\` : undefined`);
        }
    }
    return entries;
}

const actionKind = (name: string) => JSON.stringify(name);

function generateListPage(model: Model, router: Router, ui: Ui, formImport: string): string {
    const { slug } = model;
    const s = ui.strings;
    const { create, retrieve, update, delete: remove } = model.crud;
    const hooks = hookNames(model);
    const canEdit = !!(retrieve && update);
    const rowActions = model.actions;
    const hasActionsColumn = canEdit || !!remove || rowActions.length > 0;
    const usesDialogs = !!remove || rowActions.length > 0;
    const formActions = rowActions.filter(action => action.fields);
    const confirmActions = rowActions.filter(action => !action.fields);
    const columns = tableColumns(model);
    const labels = { plural: model.pluralLabel.toLowerCase(), singular: model.singularLabel.toLowerCase(), Singular: model.singularLabel };
    const modes = listModes(model);
    const queryEntries = serverQuerySource(modes);
    const usesQuery = queryEntries.length > 0;
    const hasSearch = modes.search !== 'none';
    const hasSort = modes.sort !== 'none';

    // The record property used in /<model>/:id links and in delete and action calls
    const idParam = (retrieve || update || remove || rowActions[0]?.op)?.pathParams[0];
    const idKey = idParam && model.columns.some(column => column.name === idParam.name) ? idParam.name : 'id';
    const rowId = `row[${JSON.stringify(idKey)}]`;

    const colSpan = hasActionsColumn ? 'columns.length + 1' : 'columns.length';
    const actionsCell = hasActionsColumn ? `
                                    <TableCell className="space-x-2 text-right whitespace-nowrap">${rowActions.map(action => `
                                        <Button variant="outline" size="sm" onClick={() => setPending({ kind: ${actionKind(action.Name)}, id: ${rowId} })}>
                                            ${'{'}${text(action.label)}${'}'}
                                        </Button>`).join('')}${canEdit ? `
                                        ${router.link(`{\`/${slug}/\${${rowId}}\`}`, `{${text(s.edit)}}`, 'buttonVariants({ variant: "outline", size: "sm" })')}` : ''}${remove ? `
                                        <Button variant="destructive" size="sm" onClick={() => setPending({ kind: "delete", id: ${rowId} })}>
                                            {${text(s.delete)}}
                                        </Button>` : ''}
                                    </TableCell>` : '';

    const reactImports = ['useMemo', 'useState', modes.search === 'server' && 'useEffect'].filter(Boolean).sort();

    const clientPipeline = [
        modes.search === 'client' &&
            `if (search.trim()) {
            const term = search.trim().toLowerCase();
            rows = rows.filter((row) => columns.some((column) => formatValue(row[column.key], column.format).toLowerCase().includes(term)));
        }`,
        modes.sort === 'client' &&
            `if (sort) {
            rows = [...rows].sort((a, b) => {
                const result = compareValues(a[sort.key], b[sort.key]);
                return sort.direction === "asc" ? result : -result;
            });
        }`,
    ].filter(Boolean);
    const memoDeps = ['data', modes.search === 'client' && 'search', modes.sort === 'client' && 'sort'].filter(Boolean);

    const pagination =
        modes.paging === 'server'
            ? `${modes.caps.totalPath ? `const total = (data as Record<string, any> | undefined)${modes.caps.totalPath.map(key => `?.[${JSON.stringify(key)}]`).join('')};
    const pageCount = typeof total === "number" ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : undefined;` : 'const pageCount: number | undefined = undefined;'}
    const currentPage = page;
    const hasNextPage = pageCount !== undefined ? currentPage < pageCount - 1 : rows.length >= PAGE_SIZE;
    const pageRows = rows;`
            : `const pageCount: number | undefined = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const currentPage = Math.min(page, pageCount - 1);
    const hasNextPage = currentPage < pageCount - 1;
    const pageRows = rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);`;

    const pageLabel = `{pageCount !== undefined ? ${'`'}${fill(s.pageOf, { page: '${currentPage + 1}', count: '${pageCount}' })}${'`'} : ${'`'}${fill(s.page, { page: '${currentPage + 1}' })}${'`'}}`;

    const hookImports = [hooks.list, remove && hooks.delete, ...rowActions.map(action => `use${action.Name}`)].filter(Boolean);
    const closeDialog = '() => setPending(null)';

    const dialogs = [
        remove &&
            `<ConfirmDialog
                open={pending?.kind === "delete"}
                onClose={${closeDialog}}
                title={${text(fill(s.deleteTitle, labels))}}
                description={${text(s.deleteDescription)}}
                confirmLabel={${text(s.delete)}}
                destructive
                pending={deleteMutation.isPending}
                onConfirm={() => pending && deleteMutation.mutate(pending.id, { onSuccess: ${closeDialog} })}
            />`,
        ...confirmActions.map(
            action => `<ConfirmDialog
                open={pending?.kind === ${actionKind(action.Name)}}
                onClose={${closeDialog}}
                title={${text(fill(s.actionConfirm, { action: action.label }))}}
                confirmLabel={${text(action.label)}}
                pending={${actionVar(action.Name)}.isPending}
                onConfirm={() => pending && ${actionVar(action.Name)}.mutate(pending.id, { onSuccess: ${closeDialog} })}
            />`
        ),
        ...formActions.map(
            action => `<Dialog open={pending?.kind === ${actionKind(action.Name)}} onClose={${closeDialog}} title={${text(action.label)}}>
                {pending?.kind === ${actionKind(action.Name)} && (
                    <${action.Name}Form
                        submitLabel={${text(action.label)}}
                        isSubmitting={${actionVar(action.Name)}.isPending}
                        onSubmit={(values) =>
                            ${actionVar(action.Name)}.mutate(
                                { id: pending.id, body: values as Parameters<typeof ${actionVar(action.Name)}.mutate>[0]["body"] },
                                { onSuccess: ${closeDialog} }
                            )
                        }
                    />
                )}
            </Dialog>`
        ),
    ].filter(Boolean);

    return `${router.directive}${HEADER}import { ${reactImports.join(', ')} } from "react";
${canEdit || create ? `${router.linkImport}\n` : ''}import { Button${canEdit || create ? ', buttonVariants' : ''} } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";${hasSearch ? `
import { Input } from "@/components/ui/input";` : ''}
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";${usesDialogs ? `
import { ${[confirmActions.length > 0 || remove ? 'ConfirmDialog' : '', formActions.length > 0 ? 'Dialog' : ''].filter(Boolean).join(', ')} } from "${DIALOG_IMPORT}";` : ''}
import { formatValue } from "${FIELDS_IMPORT}";
import { ${hookImports.join(', ')} } from "@/hooks/use${model.Plural}";${formActions.length > 0 ? `
import { ${formActions.map(action => `${action.Name}Form`).join(', ')} } from "${formImport}";` : ''}

const PAGE_SIZE = ${ui.pageSize};

const columns: { key: string; label: string; format?: string; sortable: boolean }[] = [${columns.map(field => `
    { key: ${JSON.stringify(field.name)}, label: ${JSON.stringify(field.label)}, ${field.format ? `format: ${JSON.stringify(field.format)}, ` : ''}sortable: ${isScalar(field)} },`).join('')}
];

type Row = Record<string, any>;${hasSort ? `
type Sort = { key: string; direction: "asc" | "desc" } | null;` : ''}

// Accept plain arrays and wrapped responses: { items: [...] }, { success, data: [...] }, { data: { items: [...] } }
function extractRows(data: unknown, depth = 0): Row[] {
    if (Array.isArray(data)) return data;
    if (data && typeof data === "object") {
        const values = Object.values(data);
        const list = values.find(Array.isArray);
        if (list) return list;
        if (depth === 0) {
            for (const value of values) {
                const rows = extractRows(value, 1);
                if (rows.length > 0) return rows;
            }
        }
    }
    return [];
}${modes.sort === 'client' ? `

function compareValues(a: unknown, b: unknown) {
    if (a === b) return 0;
    if (a === null || a === undefined) return 1;
    if (b === null || b === undefined) return -1;
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a).localeCompare(String(b), undefined, { numeric: true });
}` : ''}${modes.search === 'server' ? `

function useDebouncedValue<T>(value: T, delay = 300) {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);
    return debounced;
}` : ''}

export default function ${model.Plural}List() {${hasSearch ? `
    const [search, setSearch] = useState("");` : ''}${hasSort ? `
    const [sort, setSort] = useState<Sort>(null);` : ''}
    const [page, setPage] = useState(0);${usesDialogs ? `
    // The row a confirmation or action dialog is open for
    const [pending, setPending] = useState<{ kind: string; id: string | number } | null>(null);` : ''}${modes.search === 'server' ? `
    const debouncedSearch = useDebouncedValue(search.trim());` : ''}
${usesQuery ? `
    const query = {
        ${queryEntries.join(',\n        ')},
    };
    const { data, isLoading, error } = ${hooks.list}(query as Parameters<typeof ${hooks.list}>[0]);` : `
    const { data, isLoading, error } = ${hooks.list}();`}${remove ? `
    const deleteMutation = ${hooks.delete}();` : ''}${rowActions.map(action => `
    const ${actionVar(action.Name)} = use${action.Name}();`).join('')}

    ${clientPipeline.length > 0 ? `const rows = useMemo(() => {
        let rows = extractRows(data);
        ${clientPipeline.join('\n        ')}
        return rows;
    }, [${memoDeps.join(', ')}]);` : 'const rows = useMemo(() => extractRows(data), [data]);'}

    ${pagination}
${hasSort ? `
    const toggleSort = (key: string) => {
        setSort((current) =>
            current?.key !== key ? { key, direction: "asc" } : current.direction === "asc" ? { key, direction: "desc" } : null
        );
        setPage(0);
    };
` : ''}
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div className="space-y-1.5">
                    <CardTitle>{${text(model.pluralLabel)}}</CardTitle>
                    <CardDescription>{${text(fill(s.manage, labels))}}</CardDescription>
                </div>${create ? `
                ${router.link(`"/${slug}/create"`, `{${text(s.addNew)}}`, 'buttonVariants()')}` : ''}
            </CardHeader>
            <CardContent className="space-y-4">${hasSearch ? `
                <Input
                    placeholder={${text(fill(s.searchPlaceholder, labels))}}
                    value={search}
                    onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(0);
                    }}
                    className="max-w-sm"
                />` : ''}
                <Table>
                    <TableHeader>
                        <TableRow>
                            {columns.map((column) => (
                                <TableHead key={column.key}>${hasSort ? `
                                    {column.sortable ? (
                                        <Button variant="ghost" size="sm" className="-ml-3" onClick={() => toggleSort(column.key)}>
                                            {column.label}
                                            {sort?.key === column.key ? (sort.direction === "asc" ? " ↑" : " ↓") : ""}
                                        </Button>
                                    ) : (
                                        column.label
                                    )}` : `
                                    {column.label}`}
                                </TableHead>
                            ))}${hasActionsColumn ? `
                            <TableHead className="text-right">{${text(s.actions)}}</TableHead>` : ''}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={${colSpan}} className="h-24 text-center">{${text(s.loading)}}</TableCell>
                            </TableRow>
                        ) : error ? (
                            <TableRow>
                                <TableCell colSpan={${colSpan}} className="h-24 text-center text-destructive">
                                    {${text(fill(s.loadFailed, labels))}}: {error.message}
                                </TableCell>
                            </TableRow>
                        ) : pageRows.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={${colSpan}} className="h-24 text-center text-muted-foreground">
                                    ${hasSearch ? `{search ? ${text(s.noResults)} : ${text(fill(s.empty, labels))}}` : `{${text(fill(s.empty, labels))}}`}
                                </TableCell>
                            </TableRow>
                        ) : (
                            pageRows.map((row, index) => (
                                <TableRow key={${rowId} ?? index}>
                                    {columns.map((column) => (
                                        <TableCell key={column.key}>{formatValue(row[column.key], column.format)}</TableCell>
                                    ))}${actionsCell}
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
                <div className="flex items-center justify-end gap-2">
                    <span className="text-sm text-muted-foreground">
                        ${pageLabel}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 0}>
                        {${text(s.previous)}}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setPage(currentPage + 1)} disabled={!hasNextPage}>
                        {${text(s.next)}}
                    </Button>
                </div>
            </CardContent>${dialogs.length > 0 ? `
            ${dialogs.join('\n            ')}` : ''}
        </Card>
    );
}
`;
}

function actionVar(name: string): string {
    return `${name.charAt(0).toLowerCase()}${name.slice(1)}Mutation`;
}

// Multipart endpoints get FormData; JSON endpoints get the form values as they are
function submitValues(op: Operation, mutation: string): string {
    const value = op.body && op.body.multipart ? 'toFormData(values)' : 'values';
    return `${value} as Parameters<typeof ${mutation}.mutate>[0]`;
}

function generateCreatePage(model: Model, router: Router, ui: Ui, formImport: string): string {
    const hooks = hookNames(model);
    const create = model.crud.create as Operation;
    const multipart = !!create.body?.multipart;

    return `${router.directive}${HEADER}${router.navigationImport(false)}
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";${multipart ? `
import { toFormData } from "${FIELDS_IMPORT}";` : ''}
import { ${hooks.create} } from "@/hooks/use${model.Plural}";
import { ${model.Singular}CreateForm } from "${formImport}";

export default function Create${model.Singular}() {
    ${router.navigatorSetup}
    const createMutation = ${hooks.create}();

    return (
        <Card className="max-w-2xl">
            <CardHeader>
                <CardTitle>{${text(fill(ui.strings.createTitle, { singular: model.singularLabel.toLowerCase(), Singular: model.singularLabel }))}}</CardTitle>
            </CardHeader>
            <CardContent>
                <${model.Singular}CreateForm
                    onSubmit={(values) =>
                        createMutation.mutate(${submitValues(create, 'createMutation')}, {
                            onSuccess: () => ${router.navigate(`"/${model.slug}"`)},
                        })
                    }
                    isSubmitting={createMutation.isPending}
                    submitLabel={${text(ui.strings.create)}}
                />
            </CardContent>
        </Card>
    );
}
`;
}

function generateEditPage(model: Model, router: Router, ui: Ui, formImport: string): string {
    const hooks = hookNames(model);
    const update = model.crud.update as Operation;
    const multipart = !!update.body?.multipart;

    return `${router.directive}${HEADER}${router.navigationImport(true)}
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";${multipart ? `
import { toFormData } from "${FIELDS_IMPORT}";` : ''}
import { ${hooks.detail}, ${hooks.update} } from "@/hooks/use${model.Plural}";
import { ${model.Singular}EditForm } from "${formImport}";

export default function Edit${model.Singular}() {
    ${router.paramsSetup}
    ${router.navigatorSetup}
    const { data, isLoading, error } = ${hooks.detail}(id);
    const updateMutation = ${hooks.update}(id ?? "");

    return (
        <Card className="max-w-2xl">
            <CardHeader>
                <CardTitle>{${text(fill(ui.strings.editTitle, { singular: model.singularLabel.toLowerCase(), Singular: model.singularLabel }))}}</CardTitle>
            </CardHeader>
            <CardContent>
                {error ? (
                    <p className="text-sm text-destructive">{${text(ui.strings.loadOneFailed)}}: {error.message}</p>
                ) : isLoading || !data ? (
                    <p className="text-sm text-muted-foreground">{${text(ui.strings.loading)}}</p>
                ) : (
                    <${model.Singular}EditForm
                        key={id}
                        defaultValues={data}
                        onSubmit={(values) =>
                            updateMutation.mutate(${submitValues(update, 'updateMutation')}, {
                                onSuccess: () => ${router.navigate(`"/${model.slug}"`)},
                            })
                        }
                        isSubmitting={updateMutation.isPending}
                        submitLabel={${text(ui.strings.save)}}
                    />
                )}
            </CardContent>
        </Card>
    );
}
`;
}

function navItemsSource(models: Model[]): string {
    return `const navItems = [${models.map(model => `
    { href: "/${model.slug}", label: ${JSON.stringify(model.pluralLabel)} },`).join('')}
];`;
}

interface LayoutOptions {
    ui: Ui;
    hasTheme: boolean;
    login: boolean;
}

function sidebarFooter({ ui, login }: LayoutOptions, signOut: string): string {
    const parts = [
        ui.darkModeToggle && `<ThemeToggle label={${text(ui.strings.toggleTheme)}} />`,
        login && `<Button variant="ghost" size="sm" className="justify-start" onClick={${signOut}}>
                        {${text(ui.strings.signOut)}}
                    </Button>`,
    ].filter(Boolean);
    if (parts.length === 0) return '';
    return `
                <div className="mt-auto flex flex-col gap-1 pt-4">
                    ${parts.join('\n                    ')}
                </div>`;
}

function layoutImports({ ui, hasTheme, login }: LayoutOptions): string {
    return [
        login && `import { clearToken, isSignedIn } from "${SESSION_IMPORT}";`,
        ui.darkModeToggle && 'import { ThemeToggle } from "@/components/api-gen/theme-toggle";',
        hasTheme && 'import "@/components/api-gen/theme.css";',
    ]
        .filter(Boolean)
        .join('\n');
}

function generateReactRouterLayout(models: Model[], options: LayoutOptions): string {
    const { ui, login } = options;
    return `${HEADER}import { ${login ? 'Navigate, ' : ''}NavLink, Outlet${login ? ', useNavigate' : ''} } from "react-router-dom";
import { ${login ? 'Button, ' : ''}buttonVariants } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
${layoutImports(options)}

${navItemsSource(models)}

export default function LayoutWithSidebar() {${login ? `
    const navigate = useNavigate();
    if (!isSignedIn()) return <Navigate to="/login" replace />;
` : ''}
    return (
        <div className="api-gen-dashboard flex min-h-screen">
            <aside className="flex w-56 shrink-0 flex-col border-r bg-muted/40 p-4">
                <div className="mb-4 px-3 text-lg font-semibold">{${text(ui.title)}}</div>
                <nav className="flex flex-col gap-1">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.href}
                            to={item.href}
                            className={({ isActive }) =>
                                cn(buttonVariants({ variant: isActive ? "secondary" : "ghost" }), "justify-start")
                            }
                        >
                            {item.label}
                        </NavLink>
                    ))}
                </nav>${sidebarFooter(options, `() => {
                            clearToken();
                            navigate("/login", { replace: true });
                        }`)}
            </aside>
            <main className="flex-1 p-6">
                <Outlet />
            </main>
            <Toaster />
        </div>
    );
}
`;
}

function generateNextLayout(models: Model[], options: LayoutOptions): string {
    const { ui, login } = options;
    return `"use client";
${HEADER}import ${login ? '{ useEffect, useState, type ReactNode }' : '{ type ReactNode }'} from "react";
import Link from "next/link";
import { usePathname${login ? ', useRouter' : ''} } from "next/navigation";
import { ${login ? 'Button, ' : ''}buttonVariants } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
${layoutImports(options)}

${navItemsSource(models)}

export default function DashboardLayout({ children }: { children: ReactNode }) {
    const pathname = usePathname();${login ? `
    const router = useRouter();
    // The token lives in localStorage, so the check runs in the browser
    const [signedIn, setSignedIn] = useState(false);
    useEffect(() => {
        if (isSignedIn()) setSignedIn(true);
        else router.replace("/login");
    }, [router]);
    if (!signedIn) return null;
` : ''}

    return (
        <div className="api-gen-dashboard flex min-h-screen">
            <aside className="flex w-56 shrink-0 flex-col border-r bg-muted/40 p-4">
                <div className="mb-4 px-3 text-lg font-semibold">{${text(ui.title)}}</div>
                <nav className="flex flex-col gap-1">
                    {navItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                buttonVariants({ variant: pathname?.startsWith(item.href) ? "secondary" : "ghost" }),
                                "justify-start"
                            )}
                        >
                            {item.label}
                        </Link>
                    ))}
                </nav>${sidebarFooter(options, `() => {
                            clearToken();
                            router.replace("/login");
                        }`)}
            </aside>
            <main className="flex-1 p-6">{children}</main>
            <Toaster />
        </div>
    );
}
`;
}

// Route config to plug into createBrowserRouter / useRoutes
function generateRoutes(models: DashboardModel[], router: Router, login: boolean): string {
    const imports: string[] = [];
    const routes: string[] = [];
    const relative = (file: string) => `./${file.replace(/^pages\//, '').replace(/\.tsx$/, '')}`;
    if (models.length > 0) routes.push(`{ path: "/", element: <Navigate to="/${models[0].slug}" replace /> },`);
    for (const model of models) {
        const files = router.files(model);
        imports.push(`import ${model.Plural}List from "${relative(files.list)}";`);
        routes.push(`{ path: "/${model.slug}", element: <${model.Plural}List /> },`);
        if (model.pages.create) {
            imports.push(`import Create${model.Singular} from "${relative(files.create)}";`);
            routes.push(`{ path: "/${model.slug}/create", element: <Create${model.Singular} /> },`);
        }
        if (model.pages.edit) {
            imports.push(`import Edit${model.Singular} from "${relative(files.edit)}";`);
            routes.push(`{ path: "/${model.slug}/:id", element: <Edit${model.Singular} /> },`);
        }
    }

    return `${HEADER}import { Navigate, type RouteObject } from "react-router-dom";
import LayoutWithSidebar from "./LayoutWithSidebar";${login ? `
import LoginPage from "./LoginPage";` : ''}
${imports.join('\n')}

export const dashboardRoutes: RouteObject[] = [${login ? `
    { path: "/login", element: <LoginPage /> },` : ''}
    {
        element: <LayoutWithSidebar />,
        children: [
            ${routes.join('\n            ')}
        ],
    },
];
`;
}

// components/api-gen/theme-toggle.tsx: light/dark switch, remembered in localStorage
function generateThemeToggle(): string {
    return `"use client";
${HEADER}import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "api-gen-theme";

export function ThemeToggle({ label }: { label: string }) {
    // null until the saved or system preference is known, so nothing is written before then
    const [dark, setDark] = useState<boolean | null>(null);

    useEffect(() => {
        let saved: string | null = null;
        try {
            saved = localStorage.getItem(STORAGE_KEY);
        } catch {
            // storage unavailable (private mode): fall back to the system preference
        }
        setDark(saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches);
    }, []);

    useEffect(() => {
        if (dark === null) return;
        document.documentElement.classList.toggle("dark", dark);
        try {
            localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
        } catch {
            // not saved; the choice still applies until reload
        }
    }, [dark]);

    return (
        <Button variant="ghost" size="sm" className="justify-start" aria-label={label} title={label} onClick={() => setDark((value) => !value)}>
            {dark ? "☀" : "☾"} {label}
        </Button>
    );
}
`;
}

// components/api-gen/session.ts: the signed-in user's token, sent with every secured request
function generateSession(bearerSchemes: string[]): string {
    const register =
        bearerSchemes.length > 0
            ? bearerSchemes.map(name => `setCredentials(${JSON.stringify(name)}, getToken);`).join('\n')
            : 'setAuthTokenGetter(getToken);';
    return `${HEADER}import instance${bearerSchemes.length > 0 ? '' : ', { setAuthTokenGetter }'} from "@/utils/api";${bearerSchemes.length > 0 ? `
import { setCredentials } from "@/utils/auth";` : ''}

const STORAGE_KEY = "api-gen-token";

export function getToken(): string | null {
    try {
        return localStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
}

export function setToken(token: string) {
    try {
        localStorage.setItem(STORAGE_KEY, token);
    } catch {
        // storage unavailable (private mode): the user will have to sign in again
    }
}

export function clearToken() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        // nothing stored
    }
}

export const isSignedIn = () => !!getToken();

${register}

// When the API rejects the token (expired, revoked), sign out and go back to the sign-in page
instance.interceptors.response.use(undefined, (error) => {
    if (error?.response?.status === 401 && getToken()) {
        clearToken();
        window.location.assign("/login");
    }
    return Promise.reject(error);
});
`;
}

function generateLoginPage(login: LoginInfo, router: Router, ui: Ui, homeHref: string): string {
    const s = ui.strings;
    const fn = login.op.functionName;
    const goHome = router.directive ? `router.replace(${JSON.stringify(homeHref)})` : 'navigate("/", { replace: true })';
    return `${router.directive}${HEADER}import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
${router.directive ? 'import { useRouter } from "next/navigation";' : 'import { useNavigate } from "react-router-dom";'}
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Toaster } from "@/components/ui/sonner";
import { readPath } from "${FIELDS_IMPORT}";
import { setToken } from "${SESSION_IMPORT}";
import * as api from "@/api/${login.model.name}";
import { LoginForm } from "${router.loginFiles.formImport}";

export default function LoginPage() {
    ${router.directive ? 'const router = useRouter();' : 'const navigate = useNavigate();'}
    const signIn = useMutation({
        mutationFn: (values: Parameters<typeof api.${fn}>[0]) => api.${fn}(values),
        onSuccess: (result) => {
            const token = readPath(result, ${JSON.stringify(login.tokenPath)});
            if (typeof token !== "string" || !token) {
                toast.error(${text(s.signInFailed)});
                return;
            }
            setToken(token);
            ${goHome};
        },
        onError: (error: Error) => {
            toast.error(${text(s.signInFailed)}, { description: error.message });
        },
    });

    return (
        <div className="api-gen-dashboard flex min-h-screen items-center justify-center p-4">
            <Card className="w-full max-w-sm">
                <CardHeader>
                    <CardTitle>{${text(fill(s.signInTitle, { title: ui.title }))}}</CardTitle>
                </CardHeader>
                <CardContent>
                    <LoginForm
                        onSubmit={(values) => signIn.mutate(values as Parameters<typeof api.${fn}>[0])}
                        isSubmitting={signIn.isPending}
                        submitLabel={${text(s.signIn)}}
                    />
                </CardContent>
            </Card>
            <Toaster />
        </div>
    );
}
`;
}

type DashboardModel = Model & { pages: { create: boolean; edit: boolean } };

export interface DashboardOptions {
    router?: RouterName;
    templates?: Templates | null;
    ui: Ui;
    /** The API's sign-in endpoint: generates a login page, token storage and a guard on the dashboard */
    login?: LoginInfo | null;
    /** Security schemes the signed-in token is sent with (bearer, OAuth2, OpenID Connect) */
    bearerSchemes?: string[];
}

/**
 * CRUD dashboard pages for every model with a list operation.
 * router: "react-router" (pages/ + routes.tsx) or "next" (App Router, app/(dashboard)/)
 * templates: optional overrides, see applyTemplate
 */
export function generateCRUDDashboard(
    models: Model[],
    { router: routerName = 'react-router', templates, ui, login = null, bearerSchemes = [] }: DashboardOptions
): { files: FileMap; warnings: string[] } {
    const router = ROUTERS[routerName];
    if (!router) {
        throw new Error(`Unknown router "${routerName}". Use one of: ${Object.keys(ROUTERS).join(', ')}`);
    }

    const files: FileMap = {};
    const warnings: string[] = [];
    const dashboardModels: DashboardModel[] = [];
    const render = (kind: TemplateKind, defaultContent: string, model: Model | null) => applyTemplate(templates, kind, defaultContent, { model, router: routerName });

    for (const model of models) {
        const { list, retrieve, create, update } = model.crud;
        if (isHidden(model, ui)) continue;
        if (!list) {
            if (login?.model !== model) warnings.push(`Skipping dashboard for "${model.key}": no list operation (GET ${model.basePath}).`);
            continue;
        }
        if (tableColumns(model).length === 0) {
            warnings.push(`Skipping dashboard for "${model.key}": its list response has no fields to show.`);
            continue;
        }

        const pages = { create: !!create, edit: !!(retrieve && update) };
        const paths = router.files(model);
        const forms: FormSpec[] = [
            ...(pages.create ? [{ component: `${model.Singular}CreateForm`, fields: model.formFields }] : []),
            ...(pages.edit ? [{ component: `${model.Singular}EditForm`, fields: model.editFields }] : []),
            ...model.actions.filter(action => action.fields).map(action => ({ component: `${action.Name}Form`, fields: action.fields as Field[] })),
        ];

        files[paths.list] = render('listPage', generateListPage(model, router, ui, paths.listFormImport), model);
        if (forms.length > 0) files[paths.form] = render('form', generateFormFile(forms, router, ui), model);
        if (pages.create) files[paths.create] = render('createPage', generateCreatePage(model, router, ui, paths.formImport), model);
        if (pages.edit) files[paths.edit] = render('editPage', generateEditPage(model, router, ui, paths.formImport), model);
        if (pages.edit && editable(model.editFields).length === 0) {
            warnings.push(`The edit form for "${model.key}" has no fields: its update request body has no editable properties.`);
        }
        dashboardModels.push({ ...model, pages });
    }

    if (dashboardModels.length > 0) {
        const themeCss = generateThemeCss(ui.theme);
        const layout: LayoutOptions = { ui, hasTheme: !!themeCss, login: !!login };
        files['components/api-gen/fields.tsx'] = generateFieldsComponent(ui);
        files['components/api-gen/form.tsx'] = generateFormPrimitives();
        files['components/api-gen/dialog.tsx'] = generateDialogComponent(ui);
        if (ui.darkModeToggle) files['components/api-gen/theme-toggle.tsx'] = generateThemeToggle();
        if (themeCss) files['components/api-gen/theme.css'] = themeCss;
        if (login) {
            files['components/api-gen/session.ts'] = generateSession(bearerSchemes);
            files[router.loginFiles.form] = generateFormFile([{ component: 'LoginForm', fields: login.fields }], router, ui);
            files[router.loginFiles.page] = render('loginPage', generateLoginPage(login, router, ui, `/${dashboardModels[0].slug}`), null);
        }
        if (routerName === 'next') {
            files['app/(dashboard)/layout.tsx'] = render('layout', generateNextLayout(dashboardModels, layout), null);
        } else {
            files['pages/LayoutWithSidebar.tsx'] = render('layout', generateReactRouterLayout(dashboardModels, layout), null);
            files['pages/routes.tsx'] = render('routes', generateRoutes(dashboardModels, router, !!login), null);
        }
    }

    return { files, warnings };
}
