// Dashboard pages: list, detail, create, edit and home
import { HEADER } from './api.ts';
import { hookNames } from './hooks.ts';
import { DIALOG_IMPORT, FIELDS_IMPORT, I18N_IMPORT } from './form.ts';
import { Imports, OPTIONS_PAGE_SIZE, i18nImport, importComponent, listHookCall, referenceSource } from './shared.ts';
import { humanize } from '../helpers.ts';
import { iconName, templateExpression, type Ui, type Value } from '../ui.ts';
import type { CellKind, Field, Filter, ListCapabilities, Model, Operation } from '../model.ts';
import type { DashboardModel, Router } from './dashboard.ts';

export const SESSION_IMPORT = '@/components/api-gen/session';

export interface PageContext {
    router: Router;
    ui: Ui;
    /** Every resource, to resolve references */
    models: Model[];
    /** The resources that get pages */
    dashboardModels: DashboardModel[];
    /** A login page exists: pages can check permissions */
    auth: boolean;
}

const isScalar = (field: Field) => !['object', 'array', 'unknown'].includes(field.type);
// Arrays of plain values are shown joined ("a, b"); objects are left out of the table
export const isDisplayable = (field: Field) => isScalar(field) || (field.type === 'array' && !!field.items && !field.items.isObject);

export function tableColumns(model: Model): Field[] {
    // Columns picked in the design file are shown as listed
    if (model.tableColumns) {
        return model.tableColumns.map(name => model.columns.find(field => field.name === name)).filter((field): field is Field => !!field);
    }
    return model.columns.filter(field => isDisplayable(field) && !field.writeOnly && !(field.hidden && field.hidden.table));
}

const IMAGE_NAME = /(image|avatar|photo|picture|logo|thumbnail|icon|cover|banner)/i;
const LINK_NAME = /(url|link|website|homepage)$/i;
const CURRENCY_NAME = /^(price|amount|cost|total|balance|fee|salary|revenue|subtotal)$|(Price|Amount|Cost|Total|Balance|Fee)$|_(price|amount|cost|total|balance|fee)$/;

/** How a value is shown, from the design file, else its type, format and name */
export function cellKind(field: Field): CellKind {
    if (field.cell) return field.cell;
    if (field.type === 'boolean') return 'boolean';
    if (field.enum && field.enum.length > 0) return 'badge';
    if (field.type === 'array') return field.items?.enum?.length ? 'badge' : field.items?.isObject ? 'json' : 'list';
    if (field.type === 'object' || field.type === 'unknown') return 'json';
    if (field.format === 'date') return 'date';
    if (field.format === 'date-time') return 'datetime';
    if (field.type === 'string') {
        if (field.format === 'email' || /^e?-?mail$|Email$|_email$/i.test(field.name)) return 'email';
        if (field.format === 'uri' || field.format === 'url' || LINK_NAME.test(field.name) || IMAGE_NAME.test(field.name)) {
            return IMAGE_NAME.test(field.name) ? 'image' : field.format === 'uri' || field.format === 'url' || LINK_NAME.test(field.name) ? 'link' : 'text';
        }
    }
    if ((field.type === 'number' || field.type === 'integer') && CURRENCY_NAME.test(field.name)) return 'currency';
    if (field.type === 'number') return 'number';
    return 'text';
}

/** Expression for a permission check, or null when anyone may */
export function permissionCheck(context: PageContext, permissions: string[] | undefined): string | null {
    if (!context.auth || !permissions || permissions.length === 0) return null;
    return `can(${JSON.stringify(permissions)})`;
}

const guard = (check: string | null, jsx: string) => (check ? `{${check} && (${jsx})}` : jsx);

/** Column definitions for fields, plus the lookups (id -> name) the reference columns need */
function columnSource(
    fields: Field[],
    context: PageContext,
    imports: Imports,
    lookups: Map<string, string>,
    sortable: (field: Field) => boolean
): string {
    const { ui } = context;
    return `[${fields
        .map(field => {
            const parts = [`key: ${JSON.stringify(field.name)}`, `label: ${ui.label(field.label)}`, `kind: ${JSON.stringify(cellKind(field))}`];
            if (sortable(field)) parts.push('sortable: true');
            if (field.reference) {
                const source = referenceSource(context.models, field.reference, 'Labels');
                if (source) {
                    imports.add(source.importPath, source.hook);
                    lookups.set(source.variable, `useLabels(${listHookCall(source.model)}.data, ${JSON.stringify(field.reference.idKey)}, ${JSON.stringify(field.reference.display)})`);
                    parts.push(`lookup: ${JSON.stringify(source.variable)}`);
                }
            }
            if (field.cellComponent) {
                const Component = importComponent(imports, field.cellComponent);
                parts.push(`render: (value, row) => <${Component} value={value} row={row} />`);
            }
            return `\n    { ${parts.join(', ')} },`;
        })
        .join('')}\n]`;
}

