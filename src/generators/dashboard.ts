import { HEADER } from './api.ts';
import { hookNames } from './hooks.ts';
import { generateFormComponent, generateFieldsComponent, FIELDS_IMPORT } from './form.ts';
import { applyTemplate } from '../helpers.ts';
import type { Field, FileMap, ListCapabilities, Model, Operation, RouterName, TemplateKind, Templates } from '../model.ts';

// shadcn/ui components the generated dashboard imports from "@/components/ui/*"
export const SHADCN_COMPONENTS = ['button', 'card', 'table', 'form', 'input', 'textarea', 'checkbox', 'select', 'alert-dialog', 'sonner'];

const PAGE_SIZE = 10;

// Router-specific pieces; everything else in the pages is shared
export interface Router {
    directive: string;
    linkImport: string;
    link(href: string, children: string): string;
    navigationImport(withParams: boolean): string;
    navigatorSetup: string;
    navigate(path: string): string;
    paramsSetup: string;
    files(model: Model): { list: string; create: string; edit: string; form: string; formImport: string };
}

export const ROUTERS: Record<RouterName, Router> = {
    'react-router': {
        directive: '',
        linkImport: 'import { Link } from "react-router-dom";',
        link: (href, children) => `<Link to=${href}>${children}</Link>`,
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
        }),
    },
    next: {
        directive: '"use client";\n',
        linkImport: 'import Link from "next/link";',
        link: (href, children) => `<Link href=${href}>${children}</Link>`,
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
        }),
    },
};

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

function generateListPage(model: Model, router: Router): string {
    const { slug } = model;
    const { create, retrieve, update, delete: remove } = model.crud;
    const hooks = hookNames(model);
    const canEdit = !!(retrieve && update);
    const hasActions = canEdit || !!remove;
    const columns = tableColumns(model);
    const plural = model.pluralLabel.toLowerCase();
    const modes = listModes(model);
    const queryEntries = serverQuerySource(modes);
    const usesQuery = queryEntries.length > 0;
    const hasSearch = modes.search !== 'none';
    const hasSort = modes.sort !== 'none';

    // The record property used in /<model>/:id links and delete calls
    const idParam = (retrieve || update || remove)?.pathParams[0];
    const idKey = idParam && model.columns.some(column => column.name === idParam.name) ? idParam.name : 'id';
    const rowId = `row[${JSON.stringify(idKey)}]`;

    const colSpan = hasActions ? 'columns.length + 1' : 'columns.length';
    const actions = hasActions ? `
                                    <TableCell className="space-x-2 text-right">${canEdit ? `
                                        <Button variant="outline" size="sm" asChild>
                                            ${router.link(`{\`/${slug}/\${${rowId}}\`}`, 'Edit')}
                                        </Button>` : ''}${remove ? `
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="destructive" size="sm" disabled={deleteMutation.isPending}>Delete</Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Delete this ${model.singularLabel.toLowerCase()}?</AlertDialogTitle>
                                                    <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => deleteMutation.mutate(${rowId})}>Delete</AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>` : ''}
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

    return `${router.directive}${HEADER}import { ${reactImports.join(', ')} } from "react";
${canEdit || create ? `${router.linkImport}\n` : ''}import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";${hasSearch ? `
import { Input } from "@/components/ui/input";` : ''}
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";${remove ? `
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";` : ''}
import { formatValue } from "${FIELDS_IMPORT}";
import { ${[hooks.list, remove && hooks.delete].filter(Boolean).join(', ')} } from "@/hooks/use${model.Plural}";

const PAGE_SIZE = ${PAGE_SIZE};

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
    const [page, setPage] = useState(0);${modes.search === 'server' ? `
    const debouncedSearch = useDebouncedValue(search.trim());` : ''}
