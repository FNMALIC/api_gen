const { HEADER } = require('./apiGenerator');
const { humanize, propertyKey } = require('../utils/helpers');

// shadcn/ui components the generated dashboard imports from "@/components/ui/*"
const SHADCN_COMPONENTS = ['button', 'card', 'table', 'form', 'input', 'checkbox', 'select', 'alert-dialog', 'sonner'];

const PAGE_SIZE = 10;

// Router-specific pieces; everything else in the pages is shared
const ROUTERS = {
    'react-router': {
        directive: '',
        linkImport: 'import { Link } from "react-router-dom";',
        link: (href, children) => `<Link to=${href}>${children}</Link>`,
        navigationImport: withParams =>
            `import { ${withParams ? 'useNavigate, useParams' : 'useNavigate'} } from "react-router-dom";`,
        navigatorSetup: 'const navigate = useNavigate();',
        navigatorName: 'navigate',
        navigate: path => `navigate(${path})`,
        paramsSetup: 'const { id } = useParams();',
        files: model => ({
            list: `pages/${model.name}/${model.Name}List.tsx`,
            create: `pages/${model.name}/Create${model.Name}.tsx`,
            edit: `pages/${model.name}/Edit${model.Name}.tsx`,
            form: `pages/${model.name}/${model.Name}Form.tsx`,
            formImport: `./${model.Name}Form`,
        }),
    },
    next: {
        directive: '"use client";\n',
        linkImport: 'import Link from "next/link";',
        link: (href, children) => `<Link href=${href}>${children}</Link>`,
        navigationImport: withParams =>
            `import { ${withParams ? 'useParams, useRouter' : 'useRouter'} } from "next/navigation";`,
        navigatorSetup: 'const router = useRouter();',
        navigatorName: 'router',
        navigate: path => `router.push(${path})`,
        paramsSetup: 'const { id } = useParams<{ id: string }>();',
        files: model => ({
            list: `app/(dashboard)/${model.slug}/page.tsx`,
            create: `app/(dashboard)/${model.slug}/create/page.tsx`,
            edit: `app/(dashboard)/${model.slug}/[id]/page.tsx`,
            form: `app/(dashboard)/${model.slug}/${model.Name}Form.tsx`,
            formImport: `../${model.Name}Form`,
        }),
    },
};

const isScalar = field => !['object', 'array', 'unknown'].includes(field.type);

// Fields shown in forms: writable scalars only
const editableFields = fields => fields.filter(field => isScalar(field) && !field.readOnly);

function zodType(field) {
    const label = humanize(field.name);
    let type;
    if (field.enum && field.enum.length > 0) {
        type = `z.enum([${field.enum.map(value => JSON.stringify(String(value))).join(', ')}])`;
    } else if (field.type === 'integer' || field.type === 'number') {
        type = `z.number({ message: "${label} must be a number" })`;
        if (field.type === 'integer') type += '.int()';
    } else if (field.type === 'boolean') {
        type = 'z.boolean()';
    } else {
        type = 'z.string()';
        if (field.required) type += `.min(1, "${label} is required")`;
        if (field.format === 'email') type += '.email("Invalid email")';
        if (field.format === 'uri') type += '.url("Invalid URL")';
    }
    if (field.nullable) type += '.nullable()';
    return field.required ? type : `${type}.optional()`;
}

function defaultValue(field) {
    if (field.type === 'boolean') return 'false';
    if (field.enum || field.type === 'integer' || field.type === 'number') return 'undefined';
    return '""';
}

function formFieldControl(field) {
    const label = humanize(field.name);
    const name = JSON.stringify(field.name);

    if (field.type === 'boolean') {
        return `
                <FormField
                    control={form.control}
                    name=${name}
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-center gap-3">
                            <FormControl>
                                <Checkbox checked={field.value ?? false} onCheckedChange={(checked) => field.onChange(checked === true)} />
                            </FormControl>
                            <FormLabel>${label}</FormLabel>
                            <FormMessage />
                        </FormItem>
                    )}
                />`;
    }

    if (field.enum && field.enum.length > 0) {
        const items = field.enum
            .map(value => `<SelectItem value=${JSON.stringify(String(value))}>${humanize(String(value)) || String(value)}</SelectItem>`)
            .join('\n');
        return `
                <FormField
                    control={form.control}
                    name=${name}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>${label}</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value ?? undefined}>
                                <FormControl>
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select ${label.toLowerCase()}" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    ${items}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />`;
    }

    let input;
    if (field.type === 'integer' || field.type === 'number') {
        input = `<Input
                                    type="number"
                                    {...field}
                                    value={field.value ?? ""}
                                    onChange={(e) => field.onChange(e.target.value === "" ? undefined : e.target.valueAsNumber)}
                                />`;
    } else {
        const inputType = { email: 'email', password: 'password', date: 'date', 'date-time': 'datetime-local', uri: 'url' }[field.format] || 'text';
        input = `<Input type="${inputType}" {...field} value={field.value ?? ""} />`;
    }
    return `
                <FormField
                    control={form.control}
                    name=${name}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>${label}</FormLabel>
                            <FormControl>
                                ${input}
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />`;
}

