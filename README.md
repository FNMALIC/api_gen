# API Gen Package

A CLI that turns an OpenAPI document into a ready-to-use React data layer and admin UI:

- **TypeScript types** for every schema in `components.schemas`, plus optional **zod schemas** that validate responses
  at runtime
- **API functions** (axios) with typed path, query and header parameters, request bodies and responses, with
  credentials applied from the document's `securitySchemes`
- **React Query hooks** per resource: `useUsers`, `useUser`, `useCreateUser`, `useUpdateUser`, `useDeleteUser`
- **Back-office dashboard** built with [shadcn/ui](https://ui.shadcn.com) (Radix or Base UI) for React Router or the
  Next.js App Router: paginated, searchable, sortable tables (server-side when the API supports it), create and edit
  forms validated with zod for every kind of field, buttons for custom actions (set status, reset password, ...),
  and a login page when the API has a sign-in endpoint
- **Customizable**: title, colors, corner radius, font, dark mode, page size, English or French wording (or your
  own), per-resource labels

Works with OpenAPI 3.0, 3.1 and Swagger 2.0 (converted automatically), as YAML or JSON, from a file or a URL.

## Installation

```bash
npm install -g api-gen-package
```

Requires Node.js 22.19 or newer. On an older Node you can still run it once with
`npx -p node@22 -p api-gen-package generate-api <input> <output>`.

## Usage

```bash
generate-api [input] [output] [options]
generate-api init [input]     # write a starting design file, see below
```

`input` defaults to `./schema.yaml` and `output` to `./src`. The `api-gen` command is an alias.

| Option | Description |
| --- | --- |
| `-c, --config <file>` | Design/config file (default: `api-gen.config.yaml`, `.yml`, `.json`, `.js` or `.mjs` in the current directory) |
| `--only <targets>` | Comma-separated subset of `api`, `hooks`, `dashboard` (default: all) |
| `--router <router>` | Dashboard routing: `react-router` (default) or `next` |
| `--base-url <url>` | axios `baseURL` when `utils/api.ts` is first created (default: the document's first server URL, else `/`) |
| `--prefix <path>` | Path prefix before the resource name, e.g. `/api/v1`. By default leading `api` and `v1`-style segments are skipped |
| `--group-by <mode>` | Group operations into resources by first path segment (`path`, default) or by first tag (`tag`) |
| `--envelope <key>` / `--no-envelope` | Payload property of wrapped responses like `{ success, data }` (detected automatically by default), or never unwrap |
| `--zod` | Generate zod schemas and validate JSON responses at runtime |
| `--title <text>` | Dashboard title (default: the document's `info.title`) |
| `--locale <locale>` | Dashboard language: `en` (default) or `fr` |
| `--primary-color <color>` | Color of buttons and highlights, e.g. `"#2563eb"` |
| `--radius <size>` | Corner radius, e.g. `0.25rem` (square) or `1rem` (round) |
| `--page-size <rows>` | Rows per page (default 10) |
| `--no-dark-mode` | Leave out the light/dark switch |
| `--no-login` | Don't generate a login page, even if the API has a sign-in endpoint |
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

## Design file (api-gen.config.yaml)

Settings and the whole design of the back-office can live in one YAML file next to your project, so you never edit
the OpenAPI document to change a label or hide a column. Start from your API:

```bash
generate-api init openapi.yaml      # writes api-gen.config.yaml
# edit it, then:
generate-api                        # reads api-gen.config.yaml
```

`init` lists every resource with its labels, table columns, form fields and row actions, so you only change what you
want. A trimmed example:

```yaml
# yaml-language-server: $schema=https://unpkg.com/api-gen-package/config.schema.json
input: ./openapi.yaml
output: ./src
router: react-router
ui:
  title: Mon back-office
  locale: fr
  pageSize: 20
  primaryColor: "#16a34a"
  theme: { radius: 0.5rem, font: "Inter, sans-serif" }
  nav: [users, roles]                      # sidebar order
  resources:
    auth:                                  # the login form
      fields:
        email: { label: Adresse e-mail, placeholder: vous@exemple.com }
    users:
      label: Utilisateurs
      singularLabel: Utilisateur
      description: Comptes des personnes qui utilisent l'application.
      columns: [name, email, role, createdAt] # table columns, in order
      fields:
        bio: { label: Biographie, widget: textarea, help: Visible sur le profil }
        password: { hidden: table }
        role: { order: 0 }
      actions:
        setUserStatus: { label: Changer le statut }
        deleteSessions: { hidden: true }
    logs:
      hidden: true                         # no pages for this resource
```

What you can set:

| Where | Options |
| --- | --- |
| top level | `input`, `output`, `router`, `only`, `prefix`, `groupBy`, `baseUrl`, `envelope`, `zod`, `login`, `templates`, `clean`, `format` |
| `ui` | `title`, `locale` (`en`, `fr`), `labels` (any UI string), `pageSize`, `primaryColor`, `theme` (`colors`, `darkColors`, `radius`, `font`), `darkModeToggle`, `nav` |
| `ui.resources.<name>` | `label`, `singularLabel`, `description`, `hidden`, `columns`, `fields`, `actions` |
| `…fields.<property>` | `label`, `hidden` (`true`, `table`, `form`), `order`, `help`, `placeholder`, `widget` (`text`, `textarea`, `password`, `email`, `url`, `date`, `datetime`) |
| `…actions.<operationId>` | `label`, `hidden` |

The file is checked when you generate: a typo stops generation with a clear message (`ui.resources.users.colums:
unknown option (did you mean "columns"?)`), and names that match nothing in your API (a resource, field, column or
action that doesn't exist) are reported as warnings. With the `$schema` line, editors such as VS Code (with the
YAML extension) offer completion and inline errors. `api-gen.config.json` and `.js`/`.mjs` work too, with the same
options; command-line flags override the file.

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

Item operations outside these, like `POST /users/{id}/status` or `POST /orders/{id}/cancel`, become buttons on each
row (see [Row actions](#row-actions)); anything else is still generated as API functions. Hooks and pages are only
generated for what the API actually has, so a read-only resource gets a table without create, edit or delete.

The create form is built from the create request body and the edit form from the update request body, so an edit
page only shows what `PUT`/`PATCH` accepts.

```
src/
  types/index.ts             one type per schema
  schemas/index.ts           zod schemas (--zod)
  api/<resource>.ts          one function per operation
  utils/api.ts               axios instance (created once, yours to edit)
  utils/auth.ts              credentials for the document's security schemes
  hooks/use<Resources>.ts    React Query hooks
  components/api-gen/        forms, inputs, dialogs, theme and session helpers used by the dashboard
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
| `enum` | select (native, so it works the same everywhere) |
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

### Row actions

Item operations that aren't create, read, update or delete get a button on each row of the table:

- without a request body (`POST /users/{id}/reset-password`): the button asks for confirmation, then calls the API;
- with a body (`POST /users/{id}/status` taking `{ status, reason }`): the button opens a dialog with a form built
  from the body schema.

The button label comes from the operation's `x-label`, its `summary` (when short), or the last path segment. Each
action also gets a hook, e.g. `useSetUserStatus()`.

### Login page

When the API has a sign-in endpoint (a `POST` to a path ending in `/login`, `/signin`, `/token`, `/session`, ...)
whose body has a password field and whose response contains a token (`token`, `accessToken`, `access_token`,
`jwt`, possibly nested or wrapped), the dashboard gets:

- a login page (`/login`) with a form built from the endpoint's body;
- token storage (`components/api-gen/session.ts`), sent as a bearer token with every secured request;
- a redirect to the login page for signed-out visitors and when the API answers 401;
- a sign-out button in the sidebar.

Use `--no-login` to leave this out.

### Customizing the dashboard

Everything below goes under `ui` in the [design file](#design-file-api-genconfigyaml); the common ones also have
command-line flags. Per-resource, per-field and per-action options are described there.

| Option | Effect |
| --- | --- |
| `title` | Sidebar and login page title (default: the document's `info.title`) |
| `locale` | `"en"` (default) or `"fr"` |
| `labels` | Override any UI string, e.g. `{ "addNew": "New", "save": "Save changes" }` (see `Strings` in the package's types) |
| `pageSize` | Rows per page (default 10) |
| `primaryColor` | Shortcut for `theme.colors.primary`; the text drawn on it is made readable automatically |
| `theme.colors` / `theme.darkColors` | Any shadcn/ui color token, e.g. `{ "primary": "#2563eb", "destructive": "#dc2626", "sidebar": "#f8fafc" }` |
| `theme.radius` | Corner radius, e.g. `"0.25rem"` |
| `theme.font` | Font family of the dashboard, e.g. `"Inter, sans-serif"` (load the font yourself) |
| `darkModeToggle` | Light/dark switch in the sidebar (default `true`) |
| `nav` | Sidebar order, by resource name |
| `resources` | Per resource (by its name in the URL): labels, description, columns, fields, actions, hidden |

Theme options are written to `components/api-gen/theme.css`, which the dashboard layout imports. Field and column
labels come from your schema: use `x-label` (see below) to translate or rename them.

### Vendor extensions

| Extension | Effect |
| --- | --- |
| `x-label: "Product name"` | Column and field label; on an operation, the label of its row action button |
| `x-hidden: true` / `"table"` / `"form"` | Hide everywhere, or only in the table or the form |
| `x-order: 0` | Position in tables and forms (lower first) |

### Template overrides

Pass a module whose default export maps file kinds (`listPage`, `createPage`, `editPage`, `form`, `layout`,
`routes`, `loginPage`, `hooks`, `api`) to functions returning new content, or `undefined` to keep the default:

```js
// api-gen.templates.mjs
export default {
  listPage: ({ model, defaultContent }) => defaultContent.replace("Manage your", `Browse all ${model.pluralLabel}:`),
};
```

## Dashboard setup (shadcn/ui)

The dashboard imports a few components from `@/components/ui/*`, so your app needs
[shadcn/ui set up](https://ui.shadcn.com/docs/installation) with the `@` alias pointing at the output folder. Both
flavours work: Radix and Base UI. Forms, selects and dialogs are generated into `components/api-gen/`, so they don't
depend on shadcn components that newer styles no longer ship. Then add the components and libraries it uses (the
CLI prints these commands after generating):

```bash
npx shadcn@latest add button card table input textarea checkbox sonner
npm install axios @tanstack/react-query react-hook-form zod @hookform/resolvers sonner
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