function lookupsSource(lookups: Map<string, string>): string {
    if (lookups.size === 0) return '';
    return `${[...lookups].map(([variable, call]) => `\n    const ${variable} = ${call};`).join('')}
    const lookups = useMemo(() => ({ ${[...lookups.keys()].join(', ')} }), [${[...lookups.keys()].join(', ')}]);`;
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

export function actionVar(name: string): string {
    return `${name.charAt(0).toLowerCase()}${name.slice(1)}Mutation`;
}

/** "Status: All" as the empty choice of a filter */
function filterPlaceholder(ui: Ui, label: string): string {
    return templateExpression('{label}: {all}', { label: ui.labelValue(label), all: { code: ui.t('filterAll') } }).replace(/\$\{"([^"]*)"\}/g, '$1');
}

function filterControl(filter: Filter, context: PageContext, imports: Imports, options: Map<string, string>): string {
    const { ui } = context;
    const name = JSON.stringify(filter.name);
    const value = `filters[${name}] as never`;
    const label = ui.label(filter.label);
    const select = (optionsCode: string) =>
        `<NativeSelect aria-label={${label}} className="w-auto min-w-36" value={${value}} onChange={(value) => setFilter(${name}, value)} placeholder={${filterPlaceholder(ui, filter.label)}} options={${optionsCode}} />`;
    switch (filter.kind) {
        case 'enum':
            return select(`[${(filter.options ?? []).map(option => `{ value: ${JSON.stringify(option)}, label: ${ui.label(humanize(String(option)) || String(option))} }`).join(', ')}]`);
        case 'boolean':
            return select(`[{ value: true, label: ${ui.t('yes')} }, { value: false, label: ${ui.t('no')} }]`);
        case 'reference': {
            const source = filter.reference && referenceSource(context.models, filter.reference, 'Options');
            if (!source || !filter.reference) break;
            imports.add(source.importPath, source.hook);
            options.set(source.variable, `useOptions(${listHookCall(source.model)}.data, ${JSON.stringify(filter.reference.idKey)}, ${JSON.stringify(filter.reference.display)})`);
            return select(source.variable);
        }
        case 'number':
            return `<Input type="number" aria-label={${label}} placeholder={${label}} className="w-36" value={(filters[${name}] as number | undefined) ?? ""} onChange={(e) => setFilter(${name}, e.target.value === "" ? undefined : e.target.valueAsNumber)} />`;
        case 'date':
            return `<Input type="date" aria-label={${label}} className="w-auto" value={(filters[${name}] as string | undefined) ?? ""} onChange={(e) => setFilter(${name}, e.target.value || undefined)} />`;
        default:
            break;
    }
    return `<Input aria-label={${label}} placeholder={${label}} className="w-44" value={(filters[${name}] as string | undefined) ?? ""} onChange={(e) => setFilter(${name}, e.target.value || undefined)} />`;
}

export function generateListPage(model: DashboardModel, context: PageContext, formImport: string): string {
    const { router, ui } = context;
    const { slug } = model;
    const imports = new Imports();
    const { create, delete: remove } = model.crud;
    const hooks = hookNames(model);
    const perms = model.permissions;
    const canCreate = permissionCheck(context, perms.create);
    const canUpdate = permissionCheck(context, perms.update);
    const canDelete = permissionCheck(context, perms.delete);
    const canView = permissionCheck(context, perms.view);
    const hasEdit = model.pages.edit;
    const hasDetail = model.pages.detail;
    const rowActions = model.actions.filter(action => !action.hidden);
    const hasActionsColumn = hasEdit || !!remove || rowActions.length > 0;
    const bulk = !!remove;
    const formActions = rowActions.filter(action => action.fields);
    const confirmActions = rowActions.filter(action => !action.fields);
    const usesDialogs = !!remove || rowActions.length > 0;
    const columns = tableColumns(model);
    const labels = { plural: ui.lower(model.pluralLabel), singular: ui.lower(model.singularLabel), Singular: ui.labelValue(model.singularLabel) };
    const modes = listModes(model);
    const filters = model.filters;
    const queryEntries = [...serverQuerySource(modes), ...(filters.length > 0 ? ['...debouncedFilters'] : [])];
    const usesQuery = queryEntries.length > 0;
    const hasSearch = modes.search !== 'none';
    const hasSort = modes.sort !== 'none';
    const rowId = `row[${JSON.stringify(model.idKey)}]`;

    const lookups = new Map<string, string>();
    const columnsCode = columnSource(columns, context, imports, lookups, field => modes.sort !== 'none' && isScalar(field) && !field.reference && !field.cellComponent);
    const filterOptions = new Map<string, string>();
    const filterControls = filters.map(filter => filterControl(filter, context, imports, filterOptions));

    const colSpan = ['columns.length', hasActionsColumn && '1', bulk && '1'].filter(Boolean).join(' + ');
    const editHref = `{\`/${slug}/\${${rowId}}/edit\`}`;
    const actionsCell = hasActionsColumn ? `
                                    <TableCell className="space-x-2 text-right whitespace-nowrap">${rowActions.map(action => `
                                        ${guard(permissionCheck(context, perms.actions[action.Name]), `<Button variant="outline" size="sm" onClick={() => setPending({ kind: ${actionKind(action.Name)}, id: ${rowId} })}>
                                            {${ui.label(action.label)}}
                                        </Button>`)}`).join('')}${hasEdit ? `
                                        ${guard(canUpdate, router.link(editHref, `{${ui.t('edit')}}`, 'buttonVariants({ variant: "outline", size: "sm" })'))}` : ''}${remove ? `
                                        ${guard(canDelete, `<Button variant="destructive" size="sm" onClick={() => setPending({ kind: "delete", id: ${rowId} })}>
                                            {${ui.t('delete')}}
                                        </Button>`)}` : ''}
                                    </TableCell>` : '';

    const usesDebounce = modes.search === 'server' || filters.length > 0;
    const reactImports = ['useMemo', 'useState', usesDebounce && 'useEffect'].filter(Boolean).sort();

    const valueText = `formatValue(columnValue(row, column, lookups), column.kind)`;
    const clientPipeline = [
        modes.search === 'client' &&
            `if (search.trim()) {
            const term = search.trim().toLowerCase();
            rows = rows.filter((row) => columns.some((column) => ${valueText}.toLowerCase().includes(term)));
        }`,
        modes.sort === 'client' &&
            `if (sort) {
            rows = [...rows].sort((a, b) => {
                const result = compareValues(a[sort.key], b[sort.key]);
                return sort.direction === "asc" ? result : -result;
            });
        }`,
    ].filter(Boolean);
    const memoDeps = ['data', modes.search === 'client' && 'search', modes.search === 'client' && lookups.size > 0 && 'lookups', modes.sort === 'client' && 'sort'].filter(Boolean);

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

    const pageValues: Record<string, Value> = { page: { code: 'currentPage + 1' }, count: { code: 'pageCount' } };
    const pageLabel = `{pageCount !== undefined ? ${ui.t('pageOf', pageValues)} : ${ui.t('page', { page: pageValues.page })}}`;

    imports.add(`@/hooks/use${model.Plural}`, hooks.list, remove && hooks.delete, bulk && hooks.deleteMany, ...rowActions.map(action => `use${action.Name}`));
    if (formActions.length > 0) imports.add(formImport, ...formActions.map(action => `${action.Name}Form`));
    const closeDialog = '() => setPending(null)';

    const dialogs = [
        remove &&
            `<ConfirmDialog
                open={pending?.kind === "delete"}
                onClose={${closeDialog}}
                title={${ui.t('deleteTitle', labels)}}
                description={${ui.t('deleteDescription')}}
                confirmLabel={${ui.t('delete')}}
                destructive
                pending={deleteMutation.isPending}
                onConfirm={() => pending && deleteMutation.mutate(pending.id, { onSuccess: ${closeDialog} })}
            />`,
        bulk &&
            `<ConfirmDialog
                open={pending?.kind === "deleteMany"}
                onClose={${closeDialog}}
                title={${ui.t('deleteManyTitle', { count: { code: 'selectedIds.length' } })}}
                description={${ui.t('deleteDescription')}}
                confirmLabel={${ui.t('delete')}}
                destructive
                pending={deleteManyMutation.isPending}
                onConfirm={() =>
                    deleteManyMutation.mutate(selectedIds, {
                        onSettled: () => {
                            setSelected([]);
                            setPending(null);
                        },
                    })
                }
            />`,
        ...confirmActions.map(
            action => `<ConfirmDialog
                open={pending?.kind === ${actionKind(action.Name)}}
                onClose={${closeDialog}}
                title={${ui.t('actionConfirm', { action: ui.labelValue(action.label) })}}
                confirmLabel={${ui.label(action.label)}}
                pending={${actionVar(action.Name)}.isPending}
                onConfirm={() => pending && ${actionVar(action.Name)}.mutate(pending.id, { onSuccess: ${closeDialog} })}
            />`
        ),
        ...formActions.map(
            action => `<Dialog open={pending?.kind === ${actionKind(action.Name)}} onClose={${closeDialog}} title={${ui.label(action.label)}}>
                {pending?.kind === ${actionKind(action.Name)} && (
                    <${action.Name}Form
                        submitLabel={${ui.label(action.label)}}
                        isSubmitting={${actionVar(action.Name)}.isPending}
                        error={${actionVar(action.Name)}.error}
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

    const plainCell = '<CellValue row={row} column={column} lookups={lookups} />';
    const detailLink = router.link(`{\`/${slug}/\${${rowId}}\`}`, plainCell, '"font-medium underline-offset-4 hover:underline"');
    const firstCell = hasDetail ? `index === 0${canView ? ` && ${canView}` : ''} ? (\n${detailLink}\n) : (\n${plainCell}\n)` : plainCell;

    const fieldsImports = [
        'CellValue',
        'downloadCsv',
        'extractRows',
        (modes.search === 'client') && 'columnValue',
        (modes.search === 'client') && 'formatValue',
        filters.some(filter => ['enum', 'boolean', 'reference'].includes(filter.kind)) && 'NativeSelect',
        filterOptions.size > 0 && 'useOptions',
        lookups.size > 0 && 'useLabels',
        'type Column',
        clientPipeline.length > 0 && 'type Row',
    ].filter(Boolean);
    imports.add(FIELDS_IMPORT, ...(fieldsImports as string[]));
    if (usesDialogs) imports.add(DIALOG_IMPORT, (confirmActions.length > 0 || remove) && 'ConfirmDialog', formActions.length > 0 && 'Dialog');
    const needsInput = hasSearch || filters.some(filter => !['enum', 'boolean'].includes(filter.kind) && !(filter.kind === 'reference' && filterOptions.size > 0));
    const usesCan = [canCreate, canUpdate, canDelete, canView, ...rowActions.map(action => permissionCheck(context, perms.actions[action.Name]))].some(Boolean);
    if (usesCan) imports.add(SESSION_IMPORT, 'can');

    const body = `
const PAGE_SIZE = ${ui.pageSize};

const columns: Column[] = ${columnsCode};
${lookups.size === 0 ? `
const lookups: Record<string, Map<string, string>> = {};
` : ''}${hasSort ? `
type Sort = { key: string; direction: "asc" | "desc" } | null;
` : ''}${modes.sort === 'client' ? `
function compareValues(a: unknown, b: unknown) {
    if (a === b) return 0;
    if (a === null || a === undefined) return 1;
    if (b === null || b === undefined) return -1;
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a).localeCompare(String(b), undefined, { numeric: true });
}
` : ''}${usesDebounce ? `
function useDebouncedValue<T>(value: T, delay = 300) {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);
    return debounced;
}
` : ''}
export default function ${model.Plural}List() {${hasSearch ? `
    const [search, setSearch] = useState("");` : ''}${hasSort ? `
    const [sort, setSort] = useState<Sort>(null);` : ''}
    const [page, setPage] = useState(0);${filters.length > 0 ? `
    const [filters, setFilters] = useState<Record<string, unknown>>({});
    const debouncedFilters = useDebouncedValue(filters);` : ''}${bulk ? `
    const [selected, setSelected] = useState<Array<string | number>>([]);` : ''}${usesDialogs ? `
    // The row a confirmation or action dialog is open for
    const [pending, setPending] = useState<{ kind: string; id: string | number } | null>(null);` : ''}${modes.search === 'server' ? `
    const debouncedSearch = useDebouncedValue(search.trim());` : ''}
${usesQuery ? `
    const query = {
        ${queryEntries.join(',\n        ')},
    };
    const { data, isLoading, error } = ${hooks.list}(query as Parameters<typeof ${hooks.list}>[0]);` : `
    const { data, isLoading, error } = ${hooks.list}();`}${remove ? `
    const deleteMutation = ${hooks.delete}();
    const deleteManyMutation = ${hooks.deleteMany}();` : ''}${rowActions.map(action => `
    const ${actionVar(action.Name)} = use${action.Name}();`).join('')}${lookupsSource(lookups)}${[...filterOptions].map(([variable, call]) => `
    const ${variable} = ${call};`).join('')}

    ${clientPipeline.length > 0 ? `const rows = useMemo(() => {
        let rows: Row[] = extractRows(data);
        ${clientPipeline.join('\n        ')}
        return rows;
    }, [${memoDeps.join(', ')}]);` : 'const rows = useMemo(() => extractRows(data), [data]);'}

    ${pagination}${bulk ? `
    const pageIds = pageRows.map((row) => ${rowId} as string | number);
    const selectedIds = selected.filter((id) => pageIds.includes(id));
    const allSelected = pageIds.length > 0 && selectedIds.length === pageIds.length;` : ''}
${hasSort ? `
    const toggleSort = (key: string) => {
        setSort((current) =>
            current?.key !== key ? { key, direction: "asc" } : current.direction === "asc" ? { key, direction: "desc" } : null
        );
        setPage(0);
    };
` : ''}${filters.length > 0 ? `
    const setFilter = (name: string, value: unknown) => {
        setFilters((current) => ({ ...current, [name]: value === "" || value === null ? undefined : value }));
        setPage(0);
    };
    const hasFilters = Object.values(filters).some((value) => value !== undefined);
` : ''}
    return (
        <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4 space-y-0">
                <div className="space-y-1.5">
                    <CardTitle>{${ui.label(model.pluralLabel)}}</CardTitle>
                    <CardDescription>{${model.description ? ui.label(model.description) : ui.t('manage', labels)}}</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => downloadCsv(${JSON.stringify(`${slug}.csv`)}, columns, pageRows, lookups)} disabled={pageRows.length === 0}>
                        {${ui.t('exportCsv')}}
                    </Button>${create ? `
                    ${guard(canCreate, router.link(`"/${slug}/create"`, `{${ui.t('addNew')}}`, 'buttonVariants()'))}` : ''}
                </div>
            </CardHeader>
            <CardContent className="space-y-4">${hasSearch || filters.length > 0 ? `
                <div className="flex flex-wrap items-center gap-2">${hasSearch ? `
                    <Input
                        placeholder={${ui.t('searchPlaceholder', labels)}}
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value);
                            setPage(0);
                        }}
                        className="max-w-sm"
                    />` : ''}${filterControls.map(control => `
                    ${control}`).join('')}${filters.length > 0 ? `
                    {hasFilters && (
                        <Button variant="ghost" size="sm" onClick={() => { setFilters({}); setPage(0); }}>
                            {${ui.t('clearFilters')}}
                        </Button>
                    )}` : ''}
                </div>` : ''}${bulk ? `
                {selectedIds.length > 0 && (
                    <div className="flex items-center gap-3 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                        <span>{${ui.t('selected', { count: { code: 'selectedIds.length' } })}}</span>
                        ${guard(canDelete, `<Button variant="destructive" size="sm" onClick={() => setPending({ kind: "deleteMany", id: "" })}>
                            {${ui.t('deleteSelected')}}
                        </Button>`)}
                    </div>
                )}` : ''}
                <Table>
                    <TableHeader>
                        <TableRow>${bulk ? `
                            <TableHead className="w-10">
                                <Checkbox
                                    aria-label={${ui.t('selectAll')}}
                                    checked={allSelected}
                                    onCheckedChange={(checked) => setSelected(checked === true ? pageIds : [])}
                                />
                            </TableHead>` : ''}
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
                            <TableHead className="text-right">{${ui.t('actions')}}</TableHead>` : ''}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={${colSpan}} className="h-24 text-center">{${ui.t('loading')}}</TableCell>
                            </TableRow>
                        ) : error ? (
                            <TableRow>
                                <TableCell colSpan={${colSpan}} className="h-24 text-center text-destructive">
                                    {${ui.t('loadFailed', labels)}}: {error.message}
                                </TableCell>
                            </TableRow>
                        ) : pageRows.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={${colSpan}} className="h-24 text-center text-muted-foreground">
                                    ${hasSearch || filters.length > 0 ? `{${[hasSearch && 'search', filters.length > 0 && 'hasFilters'].filter(Boolean).join(' || ')} ? ${ui.t('noResults')} : ${ui.t('empty', labels)}}` : `{${ui.t('empty', labels)}}`}
                                </TableCell>
                            </TableRow>
                        ) : (
                            pageRows.map((row, index) => (
                                <TableRow key={${rowId} ?? index}${bulk ? ` data-state={selected.includes(${rowId}) ? "selected" : undefined}` : ''}>${bulk ? `
                                    <TableCell>
                                        <Checkbox
                                            aria-label={${ui.t('selectRow')}}
                                            checked={selected.includes(${rowId})}
                                            onCheckedChange={(checked) =>
                                                setSelected((current) => (checked === true ? [...current, ${rowId}] : current.filter((id) => id !== ${rowId})))
                                            }
                                        />
                                    </TableCell>` : ''}
                                    {columns.map((column${hasDetail ? ', index' : ''}) => (
                                        <TableCell key={column.key}>
                                            {${firstCell}}
                                        </TableCell>
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
                        {${ui.t('previous')}}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setPage(currentPage + 1)} disabled={!hasNextPage}>
                        {${ui.t('next')}}
                    </Button>
                </div>
            </CardContent>${dialogs.length > 0 ? `
            ${dialogs.join('\n            ')}` : ''}
        </Card>
    );
}
`;
    const uiImports = [
        `import { Button${hasEdit || create ? ', buttonVariants' : ''} } from "@/components/ui/button";`,
        'import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";',
        bulk && 'import { Checkbox } from "@/components/ui/checkbox";',
        needsInput && 'import { Input } from "@/components/ui/input";',
        'import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";',
    ].filter(Boolean);
    const usesLink = hasEdit || !!create || hasDetail;
    return `${router.directive}${HEADER}import { ${reactImports.join(', ')} } from "react";
${usesLink ? `${router.linkImport}\n` : ''}${uiImports.join('\n')}
${imports}${i18nImport(ui, body, I18N_IMPORT)}
${body}`;
}

// Multipart endpoints get FormData; JSON endpoints get the form values as they are
function submitValues(op: Operation, mutation: string): string {
    const value = op.body && op.body.multipart ? 'toFormData(values)' : 'values';
    return `${value} as Parameters<typeof ${mutation}.mutate>[0]`;
}

export function generateCreatePage(model: DashboardModel, context: PageContext, formImport: string): string {
    const { router, ui } = context;
    const hooks = hookNames(model);
    const create = model.crud.create as Operation;
    const multipart = !!create.body?.multipart;
    const labels = { singular: ui.lower(model.singularLabel), Singular: ui.labelValue(model.singularLabel) };

    const body = `
export default function Create${model.Singular}() {
    ${router.navigatorSetup}
    const createMutation = ${hooks.create}();

    return (
        <Card className="max-w-2xl">
            <CardHeader>
                <CardTitle>{${ui.t('createTitle', labels)}}</CardTitle>
            </CardHeader>
            <CardContent>
                <${model.Singular}CreateForm
                    onSubmit={(values) =>
                        createMutation.mutate(${submitValues(create, 'createMutation')}, {
                            onSuccess: () => ${router.navigate(`"/${model.slug}"`)},
                        })
                    }
                    isSubmitting={createMutation.isPending}
                    error={createMutation.error}
                    submitLabel={${ui.t('create')}}
                />
            </CardContent>
        </Card>
    );
}
`;
    return `${router.directive}${HEADER}${router.navigationImport(false)}
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";${multipart ? `
import { toFormData } from "${FIELDS_IMPORT}";` : ''}
import { ${hooks.create} } from "@/hooks/use${model.Plural}";
import { ${model.Singular}CreateForm } from "${formImport}";${i18nImport(ui, body)}
${body}`;
}

export function generateEditPage(model: DashboardModel, context: PageContext, formImport: string): string {
    const { router, ui } = context;
    const hooks = hookNames(model);
    const update = model.crud.update as Operation;
    const multipart = !!update.body?.multipart;
    const labels = { singular: ui.lower(model.singularLabel), Singular: ui.labelValue(model.singularLabel) };
    // Back to the record when it has a detail page
    const back = model.pages.detail ? `\`/${model.slug}/\${id}\`` : `"/${model.slug}"`;

    const body = `
export default function Edit${model.Singular}() {
    ${router.paramsSetup}
    ${router.navigatorSetup}
    const { data, isLoading, error } = ${hooks.detail}(id);
    const updateMutation = ${hooks.update}(id ?? "");

    return (
        <Card className="max-w-2xl">
            <CardHeader>
                <CardTitle>{${ui.t('editTitle', labels)}}</CardTitle>
            </CardHeader>
            <CardContent>
                {error ? (
                    <p className="text-sm text-destructive">{${ui.t('loadOneFailed')}}: {error.message}</p>
                ) : isLoading || !data ? (
                    <p className="text-sm text-muted-foreground">{${ui.t('loading')}}</p>
                ) : (
                    <${model.Singular}EditForm
                        key={id}
                        defaultValues={data}
                        onSubmit={(values) =>
                            updateMutation.mutate(${submitValues(update, 'updateMutation')}, {
                                onSuccess: () => ${router.navigate(back)},
                            })
                        }
                        isSubmitting={updateMutation.isPending}
                        error={updateMutation.error}
                        submitLabel={${ui.t('save')}}
                    />
                )}
            </CardContent>
        </Card>
    );
}
`;
    return `${router.directive}${HEADER}${router.navigationImport(true)}
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";${multipart ? `
import { toFormData } from "${FIELDS_IMPORT}";` : ''}
import { ${hooks.detail}, ${hooks.update} } from "@/hooks/use${model.Plural}";
import { ${model.Singular}EditForm } from "${formImport}";${i18nImport(ui, body)}
${body}`;
}

interface Tab {
    key: string;
    label: string;
    component: string;
    source: string;
}

/** Lists shown under a record: its sub-resources (GET /users/{id}/posts) and resources filtered by it (GET /posts?userId=) */
function detailTabs(model: DashboardModel, context: PageContext, imports: Imports): Tab[] {
    const tabs: Tab[] = [];
    for (const sub of model.subResources) {
        const lookups = new Map<string, string>();
        const fields = sub.columns.filter(field => isDisplayable(field) && !field.writeOnly && !field.hidden.table);
        const columnsCode = columnSource(fields, context, imports, lookups, () => false);
        imports.add(`@/hooks/use${model.Plural}`, `use${sub.Name}`);
        const component = `${sub.Name}Tab`;
        tabs.push({
            key: sub.Name,
            label: sub.label,
            component,
            source: `const ${component}Columns: Column[] = ${columnsCode};

function ${component}({ id }: { id: string }) {
    const { data, isLoading, error } = use${sub.Name}(id);${lookupsSource(lookups)}
    return <DataTable columns={${component}Columns} rows={extractRows(data)} isLoading={isLoading} error={error}${lookups.size > 0 ? ' lookups={lookups}' : ''} />;
}`,
        });
    }
    // Other resources whose list can be filtered by this one: posts?userId=
    for (const other of context.dashboardModels) {
        const filter = other.filters.find(candidate => candidate.kind === 'reference' && candidate.reference?.resource === model.key);
        if (!filter || !other.crud.list) continue;
        const lookups = new Map<string, string>();
        const fields = tableColumns(other).filter(field => field.name !== filter.name);
        const columnsCode = columnSource(fields, context, imports, lookups, () => false);
        const otherHooks = hookNames(other);
        imports.add(`@/hooks/use${other.Plural}`, otherHooks.list);
        const component = `${other.Plural}Of${model.Singular}Tab`;
        const idValue = model.crud.retrieve?.pathParams[0]?.isNumber ? 'Number(id)' : 'id';
        tabs.push({
            key: other.key,
            label: other.pluralLabel,
            component,
            source: `const ${component}Columns: Column[] = ${columnsCode};

function ${component}({ id }: { id: string }) {
    const { data, isLoading, error } = ${listHookCall(other, [`${JSON.stringify(filter.name)}: ${idValue}`])};${lookupsSource(lookups)}
    return <DataTable columns={${component}Columns} rows={extractRows(data)} isLoading={isLoading} error={error}${lookups.size > 0 ? ' lookups={lookups}' : ''} />;
}`,
        });
    }
    return tabs;
}

export function generateDetailPage(model: DashboardModel, context: PageContext): string {
    const { router, ui } = context;
    const imports = new Imports();
    const hooks = hookNames(model);
    const remove = model.crud.delete;
    const canUpdate = permissionCheck(context, model.permissions.update);
    const canDelete = permissionCheck(context, model.permissions.delete);
    const labels = { singular: ui.lower(model.singularLabel), Singular: ui.labelValue(model.singularLabel) };
    const fields = model.columns.filter(field => !field.writeOnly && !field.hidden.table);
    const lookups = new Map<string, string>();
    const columnsCode = columnSource(fields, context, imports, lookups, () => false);
    const tabs = detailTabs(model, context, imports);
    const display = ['name', 'title', 'label', 'displayName', 'fullName', 'username', 'email'].find(name => model.columns.some(field => field.name === name));

    imports.add(`@/hooks/use${model.Plural}`, hooks.detail, remove && hooks.delete);
    imports.add(FIELDS_IMPORT, 'CellValue', 'type Column', 'type Row', lookups.size > 0 && 'useLabels', tabs.length > 0 && 'DataTable', tabs.length > 0 && 'extractRows');
    if (remove) imports.add(DIALOG_IMPORT, 'ConfirmDialog');
    if (canUpdate || canDelete) imports.add(SESSION_IMPORT, 'can');

    const body = `
const fields: Column[] = ${columnsCode};
${lookups.size === 0 ? `
const lookups: Record<string, Map<string, string>> = {};
` : ''}
${tabs.map(tab => tab.source).join('\n\n')}${tabs.length > 0 ? `

const tabs = [${tabs.map(tab => `\n    { key: ${JSON.stringify(tab.key)}, label: ${ui.label(tab.label)}, Component: ${tab.component} },`).join('')}
];
` : ''}
export default function ${model.Singular}Detail() {
    ${router.paramsSetup}${remove ? `
    ${router.navigatorSetup}` : ''}
    const { data, isLoading, error } = ${hooks.detail}(id);${remove ? `
    const deleteMutation = ${hooks.delete}();
    const [confirming, setConfirming] = useState(false);` : ''}${tabs.length > 0 ? `
    const [tab, setTab] = useState(tabs[0].key);
    const ActiveTab = tabs.find((item) => item.key === tab)?.Component ?? tabs[0].Component;` : ''}${lookupsSource(lookups)}
    const record = (data ?? {}) as Row;

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4 space-y-0">
                    <div className="space-y-1.5">
                        <CardDescription>{${ui.label(model.singularLabel)}}</CardDescription>
                        <CardTitle>{${display ? `String(record[${JSON.stringify(display)}] ?? id ?? "")` : 'id'}}</CardTitle>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        ${router.link(`"/${model.slug}"`, `{${ui.t('back')}}`, 'buttonVariants({ variant: "outline" })')}${model.pages.edit ? `
                        ${guard(canUpdate, router.link(`{\`/${model.slug}/\${id}/edit\`}`, `{${ui.t('edit')}}`, 'buttonVariants({ variant: "outline" })'))}` : ''}${remove ? `
                        ${guard(canDelete, `<Button variant="destructive" onClick={() => setConfirming(true)}>
                            {${ui.t('delete')}}
                        </Button>`)}` : ''}
                    </div>
                </CardHeader>
                <CardContent>
                    {error ? (
                        <p className="text-sm text-destructive">{${ui.t('loadOneFailed')}}: {error.message}</p>
                    ) : isLoading || !data ? (
                        <p className="text-sm text-muted-foreground">{${ui.t('loading')}}</p>
                    ) : (
                        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                            {fields.map((field) => (
                                <div key={field.key} className="min-w-0 space-y-1">
                                    <dt className="text-sm text-muted-foreground">{field.label}</dt>
                                    <dd className="text-sm break-words">
                                        <CellValue row={record} column={field} lookups={lookups} />
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    )}
                </CardContent>
            </Card>${tabs.length > 0 ? `
            <Card>
                <CardHeader>
                    <div role="tablist" className="flex flex-wrap gap-1">
                        {tabs.map((item) => (
                            <Button
                                key={item.key}
                                role="tab"
                                aria-selected={item.key === tab}
                                variant={item.key === tab ? "secondary" : "ghost"}
                                size="sm"
                                onClick={() => setTab(item.key)}
                            >
                                {item.label}
                            </Button>
                        ))}
                    </div>
                </CardHeader>
                <CardContent>{id && <ActiveTab id={String(id)} />}</CardContent>
            </Card>` : ''}${remove ? `
            <ConfirmDialog
                open={confirming}
                onClose={() => setConfirming(false)}
                title={${ui.t('deleteTitle', labels)}}
                description={${ui.t('deleteDescription')}}
                confirmLabel={${ui.t('delete')}}
                destructive
                pending={deleteMutation.isPending}
                onConfirm={() => id && deleteMutation.mutate(id, { onSuccess: () => ${router.navigate(`"/${model.slug}"`)} })}
            />` : ''}
        </div>
    );
}
`;
    const reactImports = [(remove || tabs.length > 0) && 'useState', lookups.size > 0 && 'useMemo'].filter(Boolean).sort();
    return `${router.directive}${HEADER}${reactImports.length > 0 ? `import { ${reactImports.join(', ')} } from "react";\n` : ''}${router.linkImport}
${remove ? router.navigationImport(true) : router.navigationImport(true).replace(/useNavigate, |, useRouter/, '')}
import { ${remove || tabs.length > 0 ? 'Button, ' : ''}buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
${imports}${i18nImport(ui, body)}
${body}`;
}

/** The home page: one card per resource with its number of records */
export function generateHomePage(context: PageContext): string {
    const { router, ui, dashboardModels } = context;
    const imports = new Imports();
    const counters: string[] = [];
    const cards: string[] = [];
    const icons = new Set<string>();
    let usesCan = false;
    for (const model of dashboardModels) {
        const hooks = hookNames(model);
        imports.add(`@/hooks/use${model.Plural}`, hooks.list);
        const caps = model.listCapabilities;
        const counter = `${model.Plural}Count`;
        // With server paging, ask for one row and read the total; otherwise count the rows of the first page
        let source: string;
        if (caps?.serverPaging && caps.size && caps.totalPath) {
            const entries = [caps.page && `${JSON.stringify(caps.page.name)}: ${caps.page.base}`, caps.offset && `${JSON.stringify(caps.offset.name)}: 0`, `${JSON.stringify(caps.size.name)}: 1`].filter(Boolean);
            source = `const { data, isLoading } = ${hooks.list}({ ${entries.join(', ')} } as Parameters<typeof ${hooks.list}>[0]);
    const total = (data as Record<string, any> | undefined)${caps.totalPath.map(key => `?.[${JSON.stringify(key)}]`).join('')};
    const count = typeof total === "number" ? total : undefined;
    const more = false;`;
        } else {
            imports.add(FIELDS_IMPORT, 'extractRows');
            source = `const { data, isLoading } = ${listHookCall(model)};
    const count = data === undefined ? undefined : extractRows(data).length;
    const more = ${caps?.serverPaging ? `count !== undefined && count >= ${OPTIONS_PAGE_SIZE}` : 'false'};`;
        }
        counters.push(`function ${counter}() {
    ${source}
    return (
        <span className="text-3xl font-semibold tabular-nums">
            {isLoading ? "…" : count === undefined ? "—" : \`\${count.toLocaleString(${ui.locales.length > 1 ? 'getLocale()' : ''})}\${more ? "+" : ""}\`}
        </span>
    );
}`);
        const icon = model.icon ? iconName(model.icon) : null;
        if (icon) icons.add(icon);
        const check = permissionCheck(context, model.permissions.list);
        if (check) usesCan = true;
        cards.push(
            guard(
                check,
                router.link(
                    `"/${model.slug}"`,
                    `
                    <Card className="h-full transition-colors hover:bg-muted/50">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0">
                            <CardDescription>{${ui.label(model.pluralLabel)}}</CardDescription>${icon ? `
                            <${icon} className="size-4 text-muted-foreground" aria-hidden />` : ''}
                        </CardHeader>
                        <CardContent>
                            <${counter} />
                        </CardContent>
                    </Card>
                `,
                    '"block"'
                )
            )
        );
    }
    if (icons.size > 0) imports.add('lucide-react', ...icons);
    if (usesCan) imports.add(SESSION_IMPORT, 'can');
    if (ui.locales.length > 1) imports.add(I18N_IMPORT, 'getLocale');

    const body = `
${counters.join('\n\n')}

export default function HomePage() {
    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-semibold tracking-tight">{${ui.label(ui.title)}}</h1>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                ${cards.join('\n                ')}
            </div>
        </div>
    );
}
`;
    return `${router.directive}${HEADER}${router.linkImport}
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
${imports}${i18nImport(ui, body)}
${body}`;
}

export { I18N_IMPORT };
