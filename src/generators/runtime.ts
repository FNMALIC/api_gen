// Shared runtime of the generated dashboard: components/api-gen/fields.tsx and components/api-gen/i18n.ts
import { HEADER } from './api.ts';
import { LOCALES, LOCALE_NAMES } from '../locales.ts';
import { isMultiLocale, type Ui } from '../ui.ts';

// components/api-gen/fields.tsx: inputs shadcn/ui doesn't ship, table cells, and list, CSV and error helpers
export function generateFieldsComponent(ui: Ui): string {
    const multi = isMultiLocale(ui);
    return `"use client";
${HEADER}import { useMemo, useState, type ComponentProps, type KeyboardEvent, type ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";${multi ? `
import { getLocale, t } from "./i18n";` : ''}

/** Marker stored while a JsonInput holds text that isn't valid JSON, so validation can reject it */
export const INVALID_JSON = "__api_gen_invalid_json__";

/** Currency of amount columns (ui.currency in the design file) */
const CURRENCY = ${JSON.stringify(ui.currency)};
const LOCALE: string | undefined = ${multi ? 'getLocale()' : 'undefined'};

export type Row = Record<string, any>;
export type CellKind = "text" | "number" | "currency" | "boolean" | "badge" | "date" | "datetime" | "link" | "email" | "image" | "list" | "json";
export type Option = { value: string | number | boolean; label: string };

/** A table column: the row property, its label and how to show it */
export interface Column {
    key: string;
    label: string;
    kind?: CellKind;
    sortable?: boolean;
    /** Show the referenced record's name: a key of the lookups passed to the table */
    lookup?: string;
    /** Your own cell component */
    render?: (value: unknown, row: Row) => ReactNode;
}

/** Free-form list of strings or numbers: type a value, then press Enter or comma */
export function ListInput({
    value,
    onChange,
    type = "text",
    placeholder = ${ui.t('listPlaceholder')},
    removeLabel = ${ui.t('remove')},
    id,
}: {
    value?: Array<string | number> | null;
    onChange: (value: Array<string | number>) => void;
    type?: "text" | "number";
    placeholder?: string;
    removeLabel?: string;
    id?: string;
}) {
    const [draft, setDraft] = useState("");
    const items = value ?? [];

    const add = () => {
        const text = draft.trim();
        if (!text) return;
        const item = type === "number" ? Number(text) : text;
        if (typeof item === "number" && Number.isNaN(item)) return;
        onChange([...items, item]);
        setDraft("");
    };

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            add();
        }
    };

    return (
        <div className="space-y-2">
            {items.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {items.map((item, index) => (
                        <span key={\`\${item}-\${index}\`} className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-sm">
                            {String(item)}
                            <button
                                type="button"
                                aria-label={\`\${removeLabel} \${item}\`}
                                className="text-muted-foreground hover:text-foreground"
                                onClick={() => onChange(items.filter((_, i) => i !== index))}
                            >
                                ×
                            </button>
                        </span>
                    ))}
                </div>
            )}
            <Input
                id={id}
                type={type}
                value={draft}
                placeholder={placeholder}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                onBlur={add}
            />
        </div>
    );
}

/** Multiple choice: arrays of enum values, or of ids of another resource */
export function CheckboxGroup({
    options,
    value,
    onChange,
    id,
}: {
    options: { value: string | number; label: string }[];
    value?: Array<string | number> | null;
    onChange: (value: Array<string | number>) => void;
    id?: string;
}) {
    const selected = value ?? [];
    return (
        <div id={id} role="group" className="flex flex-wrap gap-4">
            {options.map((option) => (
                <label key={String(option.value)} className="flex items-center gap-2 text-sm">
                    <Checkbox
                        checked={selected.includes(option.value)}
                        onCheckedChange={(checked) =>
                            onChange(checked === true ? [...selected, option.value] : selected.filter((v) => v !== option.value))
                        }
                    />
                    {option.label}
                </label>
            ))}
        </div>
    );
}

/** Styled native select: works the same with every shadcn/ui setup and on mobile */
export function NativeSelect({
    value,
    onChange,
    options,
    placeholder,
    className,
    ...props
}: Omit<ComponentProps<"select">, "value" | "onChange"> & {
    value?: string | number | boolean | null;
    onChange: (value: any) => void;
    options: Option[];
    placeholder?: string;
}) {
    const selected = value === null || value === undefined ? "" : String(value);
    return (
        <select
            {...props}
            value={selected}
            onChange={(event) => {
                const option = options.find((item) => String(item.value) === event.target.value);
                onChange(option ? option.value : undefined);
            }}
            className={cn(
                "h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none",
                "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                "aria-invalid:border-destructive dark:bg-input/30 [&>option]:bg-background",
                className
            )}
        >
            <option value="">{placeholder}</option>
            {options.map((option) => (
                <option key={String(option.value)} value={String(option.value)}>
                    {option.label}
                </option>
            ))}
        </select>
    );
}

/** JSON editor for nested objects, maps and arrays of objects */
export function JsonInput({ value, onChange, onBlur, id }: { value?: unknown; onChange: (value: unknown) => void; onBlur?: () => void; id?: string }) {
    const [text, setText] = useState(() =>
        value === undefined || value === null || value === INVALID_JSON ? "" : JSON.stringify(value, null, 2)
    );

    return (
        <Textarea
            id={id}
            className="font-mono text-sm"
            rows={4}
            value={text}
            onBlur={onBlur}
            aria-invalid={value === INVALID_JSON}
            onChange={(e) => {
                setText(e.target.value);
                if (e.target.value.trim() === "") return onChange(undefined);
                try {
                    onChange(JSON.parse(e.target.value));
                } catch {
                    onChange(INVALID_JSON);
                }
            }}
        />
    );
}

const pad = (n: number) => String(n).padStart(2, "0");

// ISO date-time <-> the local "YYYY-MM-DDTHH:mm" format datetime-local inputs use
function toLocalInput(value?: string | null) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return \`\${date.getFullYear()}-\${pad(date.getMonth() + 1)}-\${pad(date.getDate())}T\${pad(date.getHours())}:\${pad(date.getMinutes())}\`;
}

/** Date-time picker that reads and writes ISO 8601 strings */
export function DateTimeInput({
    value,
    onChange,
    onBlur,
    name,
    id,
}: {
    value?: string | null;
    onChange: (value: string | undefined) => void;
    onBlur?: () => void;
    name?: string;
    id?: string;
}) {
    return (
        <Input
            id={id}
            type="datetime-local"
            name={name}
            value={toLocalInput(value)}
            onBlur={onBlur}
            onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : undefined)}
        />
    );
}

/** File picker; the selected File is stored in the form */
export function FileInput({
    onChange,
    onBlur,
    name,
    accept,
    id,
}: {
    onChange: (file: File | undefined) => void;
    onBlur?: () => void;
    name?: string;
    accept?: string;
    id?: string;
}) {
    return <Input id={id} type="file" name={name} accept={accept} onBlur={onBlur} onChange={(e) => onChange(e.target.files?.[0])} />;
}

/** Build a multipart/form-data body: files as-is, arrays as repeated keys, objects as JSON */
export function toFormData(values: object): FormData {
    const data = new FormData();
    const append = (key: string, value: unknown) => {
        if (value === undefined || value === null) return;
        if (value instanceof Blob) data.append(key, value);
        else if (typeof value === "object") data.append(key, JSON.stringify(value));
        else data.append(key, String(value));
    };
    for (const [key, value] of Object.entries(values)) {
        if (Array.isArray(value)) value.forEach((item) => append(key, item));
        else append(key, value);
    }
    return data;
}

/** True for values a user left empty: undefined, null, "" and [] */
export function isBlank(value: unknown): boolean {
    return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Blob);

/** Leave cleared optional inputs ("" and undefined) and nested objects that end up empty out of the request */
export function dropEmptyValues<T>(values: T): T {
    if (!isPlainObject(values)) return values;
    const entries = Object.entries(values)
        .filter(([, value]) => value !== "" && value !== undefined)
        .map(([key, value]) => [key, dropEmptyValues(value)] as const)
        .filter(([, value]) => !(isPlainObject(value) && Object.keys(value).length === 0));
    return Object.fromEntries(entries) as T;
}

/** Display a value as text, e.g. in a table cell or a CSV file */
export function formatValue(value: unknown, kind?: CellKind | string): string {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "boolean") return value ? ${ui.t('yes')} : ${ui.t('no')};
    if (Array.isArray(value)) return value.map((item) => formatValue(item)).join(", ");
    if (typeof value === "object") return JSON.stringify(value);
    if ((kind === "currency" || kind === "number") && (typeof value === "number" || (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))))) {
        const options: Intl.NumberFormatOptions = kind === "currency" ? { style: "currency", currency: CURRENCY } : {};
        try {
            return new Intl.NumberFormat(LOCALE, options).format(Number(value));
        } catch {
            return String(value);
        }
    }
    if (kind === "date-time" || kind === "datetime" || kind === "date") {
        const date = new Date(String(value));
        if (!Number.isNaN(date.getTime())) return kind === "date" ? date.toLocaleDateString(LOCALE) : date.toLocaleString(LOCALE);
    }
    return String(value);
}

const badgeClass = "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap";

/** A value shown the way its kind suggests: badges, links, images, amounts and dates */
export function Cell({ value, kind }: { value: unknown; kind?: CellKind }) {
    if (value === null || value === undefined || value === "") return <span className="text-muted-foreground">—</span>;
    switch (kind) {
        case "boolean":
            return (
                <span className={\`\${badgeClass} \${value ? "border-transparent bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}\`}>
                    {formatValue(value === true || value === "true")}
                </span>
            );
        case "badge": {
            const values = Array.isArray(value) ? value : [value];
            return (
                <span className="flex flex-wrap gap-1">
                    {values.map((item, index) => (
                        <span key={index} className={\`\${badgeClass} bg-secondary text-secondary-foreground\`}>
                            {formatValue(item)}
                        </span>
                    ))}
                </span>
            );
        }
        case "link":
            return (
                <a href={String(value)} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline break-all">
                    {String(value)}
                </a>
            );
        case "email":
            return (
                <a href={\`mailto:\${value}\`} className="text-primary underline-offset-4 hover:underline">
                    {String(value)}
                </a>
            );
        case "image":
            return (
                <img
                    src={String(value)}
                    alt=""
                    loading="lazy"
                    className="h-10 w-10 rounded-md border bg-muted object-cover"
                    // A missing image leaves an empty tile rather than the browser's broken-image icon
                    onError={(event) => {
                        event.currentTarget.removeAttribute("src");
                    }}
                />
            );
        case "json":
            return <code className="block max-w-md truncate text-xs">{JSON.stringify(value)}</code>;
        default:
            return <>{formatValue(value, kind)}</>;
    }
}

/** Rows of a list response: plain arrays, or wrapped like { items: [...] }, { success, data: [...] }, { data: { items: [...] } } */
export function extractRows(data: unknown, depth = 0): Row[] {
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
}

/** Choices for a select from another resource's list: its id and the property shown to people */
export function useOptions(data: unknown, idKey: string, display: string): { value: string | number; label: string }[] {
    return useMemo(
        () =>
            extractRows(data)
                .filter((row) => row[idKey] !== null && row[idKey] !== undefined)
                .map((row) => ({ value: row[idKey], label: String(row[display] ?? row[idKey]) })),
        [data, idKey, display]
    );
}

/** id -> name of another resource's records, to show names instead of ids */
export function useLabels(data: unknown, idKey: string, display: string): Map<string, string> {
    return useMemo(() => new Map(extractRows(data).map((row) => [String(row[idKey]), String(row[display] ?? row[idKey])])), [data, idKey, display]);
}

function lookupValue(value: unknown, labels: Map<string, string>): unknown {
    if (Array.isArray(value)) return value.map((item) => labels.get(String(item)) ?? item);
    if (value === null || value === undefined) return value;
    return labels.get(String(value)) ?? value;
}

/** A row's value for a column, with ids replaced by names when the column has a lookup */
export function columnValue(row: Row, column: Column, lookups: Record<string, Map<string, string>> = {}): unknown {
    const lookup = column.lookup ? lookups[column.lookup] : undefined;
    return lookup ? lookupValue(row[column.key], lookup) : row[column.key];
}

export function CellValue({ row, column, lookups }: { row: Row; column: Column; lookups?: Record<string, Map<string, string>> }) {
    if (column.render) return <>{column.render(row[column.key], row)}</>;
    const value = columnValue(row, column, lookups);
    return <Cell value={value} kind={column.lookup ? (Array.isArray(value) ? "badge" : "text") : column.kind} />;
}

/** A read-only table, used for the lists on a record's detail page */
export function DataTable({
    columns,
    rows,
    isLoading,
    error,
    lookups,
}: {
    columns: Column[];
    rows: Row[];
    isLoading?: boolean;
    error?: Error | null;
    lookups?: Record<string, Map<string, string>>;
}) {
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    {columns.map((column) => (
                        <TableHead key={column.key}>{column.label}</TableHead>
                    ))}
                </TableRow>
            </TableHeader>
            <TableBody>
                {isLoading ? (
                    <TableRow>
                        <TableCell colSpan={columns.length} className="h-24 text-center">{${ui.t('loading')}}</TableCell>
                    </TableRow>
                ) : error ? (
                    <TableRow>
                        <TableCell colSpan={columns.length} className="h-24 text-center text-destructive">{error.message}</TableCell>
                    </TableRow>
                ) : rows.length === 0 ? (
                    <TableRow>
                        <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">{${ui.t('noResults')}}</TableCell>
                    </TableRow>
                ) : (
                    rows.map((row, index) => (
                        <TableRow key={index}>
                            {columns.map((column) => (
                                <TableCell key={column.key}>
                                    <CellValue row={row} column={column} lookups={lookups} />
                                </TableCell>
                            ))}
                        </TableRow>
                    ))
                )}
            </TableBody>
        </Table>
    );
}

/** Save rows as a CSV file, with the values as the table shows them */
export function downloadCsv(filename: string, columns: Column[], rows: Row[], lookups?: Record<string, Map<string, string>>) {
    const escape = (text: string) => (/[",\\n\\r]/.test(text) ? \`"\${text.replace(/"/g, '""')}"\` : text);
    const text = (row: Row, column: Column) => {
        const value = columnValue(row, column, lookups);
        return value === null || value === undefined ? "" : formatValue(value, column.kind === "currency" ? "number" : column.kind);
    };
    const lines = [columns.map((column) => escape(column.label)).join(","), ...rows.map((row) => columns.map((column) => escape(text(row, column))).join(","))];
    // The byte order mark makes Excel read the file as UTF-8
    const blob = new Blob(["\\uFEFF" + lines.join("\\r\\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Read a nested property, e.g. readPath(response, ["data", "token"]) */
export function readPath(value: unknown, path: string[]): unknown {
    return path.reduce<unknown>((current, key) => (current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined), value);
}

const firstMessage = (value: unknown): string | null => {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.map(firstMessage).find(Boolean) ?? null;
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        return firstMessage(record.message ?? record.msg ?? record.detail ?? (record.constraints && Object.values(record.constraints as object)));
    }
    return null;
};

const fieldPath = (value: unknown): string | null => {
    if (typeof value === "string") return value.replace(/\\[(\\d+)\\]/g, ".$1");
    if (Array.isArray(value)) {
        // FastAPI: ["body", "email"]
        const parts = value.map(String);
        return (["body", "query", "path"].includes(parts[0]) ? parts.slice(1) : parts).join(".") || null;
    }
    return null;
};

/**
 * Messages per field from a validation error response, whatever its shape:
 * { errors: { email: ["taken"] } }, { errors: [{ field|path|param|property, message|msg }] }, { detail: [{ loc, msg }] }
 */
export function fieldErrors(error: unknown): Record<string, string> {
    const result: Record<string, string> = {};
    const response = (error as { response?: { data?: unknown } } | null | undefined)?.response?.data;
    const bodies = [response, (response as Record<string, unknown> | undefined)?.error, (response as Record<string, unknown> | undefined)?.data];
    for (const body of bodies) {
        if (!body || typeof body !== "object") continue;
        const record = body as Record<string, unknown>;
        const list = record.errors ?? record.detail ?? record.details ?? record.fieldErrors ?? record.violations;
        if (Array.isArray(list)) {
            for (const item of list) {
                if (!item || typeof item !== "object") continue;
                const entry = item as Record<string, unknown>;
                const path = fieldPath(entry.field ?? entry.path ?? entry.param ?? entry.property ?? entry.propertyPath ?? entry.loc ?? entry.name);
                const message = firstMessage(entry);
                if (path && message && !result[path]) result[path] = message;
            }
        } else if (list && typeof list === "object") {
            for (const [key, value] of Object.entries(list)) {
                const message = firstMessage(value);
                if (message) result[key] = message;
            }
        }
    }
    return result;
}
`;
}

