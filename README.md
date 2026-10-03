# API Gen Package

A CLI tool to automatically generate TypeScript APIs, interfaces, and React Query hooks from Swagger/OpenAPI YAML files. The package also generates CRUD dashboards for React built with [shadcn/ui](https://ui.shadcn.com) components.

## Features

- **API Functions**: Generates API methods (GET, POST, PUT, DELETE) from a Swagger schema.
- **TypeScript Interfaces**: Automatically converts Swagger models into TypeScript interfaces.
- **React Query Hooks**: Provides ready-to-use hooks for data fetching and mutation with React Query.
- **CRUD Dashboards**: Generates React dashboard pages with shadcn/ui tables, forms (react-hook-form + zod validation built from your schemas), delete confirmation dialogs, and Sonner toasts.

## Installation

Install the package globally:

```bash
npm install -g api-gen-package
```

## Usage

```bash
generate-api [schema.yaml] [output-directory]
```

This writes `api/`, `types/`, `hooks/`, `utils/` and `pages/` into the output directory (default `./src`).

## Dashboard setup (shadcn/ui)

The generated dashboard imports components from `@/components/ui/*`, so your app needs
[shadcn/ui set up](https://ui.shadcn.com/docs/installation) with the `@` alias pointing at your source folder.
Then add the components it uses:

```bash
npx shadcn@latest add button card table form input checkbox select alert-dialog sonner
npm install react-router-dom @tanstack/react-query axios
```

Mount the generated routes (the layout includes the sidebar and the `<Toaster />`):

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

Generated per model (`/api/<model>/...` paths):

- `pages/<model>/<Model>List.tsx` – table with edit and delete (confirmed via an alert dialog)
- `pages/<model>/Create<Model>.tsx` and `Edit<Model>.tsx` – pages that share `<Model>Form.tsx`
- `pages/<model>/<Model>Form.tsx` – a zod schema built from the OpenAPI properties (required, email, enum, number, boolean) and the matching inputs

