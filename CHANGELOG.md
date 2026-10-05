# Changelog

## 2.2.0 (unreleased)

Improvements from a real back-office build, and options to customize the dashboard.

### Fixed

- Edit pages use the update request body's fields. They used the create body's, so fields `PUT`/`PATCH` doesn't
  accept (like a role's permissions) were shown and silently ignored.
- The dashboard no longer depends on shadcn/ui components that newer styles don't ship (`form`, `select`,
  `alert-dialog`) or on the Radix-only `asChild` prop. Forms, selects and dialogs are generated into
  `components/api-gen/`, so it works with both Radix and Base UI setups. CI now also tests a project created with
  `shadcn init` defaults.
- Spec errors are reported once per problem with a readable location, instead of several lines of validator output.
- On Node.js older than 22.19 the CLI says so and how to upgrade, instead of failing with a syntax error.

### Added

- Login page when the API has a sign-in endpoint: token storage, bearer token on secured requests, redirect to
  `/login` when signed out or on 401, sign-out button. `--no-login` turns it off.
- Row actions: item operations such as `POST /users/{id}/status` get a button on each row, with a confirmation or a
  form dialog, and a hook (`useSetUserStatus`).
- Dashboard options (`ui` in the config file, plus flags): `title`, `locale` (`en`, `fr`), `labels` to override any
  string, `pageSize`, `primaryColor`, `theme` (any shadcn color token for light and dark, `radius`, `font`),
  `darkModeToggle`, and per-resource `label`, `singularLabel` and `hidden`.
- Design file: `api-gen.config.yaml` (YAML config) with per-resource `description`, `columns` (which and in what
  order), `fields` (`label`, `hidden`, `order`, `help`, `placeholder`, `widget` such as `textarea`) and `actions`
  (`label`, `hidden`), plus `ui.nav` for the sidebar order. The login form takes the field options of its resource.
- `generate-api init` writes a starting design file from the OpenAPI document, listing every resource, column,
  field and action with its label.
- The config file is validated against `config.schema.json` (shipped with the package, also usable by editors for
  completion): typos stop generation with a "did you mean" hint, and names that match nothing in the API are
  reported as warnings.
- Light/dark switch in the sidebar, the dashboard title in the sidebar, and `/` redirecting to the first resource.
- The CLI prints the npm packages to install along with the shadcn components.

### Changed

- The generated form components are `<Resource>CreateForm` and `<Resource>EditForm` (was `<Resource>Form`).
- Install `react-hook-form`, `zod` and `@hookform/resolvers` yourself: the shadcn `form` component used to pull them in.
- Bare `operationId`s like `login` get the resource name appended, as other bare verbs already did (`loginAuth`).

## 2.1.0

### Added

- Wrapped responses such as `{ success, data, message, meta }` are detected and handled:
  - API functions for single records return the payload (`getUser(id): Promise<User>`), so edit forms are prefilled.
    Previously they returned the envelope and the edit form came up empty.
  - A body with `success: false` (or `ok: false`) is thrown as an error with the server's message, even with HTTP 200.
  - Lists keep their envelope so metadata stays available; their rows are found inside it.
  - `--envelope <key>` forces the payload property; `--no-envelope` turns unwrapping off.
- Totals nested in list responses, such as `meta.total` or `data.totalCount`, are used for "Page x of y".

### Changed

- For APIs with wrapped responses, the return types of the generated functions for single records change from the
  envelope to the record. Code calling them directly should drop its own `.data`.

## 2.0.0 (2026-10-03)

A rewrite. Generated projects now compile under strict TypeScript and are tested end to end in a browser.

### Breaking changes

- API functions take only what their endpoint needs (`getUser(id)`, `createUser(body)`, `listUsers(query)`) instead
  of `(params, payload)`, and throw on errors instead of returning them.
- Types moved from `types/<resource>.ts` to `types/index.ts`.
- Hooks are split per action: `useUsers(query)`, `useUser(id)`, `useCreateUser()`, `useUpdateUser(id)`,
  `useDeleteUser()`, replacing the single `useUsers(enable, id)` hook. Toasts use `sonner`.
- Generated names use the singular for single records (`createUser`, `CreateUser.tsx`, "User created").
- The dashboard uses shadcn/ui instead of Ant Design.
- The package is ESM, written in TypeScript, and requires Node.js 22.19 or newer.

### Added

- Dashboard for React Router or the Next.js App Router (`--router next`), with server-side pagination, search and
  sort when the list endpoint supports them, and client-side otherwise.
- Form inputs for every kind of field: enums, lists, enum lists, nested objects, JSON, date-times and file uploads
  (multipart requests use `FormData`).
- `x-label`, `x-hidden` and `x-order` vendor extensions.
- `utils/auth.ts` built from `securitySchemes`, applying the right credentials per operation.
- Header parameters, Swagger 2.0 input, JSON input and URLs.
- `--zod` to validate responses at runtime with generated zod schemas.
- Config file (`api-gen.config.json`/`.js`), `--only`, `--prefix`, `--group-by tag`, `--base-url` (defaulting to the
  document's server URL), `--templates`, `--watch`, `--no-format`.
- Files generated by a previous run that are no longer produced are removed (`--no-clean` to keep them).
- Unit tests that type-check generated output, an end-to-end test in a real Vite + shadcn/ui app, and CI.

## 1.0.11

- Generates axios API functions, TypeScript interfaces, React Query hooks and an Ant Design dashboard from a
  Swagger YAML file.
