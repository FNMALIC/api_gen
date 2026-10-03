# API Gen Package

A CLI that turns an OpenAPI 3 document into a ready-to-use React data layer and admin UI:

- **TypeScript types** for every schema in `components.schemas`
- **API functions** (axios) with typed path params, query params, request bodies and responses
- **React Query hooks** per resource, with Sonner toasts on success and failure
- **CRUD dashboard** built with [shadcn/ui](https://ui.shadcn.com): a searchable, sortable, paginated table,
  create/edit forms validated with zod, and delete confirmation dialogs, for React Router or the Next.js App Router

## Installation

```bash
npm install -g api-gen-package
```

Requires Node.js 22.19 or newer.

## Usage

```bash
generate-api [input] [output] [options]
```

`input` is a local file or URL, YAML or JSON (default `./schema.yaml`). `output` defaults to `./src`.
The `api-gen` command is an alias.

| Option | Description |
| --- | --- |
| `--only <targets>` | Comma-separated subset of `api`, `hooks`, `dashboard` (default: all) |
| `--router <router>` | Dashboard routing: `react-router` (default) or `next` |
| `--base-url <url>` | axios `baseURL` used when `utils/api.ts` is first created (default `/`) |
| `--prefix <path>` | Path prefix before the resource name, e.g. `/api/v1`. By default leading `api` and `v1`-style segments are skipped |
| `--group-by <mode>` | Group operations into resources by first path segment (`path`, default) or by first tag (`tag`) |
| `--no-format` | Skip Prettier formatting (your project's Prettier config is used when present) |
| `-w, --watch` | Regenerate whenever the input file changes |

Examples:

```bash
generate-api openapi.yaml src
generate-api https://petstore3.swagger.io/api/v3/openapi.json src --router next
generate-api openapi.json src --only api,hooks --base-url https://api.example.com
generate-api openapi.yaml src --watch
```

The command exits with code 1 when the document is invalid or generation fails, so it can run in CI.

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

Other operations (e.g. `POST /orders/{id}/cancel`) are still generated as API functions. Pages and hook members are
only generated for actions the API actually has, so a read-only resource gets a table without create, edit or delete.

```
src/
  types/index.ts           one type per schema
  api/<resource>.ts        one function per operation
  utils/api.ts             axios instance (created once, yours to edit)
  hooks/use<Resource>.ts   React Query hook
  pages/...                React Router dashboard (or app/(dashboard)/... with --router next)
```

API functions are named after `operationId` (bare verbs such as `list` become `listUsers`) and look like:

```ts
export const getUser = async (id: number, config?: AxiosRequestConfig): Promise<User> => { ... };
export const listUsers = async (query?: { page?: number; search?: string }, config?: AxiosRequestConfig): Promise<User[]> => { ... };
```

Errors are thrown (not returned), so React Query's error states and the hooks' error toasts work.

### Authentication

`utils/api.ts` is only created if it doesn't exist, so you can add your own interceptors. It sends a bearer token
when you register a getter:

```ts
import { setAuthTokenGetter } from "@/utils/api";

setAuthTokenGetter(() => localStorage.getItem("token"));
```

It also copies the server's error message (`message`, `detail` or `error` in the response body) into
`error.message`, which the toasts display.

## Dashboard setup (shadcn/ui)

The dashboard imports components from `@/components/ui/*`, so your app needs
[shadcn/ui set up](https://ui.shadcn.com/docs/installation) with the `@` alias pointing at your source folder.
Then add the components and libraries it uses:

```bash
npx shadcn@latest add button card table form input checkbox select alert-dialog sonner
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

```js
const { generate } = require("api-gen-package");

const { written, warnings } = await generate({
  input: "openapi.yaml",
  output: "src",
  router: "next",
});
```

## Upgrading from 1.x

- API functions now take only the arguments their endpoint needs (`getUser(id)` instead of `(params, payload)`) and
  throw on errors.
- Types moved from `types/<resource>.ts` to `types/index.ts`; delete the old files after regenerating.
- Hooks import from `sonner` instead of `@/components/ui/use-toast`.

## Development

```bash
npm install
npm test
```

The tests generate code from the specs in `test/fixtures` and type-check the output with strict `tsc` settings.
