# Examples

## Bookstore

[`bookstore/openapi.yaml`](bookstore/openapi.yaml) describes a small bookstore API: books, authors and orders,
with sign-in, refresh tokens and permissions. [`bookstore/api-gen.config.yaml`](bookstore/api-gen.config.yaml) is
its design: labels, icons, columns, filters, a purple theme, prices in euros, and English and French.

What it shows:

| In the API | In the back office |
| --- | --- |
| `authorId` on books | an author picker in the form, author names in the table, books listed on the author's page |
| `bookIds` on orders | checkboxes to pick the books, their titles in the table |
| `genre`, `authorId`, `inStock` query parameters of `GET /books` | filters above the table |
| `q`, `sort`, `page`, `limit` | search, sortable columns and pages, all on the server |
| `GET /books/{id}/reviews` | a Reviews tab on the book's page |
| `POST /books/{id}/restock`, `POST /orders/{id}/cancel` | buttons on each row (Restock asks for a quantity) |
| `POST /auth/login`, `/auth/refresh`, `/auth/logout` | a sign-in page; expired tokens are refreshed; signing out tells the API |
| `x-permission: books.delete` | the Delete button only for people allowed to |

### Try it without a backend

```bash
npx -p api-gen-package generate-api create my-bookstore --example bookstore
cd my-bookstore
npm run mock     # a mock API with fake books, authors and orders (any email and password sign in)
npm run dev      # in another terminal, then open the URL it prints
```

The app gets this API and this design. From a clone of this repository,
`generate-api create my-bookstore examples/bookstore/openapi.yaml` does the same with a design written from the
document instead.

### Point it at a real API

The dev server forwards API requests to the mock by default. To use your own server:

```bash
API_URL=https://api.bookstore.example npm run dev
```

### Change the design

```bash
npm run generate:watch
```

then edit `api-gen.config.yaml`: the dashboard is regenerated on every save. Every option is described in the
[README](../README.md#design-file-api-genconfigyaml), and editors with YAML support complete and check them.