// Shared react-hook-form + zod form used by both the create and edit pages
function generateFormComponent(model, router) {
    const { name, Name } = model;
    const editable = editableFields(model.formFields);
    const needsCheckbox = editable.some(field => field.type === 'boolean');
    const needsSelect = editable.some(field => field.enum && field.enum.length > 0);

    return `${router.directive}${HEADER}import { useForm, type DefaultValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";${needsCheckbox ? `
import { Checkbox } from "@/components/ui/checkbox";` : ''}${needsSelect ? `
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";` : ''}

export const ${name}FormSchema = z.object({${editable.map(field => `
    ${propertyKey(field.name)}: ${zodType(field)},`).join('')}
});

export type ${Name}FormValues = z.infer<typeof ${name}FormSchema>;

const emptyValues = {${editable.map(field => `
    ${propertyKey(field.name)}: ${defaultValue(field)},`).join('')}
};

interface ${Name}FormProps {
    /** Initial values, e.g. the record being edited. Properties outside the schema are dropped on submit. */
    defaultValues?: object;
    onSubmit: (values: ${Name}FormValues) => void;
    isSubmitting?: boolean;
    submitLabel: string;
}

export function ${Name}Form({ defaultValues, onSubmit, isSubmitting, submitLabel }: ${Name}FormProps) {
    const form = useForm<${Name}FormValues>({
        resolver: zodResolver(${name}FormSchema),
        defaultValues: { ...emptyValues, ...defaultValues } as DefaultValues<${Name}FormValues>,
    });

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-6">${editable.map(formFieldControl).join('')}
                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Saving..." : submitLabel}
                </Button>
            </form>
        </Form>
    );
}
`;
}

function generateListPage(model, router) {
    const { Name, listVar, slug } = model;
    const { create, retrieve, update, delete: remove } = model.crud;
    const canEdit = !!(retrieve && update);
    const hasActions = canEdit || !!remove;
    const columns = model.columns.filter(isScalar);
    const plural = humanize(model.key).toLowerCase();

    // The record property used in /<model>/:id links and delete calls
    const idParam = (retrieve || update || remove || { pathParams: [] }).pathParams[0];
    const idKey = idParam && columns.some(column => column.name === idParam.name) ? idParam.name : 'id';
    const rowId = `row[${JSON.stringify(idKey)}]`;

    const hookFields = [`${listVar}: data`, 'allLoading', 'allFetchError'];
    if (remove) hookFields.push(`delete${Name}`, `isDeleting${Name}`);

    const colSpan = hasActions ? 'columns.length + 1' : 'columns.length';
    const actions = hasActions ? `
                                    <TableCell className="space-x-2 text-right">${canEdit ? `
                                        <Button variant="outline" size="sm" asChild>
                                            ${router.link(`{\`/${slug}/\${${rowId}}\`}`, 'Edit')}
                                        </Button>` : ''}${remove ? `
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="destructive" size="sm" disabled={isDeleting${Name}}>Delete</Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Delete this item?</AlertDialogTitle>
                                                    <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => delete${Name}(${rowId})}>Delete</AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>` : ''}
                                    </TableCell>` : '';

    return `${router.directive}${HEADER}import { useMemo, useState } from "react";
${canEdit || create ? `${router.linkImport}\n` : ''}import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { use${Name} } from "@/hooks/use${Name}";

const PAGE_SIZE = ${PAGE_SIZE};

const columns = [${columns.map(field => `
    { key: ${JSON.stringify(field.name)}, label: ${JSON.stringify(humanize(field.name))} },`).join('')}
];

type Row = Record<string, any>;
type Sort = { key: string; direction: "asc" | "desc" } | null;

// Accept plain arrays and paginated responses such as { data: [...] } or { items: [...] }
function extractRows(data: unknown): Row[] {
    if (Array.isArray(data)) return data;
    if (data && typeof data === "object") {
        const list = Object.values(data).find(Array.isArray);
        if (list) return list;
    }
    return [];
}

function formatCell(value: unknown) {
    if (value === null || value === undefined) return "—";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
}

function compareValues(a: unknown, b: unknown) {
    if (a === b) return 0;
    if (a === null || a === undefined) return 1;
    if (b === null || b === undefined) return -1;
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a).localeCompare(String(b), undefined, { numeric: true });
}

export default function ${Name}List() {
    const { ${hookFields.join(', ')} } = use${Name}();
    const [search, setSearch] = useState("");
    const [sort, setSort] = useState<Sort>(null);
    const [page, setPage] = useState(0);

    const rows = useMemo(() => {
        const query = search.trim().toLowerCase();
        const all = extractRows(data);
        const filtered = query
            ? all.filter((row) => columns.some((column) => formatCell(row[column.key]).toLowerCase().includes(query)))
            : all;
        if (!sort) return filtered;
        return [...filtered].sort((a, b) => {
            const result = compareValues(a[sort.key], b[sort.key]);
            return sort.direction === "asc" ? result : -result;
        });
    }, [data, search, sort]);

    const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const currentPage = Math.min(page, pageCount - 1);
    const pageRows = rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

    const toggleSort = (key: string) =>
        setSort((current) =>
            current?.key !== key ? { key, direction: "asc" } : current.direction === "asc" ? { key, direction: "desc" } : null
        );

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div className="space-y-1.5">
                    <CardTitle>${humanize(model.key)}</CardTitle>
                    <CardDescription>Manage your ${plural}.</CardDescription>
                </div>${create ? `
                <Button asChild>
                    ${router.link(`"/${slug}/create"`, 'Add new')}
                </Button>` : ''}
            </CardHeader>
            <CardContent className="space-y-4">
                <Input
                    placeholder="Search ${plural}..."
                    value={search}
                    onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(0);
                    }}
                    className="max-w-sm"
                />
                <Table>
                    <TableHeader>
                        <TableRow>
                            {columns.map((column) => (
                                <TableHead key={column.key}>
                                    <Button variant="ghost" size="sm" className="-ml-3" onClick={() => toggleSort(column.key)}>
                                        {column.label}
                                        {sort?.key === column.key ? (sort.direction === "asc" ? " ↑" : " ↓") : ""}
                                    </Button>
                                </TableHead>
                            ))}${hasActions ? `
                            <TableHead className="text-right">Actions</TableHead>` : ''}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {allLoading ? (
                            <TableRow>
                                <TableCell colSpan={${colSpan}} className="h-24 text-center">Loading...</TableCell>
                            </TableRow>
                        ) : allFetchError ? (
                            <TableRow>
                                <TableCell colSpan={${colSpan}} className="h-24 text-center text-destructive">
                                    Failed to load ${plural}: {allFetchError.message}
                                </TableCell>
                            </TableRow>
                        ) : pageRows.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={${colSpan}} className="h-24 text-center text-muted-foreground">
                                    {search ? "No results." : "No ${plural} yet."}
                                </TableCell>
                            </TableRow>
                        ) : (
                            pageRows.map((row, index) => (
                                <TableRow key={${rowId} ?? index}>
                                    {columns.map((column) => (
                                        <TableCell key={column.key}>{formatCell(row[column.key])}</TableCell>
                                    ))}${actions}
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
                <div className="flex items-center justify-end gap-2">
                    <span className="text-sm text-muted-foreground">
                        Page {currentPage + 1} of {pageCount}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 0}>
                        Previous
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setPage(currentPage + 1)} disabled={currentPage >= pageCount - 1}>
                        Next
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
`;
}

