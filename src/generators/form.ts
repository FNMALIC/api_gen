import { HEADER } from './api.ts';
import { humanize, propertyKey } from '../helpers.ts';
import { isMultiLocale, type Ui } from '../ui.ts';
import { Imports, i18nImport, importComponent, listHookCall, referenceSource } from './shared.ts';
import type { Field, Model } from '../model.ts';
import type { Router } from './dashboard.ts';

export const FIELDS_IMPORT = '@/components/api-gen/fields';
export const FORM_IMPORT = '@/components/api-gen/form';
export const DIALOG_IMPORT = '@/components/api-gen/dialog';
export const I18N_IMPORT = '@/components/api-gen/i18n';

/**
 * What kind of input a schema field gets:
 * file, enum, number, boolean, datetime, string, enumList, list, reference (select from another resource),
 * referenceList (checkboxes), object (nested fieldset) or json (textarea)
 */
export type FieldKind =
    | 'file'
    | 'enum'
    | 'number'
    | 'boolean'
    | 'datetime'
    | 'string'
    | 'enumList'
    | 'list'
    | 'reference'
    | 'referenceList'
    | 'object'
    | 'json';

export function fieldKind(field: Field): FieldKind {
    if (field.type === 'string' && field.format === 'binary') return 'file';
    if (field.reference) return field.reference.many ? 'referenceList' : 'reference';
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
const optionLabel = (ui: Ui, value: unknown) => ui.label(humanize(String(value)) || String(value));

// "optional" fields also accept null: APIs commonly return null for fields they don't require
function optionality(field: Field, expression: string): string {
    if (field.required) return field.nullable ? `${expression}.nullable()` : expression;
    return `${expression}.nullish()`;
}

function zodType(field: Field, ui: Ui): string {
    const label = ui.labelValue(field.label);
    const lower = ui.lower(field.label);
    const required = ui.t('required', { label });
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
        case 'reference':
            if (field.type === 'string') {
                return optionality(field, `z.string({ message: ${required} })${field.required ? `.min(1, ${required})` : ''}`);
            }
            return optionality(field, `z.number({ message: ${required} })`);
        case 'referenceList': {
            const item = field.items?.type === 'string' ? 'z.string()' : 'z.number()';
            return `z.array(${item})${field.required ? `.min(1, ${ui.t('selectAtLeastOne', { label: lower })})` : ''}`;
        }
        case 'number':
            return optionality(field, `z.number({ message: ${ui.t('notANumber', { label })} })${field.type === 'integer' ? '.int()' : ''}`);
        case 'boolean':
            return optionality(field, 'z.boolean()');
        case 'datetime':
        case 'string': {
            let type = `z.string({ message: ${required} })`;
            if (field.required) type += `.min(1, ${required})`;
            if (field.format === 'email') type += `.email(${ui.t('invalidEmail')})`;
            if (field.format === 'uri') type += `.url(${ui.t('invalidUrl')})`;
            // A cleared optional input holds "", which must pass validation (it is dropped on submit)
            if (!field.required && (field.format === 'email' || field.format === 'uri')) type += '.or(z.literal(""))';
            return optionality(field, type);
        }
        case 'enumList': {
            const values = (field.items?.enum ?? []).map(value => JSON.stringify(String(value))).join(', ');
            return `z.array(z.enum([${values}]))${field.required ? `.min(1, ${ui.t('selectAtLeastOne', { label: lower })})` : ''}`;
        }
        case 'list': {
            const item = field.items?.type === 'string' ? 'z.string()' : 'z.number()';
            return `z.array(${item})${field.required ? `.min(1, ${ui.t('addAtLeastOne', { label: lower })})` : ''}`;
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
                return `if (isBlank(value[${key}])) ctx.addIssue({ code: "custom", path: [${key}], message: ${ui.t('required', { label: ui.labelValue(child.label) })} });`;
            });
            return `${type}.superRefine((value, ctx) => {
                if (!value || Object.values(value).every(isBlank)) return;
                ${checks.join('\n')}
            })`;
        }
        default: {
            let type = `z.unknown().refine((value) => value !== INVALID_JSON, { message: ${ui.t('invalidJson')} })`;
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
        case 'referenceList':
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

/** What a form file needs besides its controls: hooks for reference options, custom components */
interface FormContext {
    ui: Ui;
    models: Model[];
    imports: Imports;
    /** Option variables per component, e.g. roleNameOptions -> useOptions(useRoles(...).data, "id", "name") */
    options: Map<string, string>;
}

function control(field: Field, path: string, context: FormContext): string {
    const { ui } = context;
    const name = JSON.stringify(path);
    const label = `{${ui.label(field.label)}}`;
    const description = field.description ? `\n<FormDescription>{${ui.label(String(field.description))}}</FormDescription>` : '';
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
    const selectPlaceholder = ui.t('selectPlaceholder', { label: ui.lower(field.label) });

    // Your own input component, from the design file
    if (field.component) {
        const Component = importComponent(context.imports, field.component);
        return item(labelled(`<${Component} name={field.name} value={field.value} onChange={field.onChange} onBlur={field.onBlur} />`));
    }

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
            const options = (field.enum ?? []).map(value => `{ value: ${JSON.stringify(value)}, label: ${optionLabel(ui, value)} }`).join(', ');
            return item(
                labelled(
                    `<NativeSelect name={field.name} value={field.value} onChange={field.onChange} onBlur={field.onBlur} placeholder={${selectPlaceholder}} options={[${options}]} />`
                )
            );
        }
        case 'reference':
        case 'referenceList': {
            const reference = field.reference!;
            const source = referenceSource(context.models, reference, 'Options');
            if (!source) return item(labelled(`<Input {...field} value={field.value ?? ""} />`));
            context.imports.add(source.importPath, source.hook);
            context.options.set(
                source.variable,
                `useOptions(${listHookCall(source.model)}.data, ${JSON.stringify(reference.idKey)}, ${JSON.stringify(reference.display)})`
            );
            if (reference.many) {
                return item(labelled(`<CheckboxGroup options={${source.variable}} value={field.value} onChange={field.onChange} />`));
            }
            return item(
                labelled(
                    `<NativeSelect name={field.name} value={field.value} onChange={field.onChange} onBlur={field.onBlur} placeholder={${selectPlaceholder}} options={${source.variable}} />`
                )
            );
        }
        case 'number':
            return item(labelled(`<Input
                    type="number"${field.placeholder ? `
                    placeholder={${ui.label(field.placeholder)}}` : ''}
                    {...field}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value === "" ? undefined : e.target.valueAsNumber)}
                />`));
        case 'datetime':
            if (field.widget && field.widget !== 'datetime') return textControl(field, item, labelled, ui);
            return item(labelled('<DateTimeInput name={field.name} value={field.value} onChange={field.onChange} onBlur={field.onBlur} />'));
        case 'file':
            return item(labelled('<FileInput name={field.name} onChange={field.onChange} onBlur={field.onBlur} />'));
        case 'enumList': {
            const options = (field.items?.enum ?? []).map(value => `{ value: ${JSON.stringify(String(value))}, label: ${optionLabel(ui, value)} }`).join(', ');
            return item(labelled(`<CheckboxGroup options={[${options}]} value={field.value} onChange={field.onChange} />`));
        }
        case 'list':
            return item(
                labelled(
                    `<ListInput type="${field.items?.type === 'string' ? 'text' : 'number'}" value={field.value} onChange={field.onChange} placeholder={${ui.t('listPlaceholder')}} removeLabel={${ui.t('remove')}} />`
                )
            );
        case 'object':
            return `
<fieldset className="space-y-4 rounded-md border p-4">
    <legend className="px-1 text-sm font-medium">${label}</legend>
    ${editable(field.properties).map(child => control(child, `${path}.${child.name}`, context)).join('\n')}
</fieldset>`;
        case 'json':
            return item(labelled('<JsonInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} />'));
        default:
            if (field.widget === 'datetime') {
                return item(labelled('<DateTimeInput name={field.name} value={field.value} onChange={field.onChange} onBlur={field.onBlur} />'));
            }
            return textControl(field, item, labelled, ui);
    }
}

