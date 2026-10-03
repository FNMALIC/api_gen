const fs = require('fs');
const path = require('path');
const { capitalizeFirstLetter } = require('../utils/helpers');

// shadcn/ui components the generated dashboard imports from "@/components/ui/*"
const SHADCN_COMPONENTS = ['button', 'card', 'table', 'form', 'input', 'checkbox', 'select', 'alert-dialog', 'sonner'];

// "firstName" / "first_name" -> "First Name"
function humanize(name) {
    return capitalizeFirstLetter(
        name
            .replace(/[_-]+/g, ' ')
            .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
            .trim()
    );
}

function isScalar(field) {
    return !['object', 'array'].includes(field.type);
}

// Fields shown in forms: writable scalars only
function formFields(fields) {
    return fields.filter(field => isScalar(field) && !field.readOnly && field.name !== 'id');
}

function zodType(field) {
    const label = humanize(field.name);
    let type;
    if (field.enum && field.enum.length > 0) {
        type = `z.enum([${field.enum.map(value => JSON.stringify(String(value))).join(', ')}])`;
    } else if (field.type === 'integer' || field.type === 'number') {
        type = `z.number({ message: "${label} must be a number" })`;
        if (field.type === 'integer') type += `.int()`;
    } else if (field.type === 'boolean') {
        type = `z.boolean()`;
    } else {
        type = `z.string()`;
        if (field.format === 'email') type += `.email("Invalid email")`;
        if (field.required) type += `.min(1, "${label} is required")`;
    }
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
                                <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                            </FormControl>
                            <FormLabel>${label}</FormLabel>
                            <FormMessage />
                        </FormItem>
                    )}
                />`;
    }

    if (field.enum && field.enum.length > 0) {
        const items = field.enum
            .map(value => `
                                    <SelectItem value=${JSON.stringify(String(value))}>${humanize(String(value))}</SelectItem>`)
            .join('');
        return `
                <FormField
                    control={form.control}
                    name=${name}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>${label}</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select ${label.toLowerCase()}" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>${items}
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
function generateFormComponent(model, fields) {
    const Model = capitalizeFirstLetter(model);
    const editable = formFields(fields);
    const needsCheckbox = editable.some(field => field.type === 'boolean');
    const needsSelect = editable.some(field => field.enum && field.enum.length > 0);

    return `import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";${needsCheckbox ? `
import { Checkbox } from "@/components/ui/checkbox";` : ''}${needsSelect ? `
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";` : ''}

export const ${model}FormSchema = z.object({${editable.map(field => `
    ${JSON.stringify(field.name)}: ${zodType(field)},`).join('')}
});

export type ${Model}FormValues = z.infer<typeof ${model}FormSchema>;

const emptyValues = {${editable.map(field => `
    ${JSON.stringify(field.name)}: ${defaultValue(field)},`).join('')}
};

interface ${Model}FormProps {
    defaultValues?: Partial<${Model}FormValues>;
    onSubmit: (values: ${Model}FormValues) => void;
    isSubmitting?: boolean;
    submitLabel: string;
}

export function ${Model}Form({ defaultValues, onSubmit, isSubmitting, submitLabel }: ${Model}FormProps) {
    const form = useForm<${Model}FormValues>({
        resolver: zodResolver(${model}FormSchema),
        defaultValues: { ...emptyValues, ...defaultValues } as ${Model}FormValues,
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

function generateListPage(model, fields) {
    const Model = capitalizeFirstLetter(model);
    const columns = fields.filter(isScalar);

    return `import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
} from "@/components/ui/alert-dialog";
import { use${Model} } from "@/hooks/use${Model}";

const columns = [${columns.map(field => `
    { key: ${JSON.stringify(field.name)}, label: ${JSON.stringify(humanize(field.name))} },`).join('')}
];

function formatCell(value: unknown) {
    if (value === null || value === undefined) return "—";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
}

const ${Model}List = () => {
    const { ${model}s: data, allLoading, allFetchError, delete${Model}, isDeleting${Model} } = use${Model}();
    const rows: Record<string, any>[] = Array.isArray(data) ? data : (data as any)?.data ?? [];

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div className="space-y-1.5">
                    <CardTitle>${humanize(model)}</CardTitle>
                    <CardDescription>Manage your ${humanize(model).toLowerCase()}.</CardDescription>
                </div>
                <Button asChild>
                    <Link to="/${model}/create">Add new</Link>
                </Button>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            {columns.map((column) => (
                                <TableHead key={column.key}>{column.label}</TableHead>
                            ))}
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {allLoading ? (
                            <TableRow>
                                <TableCell colSpan={columns.length + 1} className="h-24 text-center">Loading...</TableCell>
                            </TableRow>
                        ) : allFetchError ? (
                            <TableRow>
                                <TableCell colSpan={columns.length + 1} className="h-24 text-center text-destructive">
                                    Failed to load ${humanize(model).toLowerCase()}.
                                </TableCell>
                            </TableRow>
                        ) : rows.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={columns.length + 1} className="h-24 text-center text-muted-foreground">
                                    No ${humanize(model).toLowerCase()} yet.
                                </TableCell>
                            </TableRow>
                        ) : (
                            rows.map((row, index) => (
                                <TableRow key={row.id ?? index}>
                                    {columns.map((column) => (
                                        <TableCell key={column.key}>{formatCell(row[column.key])}</TableCell>
                                    ))}
                                    <TableCell className="space-x-2 text-right">
                                        <Button variant="outline" size="sm" asChild>
                                            <Link to={\`/${model}/\${row.id}\`}>Edit</Link>
                                        </Button>
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="destructive" size="sm" disabled={isDeleting${Model}}>Delete</Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Delete this item?</AlertDialogTitle>
                                                    <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => delete${Model}(row.id)}>Delete</AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
};

export default ${Model}List;
`;
}

function generateCreatePage(model) {
    const Model = capitalizeFirstLetter(model);

    return `import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { use${Model} } from "@/hooks/use${Model}";
import { ${Model}Form } from "./${Model}Form";

const Create${Model} = () => {
    const navigate = useNavigate();
    const { add${Model}, isAdding${Model}, isSuccess } = use${Model}();

    useEffect(() => {
        if (isSuccess) navigate("/${model}");
    }, [isSuccess, navigate]);

    return (
        <Card className="max-w-2xl">
            <CardHeader>
                <CardTitle>Create ${humanize(model)}</CardTitle>
            </CardHeader>
            <CardContent>
                <${Model}Form onSubmit={add${Model}} isSubmitting={isAdding${Model}} submitLabel="Create" />
            </CardContent>
        </Card>
    );
};

export default Create${Model};
`;
}

function generateEditPage(model) {
    const Model = capitalizeFirstLetter(model);

    return `import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { use${Model} } from "@/hooks/use${Model}";
import { ${Model}Form } from "./${Model}Form";

const Edit${Model} = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { one${Model}, singleLoading, update${Model}, isUpdating${Model}, isSuccess } = use${Model}(true, id);

    useEffect(() => {
        if (isSuccess) navigate("/${model}");
    }, [isSuccess, navigate]);

    return (
        <Card className="max-w-2xl">
            <CardHeader>
                <CardTitle>Edit ${humanize(model)}</CardTitle>
            </CardHeader>
            <CardContent>
                {singleLoading || !one${Model} ? (
                    <p className="text-sm text-muted-foreground">Loading...</p>
                ) : (
                    <${Model}Form
                        key={id}
                        defaultValues={one${Model}}
                        onSubmit={update${Model}}
                        isSubmitting={isUpdating${Model}}
                        submitLabel="Save"
                    />
                )}
            </CardContent>
        </Card>
    );
};

export default Edit${Model};
`;
}

function generateLayout(modelNames) {
    return `import { NavLink, Outlet } from "react-router-dom";
import { buttonVariants } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

const navItems = [${modelNames.map(model => `
    { to: "/${model}", label: ${JSON.stringify(humanize(model))} },`).join('')}
];

const LayoutWithSidebar = () => {
    return (
        <div className="flex min-h-screen">
            <aside className="w-56 shrink-0 border-r bg-muted/40 p-4">
                <nav className="flex flex-col gap-1">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
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
};

export default LayoutWithSidebar;
`;
}

// Route config to plug into createBrowserRouter / useRoutes
function generateRoutes(modelNames) {
    const imports = modelNames.map(model => {
        const Model = capitalizeFirstLetter(model);
        return `import ${Model}List from "./${model}/${Model}List";
import Create${Model} from "./${model}/Create${Model}";
import Edit${Model} from "./${model}/Edit${Model}";`;
    }).join('\n');

    const routes = modelNames.map(model => {
        const Model = capitalizeFirstLetter(model);
        return `
            { path: "/${model}", element: <${Model}List /> },
            { path: "/${model}/create", element: <Create${Model} /> },
            { path: "/${model}/:id", element: <Edit${Model} /> },`;
    }).join('');

    return `import type { RouteObject } from "react-router-dom";
import LayoutWithSidebar from "./LayoutWithSidebar";
${imports}

export const dashboardRoutes: RouteObject[] = [
    {
        element: <LayoutWithSidebar />,
        children: [${routes}
        ],
    },
];
`;
}

function generateCRUDDashboard(methodsByModel, fieldsByModel, pagesFolder) {
    if (!fs.existsSync(pagesFolder)) {
        fs.mkdirSync(pagesFolder, { recursive: true });
    }

    const modelNames = Object.keys(methodsByModel);

    fs.writeFileSync(path.join(pagesFolder, 'LayoutWithSidebar.tsx'), generateLayout(modelNames));
    fs.writeFileSync(path.join(pagesFolder, 'routes.tsx'), generateRoutes(modelNames));

    for (const model of modelNames) {
        const Model = capitalizeFirstLetter(model);
        const fields = fieldsByModel[model] ? fieldsByModel[model].fields : [];
        if (fields.length === 0) {
            console.warn(`No schema fields found for "${model}"; its dashboard table and form will be empty.`);
        }

        const modelFolder = path.join(pagesFolder, model);
        if (!fs.existsSync(modelFolder)) {
            fs.mkdirSync(modelFolder, { recursive: true });
        }

        fs.writeFileSync(path.join(modelFolder, `${Model}Form.tsx`), generateFormComponent(model, fields));
        fs.writeFileSync(path.join(modelFolder, `${Model}List.tsx`), generateListPage(model, fields));
        fs.writeFileSync(path.join(modelFolder, `Create${Model}.tsx`), generateCreatePage(model));
        fs.writeFileSync(path.join(modelFolder, `Edit${Model}.tsx`), generateEditPage(model));
    }
}

module.exports = {
    generateCRUDDashboard,
    SHADCN_COMPONENTS,
};
