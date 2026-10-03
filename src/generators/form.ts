import { HEADER } from './api.ts';
import { humanize, propertyKey } from '../helpers.ts';
import type { Field, Model } from '../model.ts';
import type { Router } from './dashboard.ts';

export const FIELDS_IMPORT = '@/components/api-gen/fields';

/**
 * What kind of input a schema field gets:
 * file, enum, number, boolean, datetime, string, enumList, list, object (nested fieldset) or json (textarea)
 */
export type FieldKind = 'file' | 'enum' | 'number' | 'boolean' | 'datetime' | 'string' | 'enumList' | 'list' | 'object' | 'json';

export function fieldKind(field: Field): FieldKind {
    if (field.type === 'string' && field.format === 'binary') return 'file';
    if (field.enum && field.enum.length > 0 && field.type !== 'array') return 'enum';
    if (field.type === 'integer' || field.type === 'number') return 'number';
    if (field.type === 'boolean') return 'boolean';
    if (field.type === 'string') return field.format === 'date-time' ? 'datetime' : 'string';
    if (field.type === 'array' && field.items && !field.items.isObject) {
        if (field.items.enum && field.items.enum.length > 0) return 'enumList';
        if (['string', 'integer', 'number'].includes(field.items.type)) return 'list';
    }
    if (field.type === 'object' && field.properties && field.properties.length > 0) return 'object';
    return 'json';
}

const editable = (fields: Field[] | undefined): Field[] => (fields || []).filter(field => !field.readOnly && !(field.hidden && field.hidden.form));

const isNumericEnum = (field: Field) => (field.enum ?? []).every(value => typeof value === 'number');

// "optional" fields also accept null: APIs commonly return null for fields they don't require
function optionality(field: Field, expression: string): string {
    if (field.required) return field.nullable ? `${expression}.nullable()` : expression;
    return `${expression}.nullish()`;
}

function zodType(field: Field): string {
    const label = field.label;
    switch (fieldKind(field)) {
        case 'file':
            return optionality(field, `z.union([z.instanceof(File), z.string()], { message: "${label} is required" })`);
        case 'enum':
            return optionality(
                field,
                isNumericEnum(field)
                    ? `z.union([${(field.enum ?? []).map(value => `z.literal(${value})`).join(', ')}], { message: "${label} is required" })`
                    : `z.enum([${(field.enum ?? []).map(value => JSON.stringify(String(value))).join(', ')}], { message: "${label} is required" })`
            );
        case 'number':
            return optionality(field, `z.number({ message: "${label} must be a number" })${field.type === 'integer' ? '.int()' : ''}`);
        case 'boolean':
            return optionality(field, 'z.boolean()');
        case 'datetime':
        case 'string': {
            let type = `z.string({ message: "${label} is required" })`;
            if (field.required) type += `.min(1, "${label} is required")`;
            if (field.format === 'email') type += '.email("Invalid email")';
            if (field.format === 'uri') type += '.url("Invalid URL")';
            // A cleared optional input holds "", which must pass validation (it is dropped on submit)
            if (!field.required && (field.format === 'email' || field.format === 'uri')) type += '.or(z.literal(""))';
            return optionality(field, type);
        }
        case 'enumList': {
            const values = (field.items?.enum ?? []).map(value => JSON.stringify(String(value))).join(', ');
            return `z.array(z.enum([${values}]))${field.required ? `.min(1, "Select at least one ${label.toLowerCase()}")` : ''}`;
        }
        case 'list': {
            const item = field.items?.type === 'string' ? 'z.string()' : 'z.number()';
            return `z.array(${item})${field.required ? `.min(1, "Add at least one ${label.toLowerCase()}")` : ''}`;
        }
        case 'object': {
            const children = editable(field.properties);
            if (field.required) {
                return `z.object({ ${children.map(child => `${propertyKey(child.name)}: ${zodType(child)}`).join(', ')} })`;
            }
            // An optional object's inputs are always registered, so it arrives as { width: undefined, ... }.
            // Its required children only apply once something in it is filled in.
            const relaxed = children.map(child => `${propertyKey(child.name)}: ${zodType({ ...child, required: false })}`);
            const requiredChildren = children.filter(child => child.required);
            const type = `z.object({ ${relaxed.join(', ')} }).nullish()`;
            if (requiredChildren.length === 0) return type;
            const checks = requiredChildren.map(child => {
                const key = JSON.stringify(child.name);
                return `if (isBlank(value[${key}])) ctx.addIssue({ code: "custom", path: [${key}], message: "${child.label} is required" });`;
            });
            return `${type}.superRefine((value, ctx) => {
                if (!value || Object.values(value).every(isBlank)) return;
                ${checks.join('\n')}
            })`;
        }
        default: {
            let type = 'z.unknown().refine((value) => value !== INVALID_JSON, { message: "Invalid JSON" })';
            if (field.required) type += `.refine((value) => value !== undefined, { message: "${label} is required" })`;
            return type;
        }
    }
}