// components/api-gen/i18n.ts: wording in every language of ui.locales, switched at runtime
export function generateI18n(ui: Ui): string {
    const dictionaries = Object.fromEntries(
        ui.locales.map(code => [code, code === ui.locale ? ui.strings : LOCALES[code]])
    );
    const translations = Object.fromEntries(ui.locales.map(code => [code, ui.translations[code] ?? {}]));
    return `"use client";
${HEADER}
export const LOCALES = [${ui.locales.map(code => `{ code: ${JSON.stringify(code)}, name: ${JSON.stringify(LOCALE_NAMES[code])} }`).join(', ')}] as const;
export type Locale = (typeof LOCALES)[number]["code"];

const DEFAULT_LOCALE: Locale = ${JSON.stringify(ui.locale)};
const STORAGE_KEY = "api-gen-locale";

const DICTIONARIES: Record<Locale, Record<string, string>> = ${JSON.stringify(dictionaries, null, 4)};

/** Your labels in each language (ui.translations in the design file) */
const TRANSLATIONS: Record<Locale, Record<string, string>> = ${JSON.stringify(translations, null, 4)};

const isLocale = (value: unknown): value is Locale => LOCALES.some((locale) => locale.code === value);

function detectLocale(): Locale {
    if (typeof window === "undefined") return DEFAULT_LOCALE;
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (isLocale(saved)) return saved;
    } catch {
        // storage unavailable: use the browser's language
    }
    const preferred = navigator.languages?.map((language) => language.slice(0, 2)).find(isLocale);
    return preferred ?? DEFAULT_LOCALE;
}

let current: Locale = detectLocale();

export const getLocale = (): Locale => current;

/** Switch language; the page reloads so every label, message and format follows */
export function setLocale(locale: Locale) {
    try {
        localStorage.setItem(STORAGE_KEY, locale);
    } catch {
        // not remembered after this visit
    }
    current = locale;
    window.location.reload();
}

/** A built-in UI string with its {placeholders} filled in */
export function t(key: string, values: Record<string, string | number> = {}): string {
    const text = DICTIONARIES[current]?.[key] ?? DICTIONARIES[DEFAULT_LOCALE][key] ?? key;
    return text.replace(/\\{(\\w+)\\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}

/** One of your labels in the current language */
export const tl = (text: string): string => TRANSLATIONS[current]?.[text] ?? text;
`;
}