function generateCreatePage(model, router, formImport) {
    const { Name, slug } = model;

    return `${router.directive}${HEADER}import { useEffect } from "react";
${router.navigationImport(false)}
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { use${Name} } from "@/hooks/use${Name}";
import { ${Name}Form } from "${formImport}";

export default function Create${Name}() {
    ${router.navigatorSetup}
    const { add${Name}, isAdding${Name}, isSuccess } = use${Name}();

    useEffect(() => {
        if (isSuccess) ${router.navigate(`"/${slug}"`)};
    }, [isSuccess, ${router.navigatorName}]);

    return (
        <Card className="max-w-2xl">
            <CardHeader>
                <CardTitle>Create ${humanize(model.key)}</CardTitle>
            </CardHeader>
            <CardContent>
                <${Name}Form
                    onSubmit={(values) => add${Name}(values as Parameters<typeof add${Name}>[0])}
                    isSubmitting={isAdding${Name}}
                    submitLabel="Create"
                />
            </CardContent>
        </Card>
    );
}
`;
}

function generateEditPage(model, router, formImport) {
    const { Name, slug } = model;

    return `${router.directive}${HEADER}import { useEffect } from "react";
${router.navigationImport(true)}
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { use${Name} } from "@/hooks/use${Name}";
import { ${Name}Form } from "${formImport}";

export default function Edit${Name}() {
    ${router.paramsSetup}
    ${router.navigatorSetup}
    const { one${Name}, singleLoading, singleFetchError, update${Name}, isUpdating${Name}, isSuccess } = use${Name}(true, id ?? null);

    useEffect(() => {
        if (isSuccess) ${router.navigate(`"/${slug}"`)};
    }, [isSuccess, ${router.navigatorName}]);

    return (
        <Card className="max-w-2xl">
            <CardHeader>
                <CardTitle>Edit ${humanize(model.key)}</CardTitle>
            </CardHeader>
            <CardContent>
                {singleFetchError ? (
                    <p className="text-sm text-destructive">Failed to load: {singleFetchError.message}</p>
                ) : singleLoading || !one${Name} ? (
                    <p className="text-sm text-muted-foreground">Loading...</p>
                ) : (
                    <${Name}Form
                        key={id}
                        defaultValues={one${Name}}
                        onSubmit={(values) => update${Name}(values as Parameters<typeof update${Name}>[0])}
                        isSubmitting={isUpdating${Name}}
                        submitLabel="Save"
                    />
                )}
            </CardContent>
        </Card>
    );
}
`;
}