${usesQuery ? `
    const query = {
        ${queryEntries.join(',\n        ')},
    };
    const { data, isLoading, error } = ${hooks.list}(query as Parameters<typeof ${hooks.list}>[0]);` : `
    const { data, isLoading, error } = ${hooks.list}();`}${remove ? `
    const deleteMutation = ${hooks.delete}();` : ''}

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
                    <CardTitle>${model.pluralLabel}</CardTitle>
                    <CardDescription>Manage your ${plural}.</CardDescription>
                </div>${create ? `
                <Button asChild>
                    ${router.link(`"/${slug}/create"`, 'Add new')}
                </Button>` : ''}
            </CardHeader>
            <CardContent className="space-y-4">${hasSearch ? `
                <Input
                    placeholder="Search ${plural}..."
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
                            ))}${hasActions ? `
                            <TableHead className="text-right">Actions</TableHead>` : ''}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={${colSpan}} className="h-24 text-center">Loading...</TableCell>
                            </TableRow>
                        ) : error ? (
                            <TableRow>
                                <TableCell colSpan={${colSpan}} className="h-24 text-center text-destructive">
                                    Failed to load ${plural}: {error.message}
                                </TableCell>
                            </TableRow>
                        ) : pageRows.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={${colSpan}} className="h-24 text-center text-muted-foreground">
                                    ${hasSearch ? `{search ? "No results." : "No ${plural} yet."}` : `No ${plural} yet.`}
                                </TableCell>
                            </TableRow>
                        ) : (
                            pageRows.map((row, index) => (
                                <TableRow key={${rowId} ?? index}>
                                    {columns.map((column) => (
                                        <TableCell key={column.key}>{formatValue(row[column.key], column.format)}</TableCell>
                                    ))}${actions}
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
                <div className="flex items-center justify-end gap-2">
                    <span className="text-sm text-muted-foreground">
                        Page {currentPage + 1}
                        {pageCount !== undefined ? \` of \${pageCount}\` : ""}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 0}>
                        Previous
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setPage(currentPage + 1)} disabled={!hasNextPage}>
                        Next
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
`;
}

// Multipart endpoints get FormData; JSON endpoints get the form values as they are
function submitValues(op: Operation, mutation: string): string {
    const value = op.body && op.body.multipart ? 'toFormData(values)' : 'values';
    return `${value} as Parameters<typeof ${mutation}.mutate>[0]`;
}

function generateCreatePage(model: Model, router: Router, formImport: string): string {
    const hooks = hookNames(model);
    const create = model.crud.create as Operation;
    const multipart = !!create.body?.multipart;

    return `${router.directive}${HEADER}${router.navigationImport(false)}
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";${multipart ? `
import { toFormData } from "${FIELDS_IMPORT}";` : ''}
import { ${hooks.create} } from "@/hooks/use${model.Plural}";
import { ${model.Singular}Form } from "${formImport}";

export default function Create${model.Singular}() {
    ${router.navigatorSetup}
    const createMutation = ${hooks.create}();

    return (
        <Card className="max-w-2xl">
            <CardHeader>
                <CardTitle>Create ${model.singularLabel.toLowerCase()}</CardTitle>
            </CardHeader>
            <CardContent>
                <${model.Singular}Form
                    onSubmit={(values) =>
                        createMutation.mutate(${submitValues(create, 'createMutation')}, {
                            onSuccess: () => ${router.navigate(`"/${model.slug}"`)},
                        })
                    }
                    isSubmitting={createMutation.isPending}
                    submitLabel="Create"
                />
            </CardContent>
        </Card>
    );
}
`;
}

function generateEditPage(model: Model, router: Router, formImport: string): string {
    const hooks = hookNames(model);
    const update = model.crud.update as Operation;
    const multipart = !!update.body?.multipart;

    return `${router.directive}${HEADER}${router.navigationImport(true)}
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";${multipart ? `
import { toFormData } from "${FIELDS_IMPORT}";` : ''}
import { ${hooks.detail}, ${hooks.update} } from "@/hooks/use${model.Plural}";
import { ${model.Singular}Form } from "${formImport}";

export default function Edit${model.Singular}() {
    ${router.paramsSetup}
    ${router.navigatorSetup}
    const { data, isLoading, error } = ${hooks.detail}(id);
    const updateMutation = ${hooks.update}(id ?? "");

    return (
        <Card className="max-w-2xl">
            <CardHeader>
                <CardTitle>Edit ${model.singularLabel.toLowerCase()}</CardTitle>
            </CardHeader>
            <CardContent>
                {error ? (
                    <p className="text-sm text-destructive">Failed to load: {error.message}</p>
                ) : isLoading || !data ? (
                    <p className="text-sm text-muted-foreground">Loading...</p>
                ) : (
                    <${model.Singular}Form
                        key={id}
                        defaultValues={data}
                        onSubmit={(values) =>
                            updateMutation.mutate(${submitValues(update, 'updateMutation')}, {
                                onSuccess: () => ${router.navigate(`"/${model.slug}"`)},
                            })
                        }
                        isSubmitting={updateMutation.isPending}
                        submitLabel="Save"
                    />
                )}
            </CardContent>
        </Card>
    );
}
`;
}

