import { HEADER } from './api.ts';
import { humanize, propertyKey } from '../helpers.ts';
import { fill, type Ui } from '../ui.ts';
import type { Field } from '../model.ts';
import type { Router } from './dashboard.ts';

export const FIELDS_IMPORT = '@/components/api-gen/fields';
export const FORM_IMPORT = '@/components/api-gen/form';
export const DIALOG_IMPORT = '@/components/api-gen/dialog';

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

export const editable = (fields: Field[] | null | undefined): Field[] =>
    (fields || []).filter(field => !field.readOnly && !(field.hidden && field.hidden.form));

const isNumericEnum = (field: Field) => (field.enum ?? []).every(value => typeof value === 'number');
const optionLabel = (value: unknown) => humanize(String(value)) || String(value);

// "optional" fields also accept null: APIs commonly return null for fields they don't require
function optionality(field: Field, expression: string): string {
    if (field.required) return field.nullable ? `${expression}.nullable()` : expression;
    return `${expression}.nullish()`;
}

function zodType(field: Field, ui: Ui): string {
    const s = ui.strings;
    const label = field.label;
    const lower = label.toLowerCase();
    const required = JSON.stringify(fill(s.required, { label }));
    switch (fieldKind(field)) {
        case 'file':
            return optionality(field, `z.union([z.instanceof(File), z.string()], { message: ${required} })`);
        case 'enum':
            return optionality(
                field,
                isNumericEnum(field)
                    ? `z.union([${(field.enum ?? []).map(value => `z.literal(${value})`).join(', ')}], { message: ${required} })`
                    : `z.enum([${(field.enum ?? []).map(value => JSON.stringify(String(value))).join(', ')}], { message: ${required} })`
            );
        case 'number':
            return optionality(field, `z.number({ message: ${JSON.stringify(fill(s.notANumber, { label }))} })${field.type === 'integer' ? '.int()' : ''}`);
        case 'boolean':
            return optionality(field, 'z.boolean()');
        case 'datetime':
        case 'string': {
            let type = `z.string({ message: ${required} })`;
            if (field.required) type += `.min(1, ${required})`;
            if (field.format === 'email') type += `.email(${JSON.stringify(s.invalidEmail)})`;
            if (field.format === 'uri') type += `.url(${JSON.stringify(s.invalidUrl)})`;
            // A cleared optional input holds "", which must pass validation (it is dropped on submit)
            if (!field.required && (field.format === 'email' || field.format === 'uri')) type += '.or(z.literal(""))';
            return optionality(field, type);
        }
        case 'enumList': {
            const values = (field.items?.enum ?? []).map(value => JSON.stringify(String(value))).join(', ');
            return `z.array(z.enum([${values}]))${field.required ? `.min(1, ${JSON.stringify(fill(s.selectAtLeastOne, { label: lower }))})` : ''}`;
        }
        case 'list': {
            const item = field.items?.type === 'string' ? 'z.string()' : 'z.number()';
            return `z.array(${item})${field.required ? `.min(1, ${JSON.stringify(fill(s.addAtLeastOne, { label: lower }))})` : ''}`;
        }
        case 'object': {
            const children = editable(field.properties);
            if (field.required) {
                return `z.object({ ${children.map(child => `${propertyKey(child.name)}: ${zodType(child, ui)}`).join(', ')} })`;
            }
            // An optional object's inputs are always registered, so it arrives as { width: undefined, ... }.
            // Its required children only apply once something in it is filled in.
            const relaxed = children.map(child => `${propertyKey(child.name)}: ${zodType({ ...child, required: false }, ui)}`);
            const requiredChildren = children.filter(child => child.required);
            const type = `z.object({ ${relaxed.join(', ')} }).nullish()`;
            if (requiredChildren.length === 0) return type;
            const checks = requiredChildren.map(child => {
                const key = JSON.stringify(child.name);
                return `if (isBlank(value[${key}])) ctx.addIssue({ code: "custom", path: [${key}], message: ${JSON.stringify(fill(s.required, { label: child.label }))} });`;
            });
            return `${type}.superRefine((value, ctx) => {
                if (!value || Object.values(value).every(isBlank)) return;
                ${checks.join('\n')}
            })`;
        }
        default: {
            let type = `z.unknown().refine((value) => value !== INVALID_JSON, { message: ${JSON.stringify(s.invalidJson)} })`;
            if (field.required) type += `.refine((value) => value !== undefined, { message: ${required} })`;
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

const isPassword = (field: Field) => field.format === 'password' || /^(password|pass|passwd|pwd|secret)$/i.test(field.name);

function control(field: Field, path: string, ui: Ui): string {
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
            const options = (field.enum ?? []).map(value => `{ value: ${JSON.stringify(value)}, label: ${JSON.stringify(optionLabel(value))} }`).join(', ');
            const placeholder = JSON.stringify(fill(ui.strings.selectPlaceholder, { label: label.toLowerCase() }));
            return item(
                labelled(
                    `<NativeSelect name={field.name} value={field.value} onChange={field.onChange} onBlur={field.onBlur} placeholder={${placeholder}} options={[${options}]} />`
                )
            );
        }
        case 'number':
            return item(labelled(`<Input
                    type="number"${field.placeholder ? `
                    placeholder={${JSON.stringify(field.placeholder)}}` : ''}
                    {...field}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value === "" ? undefined : e.target.valueAsNumber)}
                />`));
        case 'datetime':
            if (field.widget && field.widget !== 'datetime') return textControl(field, item, labelled);
            return item(labelled('<DateTimeInput name={field.name} value={field.value} onChange={field.onChange} onBlur={field.onBlur} />'));
        case 'file':
            return item(labelled('<FileInput name={field.name} onChange={field.onChange} onBlur={field.onBlur} />'));
        case 'enumList': {
            const options = (field.items?.enum ?? []).map(value => `{ value: ${JSON.stringify(String(value))}, label: ${JSON.stringify(optionLabel(value))} }`).join(', ');
            return item(labelled(`<CheckboxGroup options={[${options}]} value={field.value} onChange={field.onChange} />`));
        }
        case 'list':
            return item(
                labelled(
                    `<ListInput type="${field.items?.type === 'string' ? 'text' : 'number'}" value={field.value} onChange={field.onChange} placeholder={${JSON.stringify(ui.strings.listPlaceholder)}} removeLabel={${JSON.stringify(ui.strings.remove)}} />`
                )
            );
        case 'object':
            return `
<fieldset className="space-y-4 rounded-md border p-4">
    <legend className="px-1 text-sm font-medium">${label}</legend>
    ${editable(field.properties).map(child => control(child, `${path}.${child.name}`, ui)).join('\n')}
</fieldset>`;
        case 'json':
            return item(labelled('<JsonInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} />'));
        default:
            if (field.widget === 'datetime') {
                return item(labelled('<DateTimeInput name={field.name} value={field.value} onChange={field.onChange} onBlur={field.onBlur} />'));
            }
            return textControl(field, item, labelled);
    }
}

// Text input, textarea or a typed input (password, email, ...), from the widget option or the schema format
function textControl(field: Field, item: (inner: string) => string, labelled: (input: string) => string): string {
    const placeholder = field.placeholder ? ` placeholder={${JSON.stringify(field.placeholder)}}` : '';
    if (field.widget === 'textarea') {
        return item(labelled(`<Textarea rows={4}${placeholder} {...field} value={field.value ?? ""} />`));
    }
    const widgetTypes: Record<string, string> = { text: 'text', password: 'password', email: 'email', url: 'url', date: 'date' };
    const formatTypes: Record<string, string> = { email: 'email', password: 'password', date: 'date', uri: 'url' };
    const inputType = (field.widget && widgetTypes[field.widget]) || (isPassword(field) ? 'password' : formatTypes[field.format ?? ''] || 'text');
    const autoComplete = inputType === 'password' ? ' autoComplete="current-password"' : inputType === 'email' ? ' autoComplete="email"' : '';
    return item(labelled(`<Input type="${inputType}"${autoComplete}${placeholder} {...field} value={field.value ?? ""} />`));
}

// Optional nested objects with required children validate with isBlank
function needsIsBlank(fields: Field[] | undefined): boolean {
    return editable(fields).some(
        field =>
            fieldKind(field) === 'object' &&
            ((!field.required && editable(field.properties).some(child => child.required)) || needsIsBlank(field.properties))
    );
}

// Collect the kinds used anywhere in the form, including nested fieldsets
function kindsIn(fields: Field[] | undefined, kinds: Set<FieldKind> = new Set()): Set<FieldKind> {
    for (const field of editable(fields)) {
        const kind = fieldKind(field);
        kinds.add(kind);
        if (kind === 'object') kindsIn(field.properties, kinds);
    }
    return kinds;
}

// Which of Input, Textarea and DateTimeInput the text, number and date fields render with
function inputsIn(fields: Field[] | undefined, inputs: Set<string>): Set<string> {
    for (const field of editable(fields)) {
        const kind = fieldKind(field);
        if (kind === 'object') inputsIn(field.properties, inputs);
        else if (kind === 'number') inputs.add('Input');
        else if (kind === 'string' || kind === 'datetime') {
            const widget = field.widget ?? (kind === 'datetime' ? 'datetime' : 'text');
            inputs.add(widget === 'textarea' ? 'Textarea' : widget === 'datetime' ? 'DateTimeInput' : 'Input');
        }
    }
    return inputs;
}

function hasDescription(fields: Field[] | undefined): boolean {
    return editable(fields).some(field => (fieldKind(field) === 'object' ? hasDescription(field.properties) : !!field.description));
}

export interface FormSpec {
    /** Component name, e.g. UserCreateForm */
    component: string;
    fields: Field[];
}

/**
 * A file with one react-hook-form + zod form component per spec. Each component takes
 * { defaultValues?, onSubmit, isSubmitting?, submitLabel } and exports its schema and values type.
 */
export function generateFormFile(forms: FormSpec[], router: Router, ui: Ui): string {
    const kinds = new Set<FieldKind>();
    forms.forEach(form => kindsIn(form.fields, kinds));
    const anyIsBlank = forms.some(form => needsIsBlank(form.fields));
    const inputs = new Set<string>();
    forms.forEach(form => inputsIn(form.fields, inputs));
    const anyDescription = forms.some(form => hasDescription(form.fields));

    const helperImports = [
        inputs.has('DateTimeInput') && 'DateTimeInput',
        kinds.has('file') && 'FileInput',
        kinds.has('enumList') && 'CheckboxGroup',
        kinds.has('list') && 'ListInput',
        kinds.has('enum') && 'NativeSelect',
        kinds.has('json') && 'JsonInput',
        kinds.has('json') && 'INVALID_JSON',
        anyIsBlank && 'isBlank',
        'dropEmptyValues',
    ].filter(Boolean);
    const formImports = ['Form', 'FormControl', anyDescription && 'FormDescription', 'FormField', 'FormItem', 'FormLabel', 'FormMessage'].filter(Boolean);

    const components = forms.map(({ component, fields: allFields }) => {
        const fields = editable(allFields);
        const schema = `${component.charAt(0).toLowerCase()}${component.slice(1)}Schema`;
        return `export const ${schema} = z.object({${fields.map(field => `
    ${propertyKey(field.name)}: ${zodType(field, ui)},`).join('')}
});

export type ${component}Values = z.infer<typeof ${schema}>;

const ${component}Empty = {${fields.map(field => `
    ${propertyKey(field.name)}: ${defaultValue(field)},`).join('')}
};

export function ${component}({ defaultValues, onSubmit, isSubmitting, submitLabel }: FormProps<${component}Values>) {
    const form = useForm<${component}Values>({
        resolver: zodResolver(${schema}),
        defaultValues: { ...${component}Empty, ...defaultValues } as DefaultValues<${component}Values>,
    });

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit((values) => onSubmit(dropEmptyValues(values)))} noValidate className="space-y-6">
                ${fields.map(field => control(field, field.name, ui)).join('\n')}
                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? ${JSON.stringify(ui.strings.saving)} : submitLabel}
                </Button>
            </form>
        </Form>
    );
}`;
    });

    return `${router.directive}${HEADER}import { useForm, type DefaultValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";${inputs.has('Input') ? `
import { Input } from "@/components/ui/input";` : ''}${kinds.has('boolean') ? `
import { Checkbox } from "@/components/ui/checkbox";` : ''}${inputs.has('Textarea') ? `
import { Textarea } from "@/components/ui/textarea";` : ''}
import { ${formImports.join(', ')} } from "${FORM_IMPORT}";
import { ${helperImports.join(', ')} } from "${FIELDS_IMPORT}";

interface FormProps<Values> {
    /** Initial values, e.g. the record being edited. Properties outside the schema are dropped on submit. */
    defaultValues?: object;
    onSubmit: (values: Values) => void;
    isSubmitting?: boolean;
    submitLabel: string;
}

${components.join('\n\n')}
`;
}

// components/api-gen/form.tsx: react-hook-form bindings with the same API as shadcn/ui's form component,
// which newer shadcn styles no longer ship. Works with both Radix and Base UI setups.
export function generateFormPrimitives(): string {
    return `"use client";
${HEADER}import { cloneElement, createContext, useContext, useId, type ComponentProps, type ReactElement } from "react";
import { Controller, FormProvider, useFormContext, useFormState, type ControllerProps, type FieldPath, type FieldValues } from "react-hook-form";
import { cn } from "@/lib/utils";

export const Form = FormProvider;

const FieldContext = createContext<{ name: string; id: string }>({ name: "", id: "" });

export function FormField<TFieldValues extends FieldValues = FieldValues, TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>>(
    props: ControllerProps<TFieldValues, TName>
) {
    const id = useId();
    return (
        <FieldContext.Provider value={{ name: props.name, id }}>
            <Controller {...props} />
        </FieldContext.Provider>
    );
}

function useField() {
    const { name, id } = useContext(FieldContext);
    const { getFieldState } = useFormContext();
    const formState = useFormState({ name });
    return { id, ...getFieldState(name, formState) };
}

export function FormItem({ className, ...props }: ComponentProps<"div">) {
    return <div className={cn("grid gap-2", className)} {...props} />;
}

export function FormLabel({ className, ...props }: ComponentProps<"label">) {
    const { id, error } = useField();
    return (
        <label
            htmlFor={id}
            data-error={!!error}
            className={cn("text-sm leading-none font-medium select-none data-[error=true]:text-destructive", className)}
            {...props}
        />
    );
}

/** Connects its single child input to the label, description and error message */
export function FormControl({ children }: { children: ReactElement<Record<string, unknown>> }) {
    const { id, error } = useField();
    return cloneElement(children, {
        id,
        "aria-invalid": !!error,
        "aria-describedby": error ? \`\${id}-description \${id}-message\` : \`\${id}-description\`,
    });
}

export function FormDescription({ className, ...props }: ComponentProps<"p">) {
    const { id } = useField();
    return <p id={\`\${id}-description\`} className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export function FormMessage({ className, ...props }: ComponentProps<"p">) {
    const { id, error } = useField();
    if (!error?.message) return null;
    return (
        <p id={\`\${id}-message\`} className={cn("text-sm text-destructive", className)} {...props}>
            {String(error.message)}
        </p>
    );
}
`;
}

// components/api-gen/dialog.tsx: a modal on the native <dialog> element, independent of Radix or Base UI
export function generateDialogComponent(ui: Ui): string {
    return `"use client";
${HEADER}import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function Dialog({
    open,
    onClose,
    title,
    description,
    role = "dialog",
    children,
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    description?: string;
    role?: "dialog" | "alertdialog";
    children?: ReactNode;
}) {
    const ref = useRef<HTMLDialogElement>(null);
    const titleId = useId();

    useEffect(() => {
        const dialog = ref.current;
        if (!dialog) return;
        if (open && !dialog.open) dialog.showModal();
        if (!open && dialog.open) dialog.close();
    }, [open]);

    return (
        <dialog
            ref={ref}
            role={role}
            aria-labelledby={titleId}
            onCancel={(event) => {
                event.preventDefault();
                onClose();
            }}
            className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-lg border bg-background p-6 text-foreground shadow-lg backdrop:bg-black/50"
        >
            {open && (
                <div className="space-y-4">
                    <div className="space-y-2">
                        <h2 id={titleId} className="text-lg font-semibold">
                            {title}
                        </h2>
                        {description && <p className="text-sm text-muted-foreground">{description}</p>}
                    </div>
                    {children}
                </div>
            )}
        </dialog>
    );
}

export function ConfirmDialog({
    open,
    onClose,
    onConfirm,
    title,
    description,
    confirmLabel = ${JSON.stringify(ui.strings.confirm)},
    destructive = false,
    pending = false,
}: {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    description?: string;
    confirmLabel?: string;
    destructive?: boolean;
    pending?: boolean;
}) {
    return (
        <Dialog open={open} onClose={onClose} title={title} description={description} role="alertdialog">
            <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={onClose}>
                    {${JSON.stringify(ui.strings.cancel)}}
                </Button>
                <Button type="button" variant={destructive ? "destructive" : "default"} disabled={pending} onClick={onConfirm}>
                    {confirmLabel}
                </Button>
            </div>
        </Dialog>
    );
}
`;
}

// components/api-gen/fields.tsx: inputs shadcn/ui doesn't ship, plus table and multipart helpers
export function generateFieldsComponent(ui: Ui): string {
    const s = ui.strings;
    return `"use client";
${HEADER}import { useState, type ComponentProps, type KeyboardEvent } from "react";
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
    placeholder = ${JSON.stringify(s.listPlaceholder)},
    removeLabel = ${JSON.stringify(s.remove)},
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

/** Multiple choice for arrays of enum values */
export function CheckboxGroup({
    options,
    value,
    onChange,
    id,
}: {
    options: { value: string; label: string }[];
    value?: string[] | null;
    onChange: (value: string[]) => void;
    id?: string;
}) {
    const selected = value ?? [];
    return (
        <div id={id} role="group" className="flex flex-wrap gap-4">
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

/** Styled native select: works the same with every shadcn/ui setup and on mobile */
export function NativeSelect({
    value,
    onChange,
    options,
    placeholder,
    className,
    ...props
}: Omit<ComponentProps<"select">, "value" | "onChange"> & {
    value?: string | number | null;
    onChange: (value: string | number | undefined) => void;
    options: { value: string | number; label: string }[];
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
            className={[
                "h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none",
                "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                "aria-invalid:border-destructive dark:bg-input/30",
                className,
            ].filter(Boolean).join(" ")}
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

/** Display a value in a table cell */
export function formatValue(value: unknown, format?: string): string {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "boolean") return value ? ${JSON.stringify(s.yes)} : ${JSON.stringify(s.no)};
    if (Array.isArray(value)) return value.map((item) => formatValue(item)).join(", ");
    if (typeof value === "object") return JSON.stringify(value);
    if (format === "date-time" || format === "date") {
        const date = new Date(String(value));
        if (!Number.isNaN(date.getTime())) return format === "date" ? date.toLocaleDateString() : date.toLocaleString();
    }
    return String(value);
}

/** Read a nested property, e.g. readPath(response, ["data", "token"]) */
export function readPath(value: unknown, path: string[]): unknown {
    return path.reduce<unknown>((current, key) => (current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined), value);
}
`;
}