function navItemsSource(models) {
    return `const navItems = [${models.map(model => `
    { href: "/${model.slug}", label: ${JSON.stringify(humanize(model.key))} },`).join('')}
];`;
}

function generateReactRouterLayout(models) {
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

function generateNextLayout(models) {
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
function generateRoutes(models, router) {
    const imports = [];
    const routes = [];
    const relative = file => `./${file.replace(/^pages\//, '').replace(/\.tsx$/, '')}`;
    for (const model of models) {
        const files = router.files(model);
        imports.push(`import ${model.Name}List from "${relative(files.list)}";`);
        routes.push(`{ path: "/${model.slug}", element: <${model.Name}List /> },`);
        if (model.pages.create) {
            imports.push(`import Create${model.Name} from "${relative(files.create)}";`);
            routes.push(`{ path: "/${model.slug}/create", element: <Create${model.Name} /> },`);
        }
        if (model.pages.edit) {
            imports.push(`import Edit${model.Name} from "${relative(files.edit)}";`);
            routes.push(`{ path: "/${model.slug}/:id", element: <Edit${model.Name} /> },`);
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
 */
function generateCRUDDashboard(models, { router: routerName = 'react-router' } = {}) {
    const router = ROUTERS[routerName];
    if (!router) {
        throw new Error(`Unknown router "${routerName}". Use one of: ${Object.keys(ROUTERS).join(', ')}`);
    }

    const files = {};
    const warnings = [];
    const dashboardModels = [];

    for (const model of models) {
        const { list, retrieve, create, update } = model.crud;
        if (!list) {
            warnings.push(`Skipping dashboard for "${model.key}": no list operation (GET ${model.basePath}).`);
            continue;
        }
        if (model.columns.filter(isScalar).length === 0) {
            warnings.push(`Skipping dashboard for "${model.key}": its list response has no object fields to show.`);
            continue;
        }

        const pages = { create: !!create, edit: !!(retrieve && update) };
        const paths = router.files(model);

        files[paths.list] = generateListPage(model, router);
        if (pages.create || pages.edit) files[paths.form] = generateFormComponent(model, router);
        if (pages.create) files[paths.create] = generateCreatePage(model, router, paths.formImport);
        if (pages.edit) files[paths.edit] = generateEditPage(model, router, paths.formImport);
        dashboardModels.push({ ...model, pages });
    }

    if (dashboardModels.length > 0) {
        if (routerName === 'next') {
            files['app/(dashboard)/layout.tsx'] = generateNextLayout(dashboardModels);
        } else {
            files['pages/LayoutWithSidebar.tsx'] = generateReactRouterLayout(dashboardModels);
            files['pages/routes.tsx'] = generateRoutes(dashboardModels, router);
        }
    }

    return { files, warnings };
}

module.exports = {
    generateCRUDDashboard,
    SHADCN_COMPONENTS,
    ROUTERS,
};