function defaultValue(field: Field): string {
    switch (fieldKind(field)) {
        case 'boolean':
            return 'false';
        case 'string':
        case 'datetime':
            return '""';
        case 'enumList':
        case 'list':
            return '[]';
        case 'object':
            // Optional objects start empty so their required children only apply once one is filled in
            if (!field.required) return 'undefined';
            return `{ ${editable(field.properties).map(child => `${propertyKey(child.name)}: ${defaultValue(child)}`).join(', ')} }`;
        default:
            return 'undefined';
    }
}

function control(field: Field, path: string): string {
    const name = JSON.stringify(path);
    const label = field.label;
    const description = field.description
        ? `\n<FormDescription>${String(field.description).replace(/[{}<>]/g, '')}</FormDescription>`
        : '';
    const item = (inner: string, className = '') => `
<FormField
    control={form.control}
    name=${name}
    render={({ field }) => (
        <FormItem${className ? ` className="${className}"` : ''}>
            ${inner}${description}
            <FormMessage />
        </FormItem>
    )}
/>`;
    const labelled = (input: string) => `<FormLabel>${label}</FormLabel>
            <FormControl>
                ${input}
            </FormControl>`;

    switch (fieldKind(field)) {
        case 'boolean':
            return item(
                `<FormControl>
                <Checkbox checked={field.value ?? false} onCheckedChange={(checked) => field.onChange(checked === true)} />
            </FormControl>
            <FormLabel>${label}</FormLabel>`,
                'flex flex-row items-center gap-3'
            );
        case 'enum': {
            const numeric = isNumericEnum(field);
            const items = (field.enum ?? [])
                .map(value => `<SelectItem value=${JSON.stringify(String(value))}>${humanize(String(value)) || String(value)}</SelectItem>`)
                .join('\n');
            return item(`<FormLabel>${label}</FormLabel>
            <Select
                onValueChange=${numeric ? '{(value) => field.onChange(Number(value))}' : '{field.onChange}'}
                value={field.value === null || field.value === undefined ? undefined : String(field.value)}
            >
                <FormControl>
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select ${label.toLowerCase()}" />
                    </SelectTrigger>
                </FormControl>
                <SelectContent>
                    ${items}
                </SelectContent>
            </Select>`);
        }
        case 'number':
            return item(labelled(`<Input
                    type="number"
                    {...field}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value === "" ? undefined : e.target.valueAsNumber)}
                />`));
        case 'datetime':
            return item(labelled('<DateTimeInput name={field.name} value={field.value} onChange={field.onChange} onBlur={field.onBlur} />'));
        case 'file':
            return item(labelled('<FileInput name={field.name} onChange={field.onChange} onBlur={field.onBlur} />'));
        case 'enumList': {
            const options = (field.items?.enum ?? [])
                .map(value => `{ value: ${JSON.stringify(String(value))}, label: ${JSON.stringify(humanize(String(value)) || String(value))} }`)
                .join(', ');
            return item(labelled(`<CheckboxGroup options={[${options}]} value={field.value} onChange={field.onChange} />`));
        }
        case 'list':
            return item(
                labelled(
                    `<ListInput type="${field.items?.type === 'string' ? 'text' : 'number'}" value={field.value} onChange={field.onChange} />`
                )
            );
        case 'object':
            return `
<fieldset className="space-y-4 rounded-md border p-4">
    <legend className="px-1 text-sm font-medium">${label}</legend>
    ${editable(field.properties).map(child => control(child, `${path}.${child.name}`)).join('\n')}
</fieldset>`;
        case 'json':
            return item(labelled('<JsonInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} />'));
        default: {
            const inputTypes: Record<string, string> = { email: 'email', password: 'password', date: 'date', uri: 'url' };
            const inputType = inputTypes[field.format ?? ''] || 'text';
            return item(labelled(`<Input type="${inputType}" {...field} value={field.value ?? ""} />`));
        }
    }
}

// Collect the kinds used anywhere in the form, including nested fieldsets
// Optional nested objects with required children validate with isBlank
function needsIsBlank(fields: Field[] | undefined): boolean {
    return editable(fields).some(
        field =>
            fieldKind(field) === 'object' &&
            ((!field.required && editable(field.properties).some(child => child.required)) || needsIsBlank(field.properties))
    );
}

function kindsIn(fields: Field[] | undefined, kinds: Set<FieldKind> = new Set()): Set<FieldKind> {
    for (const field of editable(fields)) {
        const kind = fieldKind(field);
        kinds.add(kind);
        if (kind === 'object') kindsIn(field.properties, kinds);
    }
    return kinds;
}

function hasDescription(fields: Field[] | undefined): boolean {
    return editable(fields).some(field =>
        fieldKind(field) === 'object' ? hasDescription(field.properties) : !!field.description
    );
}