// Text input, textarea or a typed input (password, email, ...), from the widget option or the schema format
function textControl(field: Field, item: (inner: string) => string, labelled: (input: string) => string, ui: Ui): string {
    const placeholder = field.placeholder ? ` placeholder={${ui.label(field.placeholder)}}` : '';
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

// Collect the kinds rendered anywhere in the form, including nested fieldsets (custom components aside)
function kindsIn(fields: Field[] | undefined, kinds: Set<FieldKind> = new Set()): Set<FieldKind> {
    for (const field of editable(fields)) {
        const kind = fieldKind(field);
        if (kind === 'object') {
            kinds.add(kind);
            kindsIn(field.properties, kinds);
        } else if (!field.component) {
            kinds.add(kind);
        }
        // json validation uses INVALID_JSON even with a custom input
        if (field.component && kind === 'json') kinds.add('json');
    }
    return kinds;
}

// Which of Input, Textarea and DateTimeInput the text, number and date fields render with
function inputsIn(fields: Field[] | undefined, inputs: Set<string>): Set<string> {
    for (const field of editable(fields)) {
        const kind = fieldKind(field);
        if (field.component) continue;
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
 * { defaultValues?, onSubmit, isSubmitting?, submitLabel, error? } and exports its schema and values type.
 * error: the failed request; validation messages it holds per field are shown under the inputs.
 */
export function generateFormFile(forms: FormSpec[], router: Router, ui: Ui, models: Model[] = []): string {
    const kinds = new Set<FieldKind>();
    forms.forEach(form => kindsIn(form.fields, kinds));
    const anyIsBlank = forms.some(form => needsIsBlank(form.fields));
    const inputs = new Set<string>();
    forms.forEach(form => inputsIn(form.fields, inputs));
    const anyDescription = forms.some(form => hasDescription(form.fields));
    const imports = new Imports();
    const hasReferences = kinds.has('reference') || kinds.has('referenceList');

    const components = forms.map(({ component, fields: allFields }) => {
        const fields = editable(allFields);
        const schema = `${component.charAt(0).toLowerCase()}${component.slice(1)}Schema`;
        const context: FormContext = { ui, models, imports, options: new Map() };
        const controls = fields.map(field => control(field, field.name, context)).join('\n');
        const optionLines = [...context.options].map(([variable, call]) => `\n    const ${variable} = ${call};`).join('');
        return `export const ${schema} = z.object({${fields.map(field => `
    ${propertyKey(field.name)}: ${zodType(field, ui)},`).join('')}
});

export type ${component}Values = z.infer<typeof ${schema}>;

const ${component}Empty = {${fields.map(field => `
    ${propertyKey(field.name)}: ${defaultValue(field)},`).join('')}
};

export function ${component}({ defaultValues, onSubmit, isSubmitting, submitLabel, error }: FormProps<${component}Values>) {
    const form = useForm<${component}Values>({
        resolver: zodResolver(${schema}),
        defaultValues: { ...${component}Empty, ...defaultValues } as DefaultValues<${component}Values>,
    });${optionLines}

    // Validation messages from the server, e.g. { errors: { email: ["already taken"] } }
    useEffect(() => {
        for (const [name, message] of Object.entries(fieldErrors(error))) {
            form.setError(name as FieldPath<${component}Values>, { type: "server", message });
        }
    }, [error, form]);

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit((values) => onSubmit(dropEmptyValues(values)))} noValidate className="space-y-6">
                ${controls}
                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? ${ui.t('saving')} : submitLabel}
                </Button>
            </form>
        </Form>
    );
}`;
    });

    const helperImports = [
        inputs.has('DateTimeInput') && 'DateTimeInput',
        kinds.has('file') && 'FileInput',
        (kinds.has('enumList') || kinds.has('referenceList')) && 'CheckboxGroup',
        kinds.has('list') && 'ListInput',
        (kinds.has('enum') || kinds.has('reference')) && 'NativeSelect',
        kinds.has('json') && 'JsonInput',
        kinds.has('json') && 'INVALID_JSON',
        anyIsBlank && 'isBlank',
        hasReferences && 'useOptions',
        'dropEmptyValues',
        'fieldErrors',
    ].filter(Boolean);
    const formImports = ['Form', 'FormControl', anyDescription && 'FormDescription', 'FormField', 'FormItem', 'FormLabel', 'FormMessage'].filter(Boolean);
    const extra = imports.toString();

    return `${router.directive}${HEADER}import { useEffect } from "react";
import { useForm, type DefaultValues, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";${inputs.has('Input') || hasReferences ? `
import { Input } from "@/components/ui/input";` : ''}${kinds.has('boolean') ? `
import { Checkbox } from "@/components/ui/checkbox";` : ''}${inputs.has('Textarea') ? `
import { Textarea } from "@/components/ui/textarea";` : ''}
import { ${formImports.join(', ')} } from "${FORM_IMPORT}";
import { ${helperImports.join(', ')} } from "${FIELDS_IMPORT}";${i18nImport(ui, components.join('\n'))}${extra ? `\n${extra}` : ''}

interface FormProps<Values> {
    /** Initial values, e.g. the record being edited. Properties outside the schema are dropped on submit. */
    defaultValues?: object;
    onSubmit: (values: Values) => void;
    isSubmitting?: boolean;
    submitLabel: string;
    /** The failed request, to show the server's validation messages under the fields */
    error?: unknown;
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
import { Button } from "@/components/ui/button";${isMultiLocale(ui) ? `
import { t } from "./i18n";` : ''}

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
    confirmLabel = ${ui.t('confirm')},
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
                    {${ui.t('cancel')}}
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