type DashboardModel = Model & { pages: { create: boolean; edit: boolean } };

function navItemsSource(models: Model[]): string {
    return `const navItems = [${models.map(model => `
    { href: "/${model.slug}", label: ${JSON.stringify(model.pluralLabel)} },`).join('')}
];`;
}

function generateReactRouterLayout(models: Model[]): string {
    return `${HEADER}import { NavLink, Outlet } from "react-router-dom";
import { buttonVariants } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

${navItemsSource(models)}

export default function LayoutWithSidebar() {
    return (
        <div className="flex min-h-screen">
            <aside className="w-56 shrink-0 border-r bg-muted/40 p-4">
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
                </nav>
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

function generateNextLayout(models: Model[]): string {
    return `"use client";
${HEADER}import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

${navItemsSource(models)}

export default function DashboardLayout({ children }: { children: ReactNode }) {
    const pathname = usePathname();

    return (
        <div className="flex min-h-screen">
            <aside className="w-56 shrink-0 border-r bg-muted/40 p-4">
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
                </nav>
            </aside>
            <main className="flex-1 p-6">{children}</main>
            <Toaster />
        </div>
    );
}
`;
}

// Route config to plug into createBrowserRouter / useRoutes
function generateRoutes(models: DashboardModel[], router: Router): string {
    const imports: string[] = [];
    const routes: string[] = [];
    const relative = (file: string) => `./${file.replace(/^pages\//, '').replace(/\.tsx$/, '')}`;
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

    return `${HEADER}import type { RouteObject } from "react-router-dom";
import LayoutWithSidebar from "./LayoutWithSidebar";
${imports.join('\n')}

export const dashboardRoutes: RouteObject[] = [
    {
        element: <LayoutWithSidebar />,
        children: [
            ${routes.join('\n            ')}
        ],
    },
];
`;
}

/**
 * CRUD dashboard pages for every model with a list operation.
 * router: "react-router" (pages/ + routes.tsx) or "next" (App Router, app/(dashboard)/)
 * templates: optional overrides, see applyTemplate
 */
export function generateCRUDDashboard(
    models: Model[],
    { router: routerName = 'react-router', templates }: { router?: RouterName; templates?: Templates | null } = {}
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
        if (!list) {
            warnings.push(`Skipping dashboard for "${model.key}": no list operation (GET ${model.basePath}).`);
            continue;
        }
        if (tableColumns(model).length === 0) {
            warnings.push(`Skipping dashboard for "${model.key}": its list response has no fields to show.`);
            continue;
        }

        const pages = { create: !!create, edit: !!(retrieve && update) };
        const paths = router.files(model);

        files[paths.list] = render('listPage', generateListPage(model, router), model);
        if (pages.create || pages.edit) files[paths.form] = render('form', generateFormComponent(model, router), model);
        if (pages.create) files[paths.create] = render('createPage', generateCreatePage(model, router, paths.formImport), model);
        if (pages.edit) files[paths.edit] = render('editPage', generateEditPage(model, router, paths.formImport), model);
        dashboardModels.push({ ...model, pages });
    }

    if (dashboardModels.length > 0) {
        files['components/api-gen/fields.tsx'] = generateFieldsComponent();
        if (routerName === 'next') {
            files['app/(dashboard)/layout.tsx'] = render('layout', generateNextLayout(dashboardModels), null);
        } else {
            files['pages/LayoutWithSidebar.tsx'] = render('layout', generateReactRouterLayout(dashboardModels), null);
            files['pages/routes.tsx'] = render('routes', generateRoutes(dashboardModels, router), null);
        }
    }

    return { files, warnings };
}

