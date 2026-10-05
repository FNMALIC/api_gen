# API Gen Package

A CLI that turns an OpenAPI document into a ready-to-use React data layer and admin UI:

- **TypeScript types** for every schema in `components.schemas`, plus optional **zod schemas** that validate responses
  at runtime
- **API functions** (axios) with typed path, query and header parameters, request bodies and responses, with
  credentials applied from the document's `securitySchemes`
- **React Query hooks** per resource: `useUsers`, `useUser`, `useCreateUser`, `useUpdateUser`, `useDeleteUser`
- **Back-office dashboard** built with [shadcn/ui](https://ui.shadcn.com) (Radix or Base UI) for React Router or the
  Next.js App Router:
  - tables that page, search, sort and filter (on the server when the API supports it), show names instead of ids,
    amounts, dates, badges, links and images, select rows to delete them together, and export to CSV
  - detail pages with tabs for related lists (`GET /users/{id}/posts`, or posts filtered by `userId`)
  - create and edit forms validated with zod for every kind of field, with selects filled from other resources and
    the server's validation messages shown under the right fields
  - buttons for custom actions (set status, reset password, ...)
  - a login page, refresh tokens, sign-out on the server, the signed-in user's name, and buttons hidden from people
    without the permission
  - a home page with the number of records of each resource, sidebar icons, a menu for phones
- **Customizable** from one YAML design file: title, colors, corner radius, font, dark mode, labels, columns,
  filters, icons, permissions, your own input and cell components, and 6 languages (English, French, Spanish,
  German, Portuguese, Italian) with a language switch
- **A mock API** with realistic fake data, and **a `create` command** that sets up a whole admin app, to see it all
  running in a minute

Works with OpenAPI 3.0, 3.1 and Swagger 2.0 (converted automatically), as YAML or JSON, from a file or a URL.

![From an OpenAPI file to a working admin: sign-in, filters, sorting, row selection, a detail page, form validation, dark mode and French](https://raw.githubusercontent.com/FNMALIC/api_gen/main/docs/demo.gif)

## Screenshots

The [bookstore example](examples/README.md), generated from its OpenAPI document and design file and running
against `generate-api mock`.

| | |
| --- | --- |
| ![Books list with filters, row selection, badges, amounts and row actions](https://raw.githubusercontent.com/FNMALIC/api_gen/main/docs/screenshots/3-books.png) | ![A book's detail page with a Reviews tab](https://raw.githubusercontent.com/FNMALIC/api_gen/main/docs/screenshots/4-book.png) |
| **List**: search, filters, sortable columns, author names instead of ids, amounts in euros, bulk delete, CSV export | **Detail**: every field, Edit and Delete, related lists in tabs |
| ![Create form showing validation messages](https://raw.githubusercontent.com/FNMALIC/api_gen/main/docs/screenshots/5-create.png) | ![Books list in dark mode, in French](https://raw.githubusercontent.com/FNMALIC/api_gen/main/docs/screenshots/6-books-dark-fr.png) |
| **Form**: author picked from the authors, validation in the browser and from the server | **Dark mode and languages**: switched from the sidebar |
| ![Home page with the number of books, authors and orders](https://raw.githubusercontent.com/FNMALIC/api_gen/main/docs/screenshots/2-home.png) | ![Sign-in page](https://raw.githubusercontent.com/FNMALIC/api_gen/main/docs/screenshots/1-login.png) |
| **Home**: the number of records of each resource | **Sign-in**: with refresh tokens, permissions and sign-out on the server |

<p align="center"><img src="https://raw.githubusercontent.com/FNMALIC/api_gen/main/docs/screenshots/7-phone-menu.png" alt="The sidebar opened from the menu button on a phone" width="260"><br><b>Phones</b>: the sidebar opens from a menu button</p>

## Quick start

```bash
npx -p api-gen-package generate-api create my-admin openapi.yaml   # a Vite + React + shadcn/ui app with the dashboard in it
cd my-admin
npm run mock    # a mock API with fake data, from your document
npm run dev     # the admin, in another terminal
```

`create` copies your document into the app, writes a design file (`api-gen.config.yaml`) and a dev server that
forwards API requests to the mock, or to your real API with `API_URL=https://api.example.com npm run dev`. Edit the
design file and run `npm run generate` (or keep `npm run generate:watch` running).

No API at hand? `generate-api create my-bookstore --example bookstore` starts from the [bookstore example](examples/README.md).

## Installation

```bash
npm install -g api-gen-package
```

Requires Node.js 22.19 or newer. On an older Node you can still run it once with
`npx -p node@22 -p api-gen-package generate-api <input> <output>`.

## Usage

```bash
generate-api [input] [output] [options]   # generate into an existing app
generate-api init [input]                 # write a starting design file, see below
generate-api create <dir> [input]         # a new Vite + React + shadcn/ui app (--example bookstore, --no-install)
generate-api mock [input]                 # a mock API on http://localhost:4010 (--port, --rows, --delay, --quiet)
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
| `--locale <locale>` | Dashboard language: `en` (default), `fr`, `es`, `de`, `pt` or `it` |
| `--primary-color <color>` | Color of buttons and highlights, e.g. `"#2563eb"` |
| `--radius <size>` | Corner radius, e.g. `0.25rem` (square) or `1rem` (round) |
| `--page-size <rows>` | Rows per page (default 10) |
| `--no-dark-mode` | Leave out the light/dark switch |
| `--no-login` | Don't generate a login page, even if the API has a sign-in endpoint |
| `--templates <module>` | JS module exporting template overrides (see below) |
| `--no-clean` | Keep files from earlier runs that are no longer generated |
| `--no-format` | Skip Prettier formatting (your project's Prettier config is used when present) |
| `-w, --watch` | Regenerate whenever the input file or the design file changes |

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
  locales: [fr, en]                        # a language switch in the sidebar
  translations:
    en: { Utilisateurs: Users, Rôle: Role }
  currency: EUR
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
      icon: users                          # any lucide icon
      columns: [name, email, roleId, avatarUrl, createdAt] # table columns, in order
      filters: [roleId, active]            # list query parameters, in order
      permissions: { create: users.write, delete: [admin, users.delete] }
      fields:
        bio: { label: Biographie, widget: textarea, help: Visible sur le profil }
        password: { hidden: table }
        roleId: { label: Rôle, display: name, order: 0 }   # a select of roles, names in the table
        managerId: { reference: users }   # when the name doesn't say it
        color: { component: "@/components/ColorPicker", cellComponent: "@/components/ColorSwatch" }
        avatarUrl: { cell: image }
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
| `ui` | `title`, `locale` (`en`, `fr`, `es`, `de`, `pt`, `it`), `locales`, `translations`, `labels` (any UI string), `pageSize`, `currency`, `home`, `primaryColor`, `theme` (`colors`, `darkColors`, `radius`, `font`), `darkModeToggle`, `nav` |
| `ui.resources.<name>` | `label`, `singularLabel`, `description`, `hidden`, `icon`, `columns`, `filters`, `permissions`, `fields`, `actions` |
| `…fields.<property>` | `label`, `hidden` (`true`, `table`, `form`), `order`, `help`, `placeholder`, `widget` (`text`, `textarea`, `password`, `email`, `url`, `date`, `datetime`), `reference`, `display`, `cell`, `component`, `cellComponent` |
| `…actions.<operationId>` | `label`, `hidden` |
| `…permissions` | `list`, `view`, `create`, `update`, `delete` (a permission or a list, any of which allows it), `actions.<operationId>` |

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

Pages (React Router; the Next.js ones are listed [below](#nextjs-app-router)):

| URL | Page |
| --- | --- |
| `/` | home: the number of records of each resource (`ui.home: false` to leave it out) |
| `/users` | list |
| `/users/create` | create form |
| `/users/:id` | detail, with tabs for related lists |
| `/users/:id/edit` | edit form |
| `/login` | sign-in, when the API has one |

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

### Relations

A property named after another resource with an `Id`/`_id` suffix is a link to it: `roleId` points at `roles`,
`categoryId` at `product-categories`, `tagIds` (an array) at `tags`. Forms get a select (or checkboxes for an array)
filled from that resource's list, and tables and detail pages show its name instead of the id: the first of
`name`, `title`, `label`, `username`, `email`, ... it has. In the design file, `reference: <resource>` links a field
whose name doesn't say it, `display: <property>` picks what to show, and `reference: false` turns a link off.

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

### Filters, detail pages, bulk actions and CSV

- **Filters**: query parameters of the list endpoint other than paging, search and sort (`status`, `roleId`,
  `active`, `createdAfter`, ...) become controls above the table: a select for enums, booleans and references, a
  number, date or text input otherwise. Choose and order them with `filters` in the design file.
- **Detail pages**: a resource with `GET /users/{id}` gets a page showing every field, with Edit and Delete. Lists
  under a record are tabs on it: sub-resources like `GET /users/{id}/sessions`, and other resources whose list can
  be filtered by this one (`GET /posts?userId=`).
- **Cells**: values are shown by type, format and name: booleans and enums as badges, `price`/`amount`/`total` as
  amounts in `ui.currency`, dates in the browser's format, URLs as links, `image`/`avatar`/`logo` URLs as images,
  emails as `mailto:` links. Set `cell` on a field to choose, or `cellComponent` to render it yourself.
- **Bulk delete**: with `DELETE /users/{id}`, rows get checkboxes and the selection can be deleted at once
  (`useDeleteUsers`).
- **CSV export**: the rows on screen, as shown (names for references), in a file Excel opens as UTF-8.

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

| a reference (`roleId`, `tagIds`) | select or checkboxes filled from the other resource |

Read-only properties are left out of forms, write-only ones out of tables, and cleared optional inputs out of the
request.

When the server rejects a request with validation messages, they are shown under the fields they belong to, whatever
the shape: `{ errors: { email: ["taken"] } }` (Laravel, Rails), `{ errors: [{ field, message }] }` (express-validator,
Joi, class-validator), `{ detail: [{ loc, msg }] }` (FastAPI), also inside an envelope or with HTTP 200 and
`success: false`.

Your own input for a field: `component: "@/components/ColorPicker"` (a default export, or `"@/components/inputs#ColorPicker"`
for a named one) gets `{ name, value, onChange, onBlur }`, keeping the label, help text and validation messages.

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
- the signed-in user's name in the sidebar (from the response's `user.name`, `email`, ... or the token's claims);
- with a refresh token in the response and a `POST .../refresh` endpoint taking it: a request that gets 401 refreshes
  the token once and is retried, instead of signing out;
- with a `POST .../logout` endpoint: signing out calls it;
- a sign-out button in the sidebar.

Use `--no-login` to leave this out.

### Permissions

Buttons, pages and sidebar entries can be hidden from people who may not use them. What each needs comes from
`x-permission` (or `x-permissions`, a list) on the operation, or from `permissions` per resource in the design file;
any one of the listed permissions allows it. What the signed-in user holds comes from the sign-in response
(`permissions`, `scopes`, `roles` or `authorities`, also nested like `user.permissions`; strings or objects with a
`name`), or from the same claims in a JWT. `"*"` allows everything. When neither says anything, everything is shown
and the API decides, as it does in any case: hiding a button is a convenience, not security.

### Languages

`ui.locale` picks the wording: `en`, `fr`, `es`, `de`, `pt` or `it`. With `ui.locales: [en, fr]`, the sidebar gets
a language switch (remembered in the browser; the default follows the browser's language), and your own labels
can be translated in `ui.translations`:

```yaml
ui:
  locales: [en, fr]
  translations:
    fr: { Users: Utilisateurs, Email address: Adresse e-mail }
```

### Customizing the dashboard

Everything below goes under `ui` in the [design file](#design-file-api-genconfigyaml); the common ones also have
command-line flags. Per-resource, per-field and per-action options are described there.

| Option | Effect |
| --- | --- |
| `title` | Sidebar and login page title (default: the document's `info.title`) |
| `locale` | `"en"` (default), `"fr"`, `"es"`, `"de"`, `"pt"` or `"it"` |
| `locales` / `translations` | Languages to switch between, and your labels in each (see [Languages](#languages)) |
| `currency` | Currency of amount columns, e.g. `"EUR"` (default `"USD"`) |
| `home` | Home page with counts (default `true`) |
| `labels` | Override any UI string, e.g. `{ "addNew": "New", "save": "Save changes" }` (see `Strings` in the package's types) |
| `pageSize` | Rows per page (default 10) |
| `primaryColor` | Shortcut for `theme.colors.primary`; the text drawn on it is made readable automatically |
| `theme.colors` / `theme.darkColors` | Any shadcn/ui color token, e.g. `{ "primary": "#2563eb", "destructive": "#dc2626", "sidebar": "#f8fafc" }` |
| `theme.radius` | Corner radius, e.g. `"0.25rem"` |
| `theme.font` | Font family of the dashboard, e.g. `"Inter, sans-serif"` (load the font yourself) |
| `darkModeToggle` | Light/dark switch in the sidebar (default `true`) |
| `nav` | Sidebar order, by resource name |
| `resources` | Per resource (by its name in the URL): labels, description, icon, columns, filters, permissions, fields, actions, hidden |

Theme options are written to `components/api-gen/theme.css`, which the dashboard layout imports. Field and column
labels come from your schema: use `x-label` (see below) to translate or rename them.

### Vendor extensions

| Extension | Effect |
| --- | --- |
| `x-label: "Product name"` | Column and field label; on an operation, the label of its row action button |
| `x-hidden: true` / `"table"` / `"form"` | Hide everywhere, or only in the table or the form |
| `x-order: 0` | Position in tables and forms (lower first) |
| `x-widget: textarea` | Input of a text field (same values as `widget` in the design file) |
| `x-cell: badge` | How tables show the value (same values as `cell`) |
| `x-permission: users.delete` | On an operation: the permission needed to see its button or page (`x-permissions` for several) |

### Template overrides

Pass a module whose default export maps file kinds (`listPage`, `createPage`, `editPage`, `detailPage`, `homePage`,
`form`, `layout`, `routes`, `loginPage`, `hooks`, `api`) to functions returning new content, or `undefined` to keep the default:

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
npm install lucide-react       # only when the design file sets icons (shadcn init installs it already)
```

Or start from `generate-api create`, which does all of this.

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

With `--router next`, pages are written to `app/(dashboard)/<resource>/page.tsx`, `.../create/page.tsx`,
`.../[id]/page.tsx` (detail) and `.../[id]/edit/page.tsx`, with a shared `app/(dashboard)/layout.tsx` and the home
page at `/dashboard` (your app keeps `app/page.tsx`). Wrap your root layout in a `QueryClientProvider` (from a
client component).

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

`createApp({ dir, input })` and `startMockServer({ input, port })` are exported too. The package is ESM and ships
TypeScript declarations.

## Mock API

`generate-api mock` serves your API from its document, with records made up from each schema (names, emails,
dates, prices, images, ids that point at existing records) kept in memory until it stops. Lists page, search, sort
and filter with the parameters the document declares, and come back in the document's shape (`{ items, total }`,
`{ success, data, meta }`, ...); create and update check required fields and answer 422 with messages per field;
any email and password sign in. It listens on `http://localhost:4010` plus the document's base path
(`servers[0].url`), and allows cross-origin requests.

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
Chromium against a mocked API: the home page, pagination, search, sorting, filters, references, CSV export, every form field
kind, validation, server errors per field, detail pages and tabs, edit, delete and bulk delete, file upload, the
phone menu, and for an API with sign-in: permissions, refresh tokens, sign-out and switching between French and
English. It needs `npx playwright-core install chromium` once. Set `E2E_UI=fallback` to use
minimal stand-in components when the shadcn registry can't be reached, and `E2E_REUSE=1` to skip reinstalling the app.

`docs/demo.gif` is recorded with `node scripts/record-demo.ts <app>`, where `<app>` was made with
`generate-api create <app> --example bookstore` (needs ffmpeg).

Releases are published by GitHub Actions when a `v*` tag matching `package.json`'s version is pushed.
