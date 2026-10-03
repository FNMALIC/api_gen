# API Gen Package

A CLI that turns an OpenAPI document into a ready-to-use React data layer and admin UI:

- **TypeScript types** for every schema in `components.schemas`, plus optional **zod schemas** that validate responses
  at runtime
- **API functions** (axios) with typed path, query and header parameters, request bodies and responses, with
  credentials applied from the document's `securitySchemes`
- **React Query hooks** per resource: `useUsers`, `useUser`, `useCreateUser`, `useUpdateUser`, `useDeleteUser`
- **CRUD dashboard** built with [shadcn/ui](https://ui.shadcn.com) for React Router or the Next.js App Router:
  paginated, searchable, sortable tables (server-side when the API supports it), and forms validated with zod for
  every kind of field: enums, lists, nested objects, JSON, dates and file uploads

Works with OpenAPI 3.0, 3.1 and Swagger 2.0 (converted automatically), as YAML or JSON, from a file or a URL.

## Installation

```bash
npm install -g api-gen-package
```

Requires Node.js 22.19 or newer.

## Usage

```bash
generate-api [input] [output] [options]
```

`input` defaults to `./schema.yaml` and `output` to `./src`. The `api-gen` command is an alias.

| Option | Description |
| --- | --- |
| `-c, --config <file>` | Config file (default: `api-gen.config.json`/`.js`/`.mjs` in the current directory) |
| `--only <targets>` | Comma-separated subset of `api`, `hooks`, `dashboard` (default: all) |
| `--router <router>` | Dashboard routing: `react-router` (default) or `next` |
| `--base-url <url>` | axios `baseURL` when `utils/api.ts` is first created (default: the document's first server URL, else `/`) |
| `--prefix <path>` | Path prefix before the resource name, e.g. `/api/v1`. By default leading `api` and `v1`-style segments are skipped |
| `--group-by <mode>` | Group operations into resources by first path segment (`path`, default) or by first tag (`tag`) |
| `--envelope <key>` / `--no-envelope` | Payload property of wrapped responses like `{ success, data }` (detected automatically by default), or never unwrap |
| `--zod` | Generate zod schemas and validate JSON responses at runtime |
| `--templates <module>` | JS module exporting template overrides (see below) |
| `--no-clean` | Keep files from earlier runs that are no longer generated |
| `--no-format` | Skip Prettier formatting (your project's Prettier config is used when present) |
| `-w, --watch` | Regenerate whenever the input file changes |

Examples:

```bash
generate-api openapi.yaml src
generate-api https://petstore3.swagger.io/api/v3/openapi.json src --router next
generate-api openapi.json src --only api,hooks --zod
generate-api --watch
```

The command exits with code 1 when the document is invalid or generation fails, so it can run in CI.

### Config file

Options can live in `api-gen.config.json` (or `.js`/`.mjs` exporting an object). Paths are relative to the config
file, and command-line flags override it:

```json
{
  "input": "./openapi.yaml",
  "output": "./src",
  "router": "next",
  "zod": true,
  "prefix": "/api/v1"
}
```

## What gets generated

Resources are found by path: `/api/users` and `/api/users/{id}` become the `users` resource. CRUD actions are
detected from the HTTP method and path shape:

| Operation | Action |
| --- | --- |
| `GET /users` | list |
| `POST /users` | create |
| `GET /users/{id}` | retrieve |
| `PUT /users/{id}` (or `PATCH`) | update |
| `DELETE /users/{id}` | delete |

Other operations (e.g. `POST /orders/{id}/cancel`) are still generated as API functions. Hooks and pages are only
generated for actions the API actually has, so a read-only resource gets a table without create, edit or delete.

```
src/
  types/index.ts             one type per schema
  schemas/index.ts           zod schemas (--zod)
  api/<resource>.ts          one function per operation
  utils/api.ts               axios instance (created once, yours to edit)
  utils/auth.ts              credentials for the document's security schemes
  hooks/use<Resources>.ts    React Query hooks
  components/api-gen/        inputs and helpers shared by the generated forms
  pages/...                  React Router dashboard (or app/(dashboard)/... with --router next)
  .api-gen-manifest.json     what was generated, used to remove stale files on the next run
```

API functions are named after `operationId` (a bare verb gets the resource name: `list` becomes `listUsers`, `delete`
becomes `deleteUser`) and take only what their endpoint needs:

```ts
export const getUser = async (id: number, config?: AxiosRequestConfig): Promise<User> => { ... };
export const listUsers = async (query?: { page?: number; search?: string }, headers?: { "X-Request-Id"?: string }, config?: AxiosRequestConfig) => { ... };
```

Errors are thrown, not returned, so React Query's error states and the hooks' error toasts work.

### Hooks

```tsx
const { data, isLoading } = useUsers({ page: 1, limit: 10 });
const { data: user } = useUser(id);
const createUser = useCreateUser();
createUser.mutate(values, { onSuccess: () => navigate("/users") });
```

Mutations invalidate the resource's queries (`userKeys.all`) and show Sonner toasts on success and failure.

### Authentication

`utils/auth.ts` is generated from `components.securitySchemes` (bearer, basic, API keys in a header or the query
string, OAuth2/OpenID Connect tokens). Register how to get each credential once:

```ts
import { setCredentials } from "@/utils/auth";

setCredentials("bearerAuth", () => localStorage.getItem("token"));
setCredentials("apiKey", () => import.meta.env.VITE_API_KEY);
```

Each request uses the first `security` alternative of its operation whose credentials are registered; operations
with `security: []` stay public.

`utils/api.ts` is only created if it doesn't exist, so you can add your own interceptors. It copies the server's
error message (`message`, `detail` or `error` in the response body) into `error.message`, which the toasts display.

### Lists: server-side when possible

When the list endpoint has a page (`page`) or offset (`offset`, `skip`) parameter **and** a page-size parameter
(`limit`, `pageSize`, `per_page`, ...), the table pages on the server and reads the total from a `total`/`count`
property of the response, also when nested (`meta.total`, `data.totalCount`). Search (`search`, `q`, ...) and sort parameters (`sort`/`sortBy` with an optional
`order`/`sortOrder`, or `ordering` with `-field` for descending) are sent to the server too. Otherwise the table
searches, sorts and paginates the returned rows in the browser.

### Forms

| Schema | Input |
| --- | --- |
| `string` (`email`, `uri`, `date`, `password` formats) | text input with matching type and validation |
| `string` with `format: date-time` | date-time picker, sent as ISO 8601 |
| `string` with `format: binary` | file picker (multipart endpoints get `FormData`) |
| `integer`, `number` | number input |
| `boolean` | checkbox |
| `enum` | select |
| array of strings or numbers | list input (type, then Enter) |
| array of enum values | checkbox group |
| object with properties | nested fieldset (an optional one is only validated once something is filled in) |
| maps, arrays of objects, anything else | JSON editor |

Read-only properties are left out of forms, write-only ones out of tables, and cleared optional inputs out of the
request.

### Wrapped responses

APIs that wrap every response, like `{ "success": true, "data": { ... }, "message": "..." }`, are detected
automatically: an object with a `data`, `result` or `payload` property whose other properties are metadata
(`success`, `message`, `meta`, `errors`, `status`, ...). For those responses:

- functions returning a single record return the payload (`getUser(id): Promise<User>`), so hooks and edit forms
  get the record itself;
- a body with `success: false` or `ok: false` is thrown as an error carrying the server's `message`, even with HTTP 200;
- lists keep their envelope, so totals like `meta.total` are found and used for pagination.

A resource that merely has its own `data` field next to `id` and `name` is not mistaken for an envelope. Use
`--envelope result` to name the payload property explicitly, or `--no-envelope` to turn this off.

### Vendor extensions

| Extension | Effect |
| --- | --- |
| `x-label: "Product name"` | Column and field label |
| `x-hidden: true` / `"table"` / `"form"` | Hide everywhere, or only in the table or the form |
| `x-order: 0` | Position in tables and forms (lower first) |

### Template overrides

Pass a module whose default export maps file kinds (`listPage`, `createPage`, `editPage`, `form`, `layout`,
`routes`, `hooks`, `api`) to functions returning new content, or `undefined` to keep the default:

```js
// api-gen.templates.mjs
export default {
  listPage: ({ model, defaultContent }) => defaultContent.replace("Manage your", `Browse all ${model.pluralLabel}:`),
};
```

## Dashboard setup (shadcn/ui)

The dashboard imports components from `@/components/ui/*`, so your app needs
[shadcn/ui set up](https://ui.shadcn.com/docs/installation) with the `@` alias pointing at the output folder.
Then add the components and libraries it uses:

```bash
npx shadcn@latest add button card table form input textarea checkbox select alert-dialog sonner
npm install @tanstack/react-query axios
npm install react-router-dom   # only for --router react-router
```

### React Router

Mount the generated routes; the layout includes the sidebar and the `<Toaster />`:

```tsx
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { dashboardRoutes } from "@/pages/routes";

const router = createBrowserRouter(dashboardRoutes);
const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
```

### Next.js App Router

With `--router next`, pages are written to `app/(dashboard)/<resource>/page.tsx`, `.../create/page.tsx` and
`.../[id]/page.tsx`, with a shared `app/(dashboard)/layout.tsx`. Wrap your root layout in a
`QueryClientProvider` (from a client component).

## Programmatic use

```ts
import { generate } from "api-gen-package";

const { written, removed, warnings } = await generate({
  input: "openapi.yaml",
  output: "src",
  router: "next",
  zod: true,
});
```

The package is ESM and ships TypeScript declarations.

## Development

The generator is written in TypeScript (`src/`) and compiled to `dist/`. Node runs the `.ts` sources directly, so
tests and the CLI work without a build step:

```bash
npm install
npm run typecheck     # tsc over src/ and test/
npm test              # unit tests: generate from test/fixtures and type-check the output with strict tsc
npm run test:e2e      # end-to-end test, see below
npm run build         # compile to dist/
node src/cli.ts test/fixtures/shop.json out
```

`npm run test:e2e` creates a Vite + React app in `test/.tmp/e2e-app`, installs the real shadcn/ui components,
generates the dashboard for `test/fixtures/shop.json`, type-checks and builds the app, and clicks through it in
Chromium against a mocked API: pagination, search, sorting, every form field kind, validation, server errors, edit,
delete and file upload. It needs `npx playwright-core install chromium` once. Set `E2E_UI=fallback` to use
minimal stand-in components when the shadcn registry can't be reached, and `E2E_REUSE=1` to skip reinstalling the app.

Releases are published by GitHub Actions when a `v*` tag matching `package.json`'s version is pushed.