// Shared react-hook-form + zod form used by both the create and edit pages
export function generateFormComponent(model: Model, router: Router): string {
    const { name, Singular } = model;
    const fields = editable(model.formFields);
    const kinds = kindsIn(fields);
    const fieldComponents = [
        kinds.has('datetime') && 'DateTimeInput',
        kinds.has('file') && 'FileInput',
        kinds.has('enumList') && 'CheckboxGroup',
        kinds.has('list') && 'ListInput',
        kinds.has('json') && 'JsonInput',
        kinds.has('json') && 'INVALID_JSON',
        needsIsBlank(fields) && 'isBlank',
        'dropEmptyValues',
    ].filter(Boolean);
    const hasDescriptions = hasDescription(fields);

    const formImports = ['Form', 'FormControl', hasDescriptions && 'FormDescription', 'FormField', 'FormItem', 'FormLabel', 'FormMessage'].filter(Boolean);

    return `${router.directive}${HEADER}import { useForm, type DefaultValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { ${formImports.join(', ')} } from "@/components/ui/form";${kinds.has('string') || kinds.has('number') ? `
import { Input } from "@/components/ui/input";` : ''}${kinds.has('boolean') ? `
import { Checkbox } from "@/components/ui/checkbox";` : ''}${kinds.has('enum') ? `
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";` : ''}${fieldComponents.length > 0 ? `
import { ${fieldComponents.join(', ')} } from "${FIELDS_IMPORT}";` : ''}

export const ${name}FormSchema = z.object({${fields.map(field => `
    ${propertyKey(field.name)}: ${zodType(field)},`).join('')}
});

export type ${Singular}FormValues = z.infer<typeof ${name}FormSchema>;

const emptyValues = {${fields.map(field => `
    ${propertyKey(field.name)}: ${defaultValue(field)},`).join('')}
};

interface ${Singular}FormProps {
    /** Initial values, e.g. the record being edited. Properties outside the schema are dropped on submit. */
    defaultValues?: object;
    onSubmit: (values: ${Singular}FormValues) => void;
    isSubmitting?: boolean;
    submitLabel: string;
}

export function ${Singular}Form({ defaultValues, onSubmit, isSubmitting, submitLabel }: ${Singular}FormProps) {
    const form = useForm<${Singular}FormValues>({
        resolver: zodResolver(${name}FormSchema),
        defaultValues: { ...emptyValues, ...defaultValues } as DefaultValues<${Singular}FormValues>,
    });

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit((values) => onSubmit(dropEmptyValues(values)))} noValidate className="space-y-6">
                ${fields.map(field => control(field, field.name)).join('\n')}
                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Saving..." : submitLabel}
                </Button>
            </form>
        </Form>
    );
}
`;
}

// components/api-gen/fields.tsx: inputs shadcn/ui doesn't ship, plus table and multipart helpers
export function generateFieldsComponent(): string {
    return `"use client";
${HEADER}import { useState, type KeyboardEvent } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/** Marker stored while a JsonInput holds text that isn't valid JSON, so validation can reject it */
export const INVALID_JSON = "__api_gen_invalid_json__";

/** Free-form list of strings or numbers: type a value, then press Enter or comma */
export function ListInput({
    value,
    onChange,
    type = "text",
    placeholder = "Type and press Enter",
}: {
    value?: Array<string | number> | null;
    onChange: (value: Array<string | number>) => void;
    type?: "text" | "number";
    placeholder?: string;
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
                                aria-label={\`Remove \${item}\`}
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

/** Multiple choice for arrays of enum values */
export function CheckboxGroup({
    options,
    value,
    onChange,
}: {
    options: { value: string; label: string }[];
    value?: string[] | null;
    onChange: (value: string[]) => void;
}) {
    const selected = value ?? [];
    return (
        <div className="flex flex-wrap gap-4">
            {options.map((option) => (
                <label key={option.value} className="flex items-center gap-2 text-sm">
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

/** JSON editor for nested objects, maps and arrays of objects */
export function JsonInput({ value, onChange, onBlur }: { value?: unknown; onChange: (value: unknown) => void; onBlur?: () => void }) {
    const [text, setText] = useState(() =>
        value === undefined || value === null || value === INVALID_JSON ? "" : JSON.stringify(value, null, 2)
    );
    const invalid = value === INVALID_JSON;

    return (
        <div className="space-y-1">
            <Textarea
                className="font-mono text-sm"
                rows={4}
                value={text}
                onBlur={onBlur}
                aria-invalid={invalid}
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
        </div>
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
}: {
    value?: string | null;
    onChange: (value: string | undefined) => void;
    onBlur?: () => void;
    name?: string;
}) {
    return (
        <Input
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
}: {
    onChange: (file: File | undefined) => void;
    onBlur?: () => void;
    name?: string;
    accept?: string;
}) {
    return <Input type="file" name={name} accept={accept} onBlur={onBlur} onChange={(e) => onChange(e.target.files?.[0])} />;
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

/** Display a value in a table cell */
export function formatValue(value: unknown, format?: string): string {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (Array.isArray(value)) return value.map((item) => formatValue(item)).join(", ");
    if (typeof value === "object") return JSON.stringify(value);
    if (format === "date-time" || format === "date") {
        const date = new Date(String(value));
        if (!Number.isNaN(date.getTime())) return format === "date" ? date.toLocaleDateString() : date.toLocaleString();
    }
    return String(value);
}
`;
}

