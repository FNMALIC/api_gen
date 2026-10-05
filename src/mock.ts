// A mock API from an OpenAPI document: in-memory records with fake data, for trying the dashboard without a backend
import http from 'node:http';
import { buildModels, loadSpec, resolveObject, schemaType, TOKEN_NAMES, TOTAL_NAMES, type EnvelopeOption } from './spec.ts';
import { createTypeContext, type TypeContext } from './generators/types.ts';
import { humanize } from './helpers.ts';
import type { Field, LoginInfo, Model, OpenAPIDocument, Operation, SchemaObject } from './model.ts';

export interface MockOptions {
    /** OpenAPI document: path or URL */
    input: string;
    port?: number;
    host?: string;
    /** Records per resource (default 25) */
    rows?: number;
    /** Milliseconds before each response, to see loading states (default 0) */
    delay?: number;
    prefix?: string;
    groupBy?: 'path' | 'tag';
    envelope?: EnvelopeOption;
    /** Log each request */
    log?: (line: string) => void;
}

export interface MockServer {
    /** Where the API answers, including the document's base path, e.g. http://localhost:4010/v1 */
    url: string;
    server: http.Server;
    close(): Promise<void>;
}

type Row = Record<string, unknown>;

// Deterministic pseudo-random numbers, so every run serves the same data
function random(seed: number) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const FIRST_NAMES = ['Ada', 'Alan', 'Grace', 'Linus', 'Margaret', 'Dennis', 'Barbara', 'Ken', 'Radia', 'Tim', 'Frances', 'Edsger'];
const LAST_NAMES = ['Lovelace', 'Turing', 'Hopper', 'Torvalds', 'Hamilton', 'Ritchie', 'Liskov', 'Thompson', 'Perlman', 'Berners-Lee', 'Allen', 'Dijkstra'];
const WORDS = ['alpha', 'bravo', 'cedar', 'delta', 'ember', 'fjord', 'glade', 'harbor', 'iris', 'juniper', 'kelp', 'lumen', 'maple', 'nova', 'orbit', 'prism'];

const pick = <T>(items: readonly T[], rand: () => number): T => items[Math.floor(rand() * items.length) % items.length];

// A small colored image with a letter, as a data URL, so it shows without a network connection
function placeholderImage(index: number, rand: () => number): string {
    const hue = Math.floor(rand() * 360);
    const letter = String.fromCharCode(65 + (index % 26));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="hsl(${hue} 65% 55%)"/><text x="40" y="52" font-family="sans-serif" font-size="34" font-weight="600" fill="white" text-anchor="middle">${letter}</text></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** A plausible value for a field, from its type, format and name */
export function fakeValue(field: Field, index: number, rand: () => number, owner?: string): unknown {
    const name = field.name;
    if (field.enum && field.enum.length > 0) return pick(field.enum, rand);
    switch (field.type) {
        case 'boolean':
            return rand() > 0.4;
        case 'integer':
        case 'number': {
            if (/(^|_)id$|Id$/.test(name) || name === 'id') return index;
            if (/price|amount|cost|total|balance|fee|salary/i.test(name)) return Math.round(rand() * 50000) / 100;
            if (/age$/i.test(name)) return 18 + Math.floor(rand() * 60);
            if (/(rating|stars|score)$/i.test(name)) return 1 + Math.floor(rand() * 5);
            if (/year/i.test(name)) return 2000 + Math.floor(rand() * 26);
            if (/(count|quantity|stock|qty)/i.test(name)) return Math.floor(rand() * 200);
            return field.type === 'integer' ? Math.floor(rand() * 100) : Math.round(rand() * 10000) / 100;
        }
        case 'array': {
            const items = field.items;
            if (!items || items.isObject) return [];
            if (items.enum && items.enum.length > 0) return items.enum.filter(() => rand() > 0.5);
            if (items.type === 'integer' || items.type === 'number') return [1 + Math.floor(rand() * 5)];
            return [pick(WORDS, rand), pick(WORDS, rand)];
        }
        case 'object': {
            if (!field.properties) return {};
            return Object.fromEntries(field.properties.map(child => [child.name, fakeValue(child, index, rand)]));
        }
        case 'string':
            break;
        default:
            return null;
    }
    const days = Math.floor(rand() * 365);
    const date = new Date(Date.UTC(2026, 0, 1) - days * 86400000 + Math.floor(rand() * 86400000));
    if (field.format === 'date-time') return date.toISOString();
    if (field.format === 'date') return date.toISOString().slice(0, 10);
    if (field.format === 'email' || /e-?mail/i.test(name)) return `${pick(FIRST_NAMES, rand).toLowerCase()}${index}@example.com`;
    if (field.format === 'uuid' || /uuid|guid/i.test(name)) {
        const hex = () => Math.floor(rand() * 0x10000).toString(16).padStart(4, '0');
        return `${hex()}${hex()}-${hex()}-4${hex().slice(1)}-a${hex().slice(1)}-${hex()}${hex()}${hex()}`;
    }
    if (/(image|avatar|photo|picture|logo|thumbnail|cover|banner)/i.test(name)) return placeholderImage(index, rand);
    if (field.format === 'uri' || field.format === 'url' || /(url|link|website)$/i.test(name)) return `https://example.com/${name.toLowerCase()}/${index}`;
    if (field.format === 'password' || /^(password|pass|pwd|secret)$/i.test(name)) return 'secret';
    if (field.format === 'binary') return null;
    if (/^(first_?name|given_?name)$/i.test(name)) return pick(FIRST_NAMES, rand);
    if (/^(last_?name|family_?name|surname)$/i.test(name)) return pick(LAST_NAMES, rand);
    // People get people's names; other records are named after what they are: "Role 3"
    const people = !owner || /(user|person|people|customer|client|employee|member|author|contact|account|staff|student|patient|owner)/i.test(owner);
    if (/^(name|full_?name|display_?name|username|nickname)$/i.test(name) && people) return `${pick(FIRST_NAMES, rand)} ${pick(LAST_NAMES, rand)}`;
    if (/^(name|display_?name)$/i.test(name) && owner) return `${owner} ${index}`;
    if (/(phone|mobile|tel)/i.test(name)) return `+1 555 ${String(1000 + Math.floor(rand() * 9000))}`;
    if (/(description|summary|bio|notes?|comment|body|content|message)$/i.test(name)) {
        return `${humanize(pick(WORDS, rand))} ${pick(WORDS, rand)} ${pick(WORDS, rand)} ${pick(WORDS, rand)}.`;
    }
    if (/(color|colour)$/i.test(name)) return `#${Math.floor(rand() * 0xffffff).toString(16).padStart(6, '0')}`;
    if (/(title|label|subject)$/i.test(name)) return `${humanize(pick(WORDS, rand))} ${humanize(pick(WORDS, rand))}`;
    if (/(code|sku|slug|ref|reference)$/i.test(name)) return `${pick(WORDS, rand).toUpperCase().slice(0, 3)}-${String(index).padStart(4, '0')}`;
    return `${humanize(name)} ${index}`;
}

interface Store {
    model: Model;
    rows: Row[];
    nextId: number;
    numericIds: boolean;
}

// Wrap a payload like the response schema does: { success, data, meta: { total } }, { items, total }, ...
function shape(
    context: TypeContext,
    schema: SchemaObject | null | undefined,
    payload: { list?: Row[]; record?: Row; envelopeKey?: string | null; total?: number; page?: number },
    depth = 0
): unknown {
    const resolvedSchema = context.deref(schema);
    if (!resolvedSchema) return payload.record ?? payload.list ?? null;
    if (schemaType(resolvedSchema) === 'array') return payload.list ?? (payload.record ? [payload.record] : []);
    const object = resolveObject(context, resolvedSchema);
    if (!object) return payload.record ?? null;
    // A record response that is the record itself
    if (payload.record && payload.envelopeKey === undefined && depth === 0) return payload.record;
    const result: Row = {};
    for (const [name, rawProp] of Object.entries(object.properties)) {
        const prop = context.deref(rawProp) ?? {};
        const type = schemaType(prop);
        if (payload.record && name === payload.envelopeKey) result[name] = payload.record;
        else if (payload.list && type === 'array') result[name] = payload.list;
        else if (TOTAL_NAMES.includes(name.toLowerCase()) && (type === 'integer' || type === 'number')) result[name] = payload.total ?? payload.list?.length ?? 0;
        else if (/^(success|ok)$/i.test(name) && type === 'boolean') result[name] = true;
        else if (name.toLowerCase() === 'page' && (type === 'integer' || type === 'number')) result[name] = payload.page ?? 1;
        else if (name.toLowerCase() === 'message' && type === 'string') result[name] = 'OK';
        else if (type === 'object' && depth < 2) result[name] = shape(context, prop, payload, depth + 1);
        else if (TOKEN_NAMES.includes(name) && type === 'string') result[name] = `mock-token-${Date.now()}`;
        else if (/^refresh_?token$/i.test(name)) result[name] = `mock-refresh-token-${Date.now()}`;
        else if (/^(permissions|scopes|roles)$/i.test(name) && type === 'array') result[name] = ['*'];
        else result[name] = fakeValue({ name, label: name, hidden: { table: false, form: false }, order: 0, type, format: prop.format, enum: prop.enum, readOnly: false, writeOnly: false, nullable: false, required: false }, 1, random(name.length));
    }
    return result;
}

const sendJson = (res: http.ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(body === undefined ? '' : JSON.stringify(body));
};

function readBody(req: http.IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            if (!text || !/json/i.test(req.headers['content-type'] ?? '')) return resolve({});
            try {
                resolve(JSON.parse(text));
            } catch {
                reject(new Error('Invalid JSON body'));
            }
        });
        req.on('error', reject);
    });
}

const pathPattern = (path: string) => new RegExp(`^${path.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{[^}]+\}/g, '([^/]+)')}$`);

function compare(a: unknown, b: unknown): number {
    if (a === b) return 0;
    if (a === null || a === undefined) return 1;
    if (b === null || b === undefined) return -1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), undefined, { numeric: true });
}

/** Build the in-memory data and the request handler for an API description */
export function createMockHandler(api: OpenAPIDocument, options: Omit<MockOptions, 'input'> = {}) {
    const context = createTypeContext(api);
    const { models, login } = buildModels(api, context, { prefix: options.prefix, groupBy: options.groupBy, envelope: options.envelope });
    const rowCount = options.rows ?? 25;
    const rand = random(42);
    const stores = new Map<string, Store>();

    for (const model of models) {
        if (!model.crud.list && !model.crud.retrieve) continue;
        const idField = model.columns.find(field => field.name === model.idKey);
        const idParam = (model.crud.retrieve ?? model.crud.update ?? model.crud.delete)?.pathParams[0];
        const numericIds = idField ? idField.type === 'integer' || idField.type === 'number' : idParam?.isNumber ?? true;
        const rows = Array.from({ length: rowCount }, (_, i) => {
            const row: Row = {};
            for (const field of model.columns) row[field.name] = fakeValue(field, i + 1, rand, model.singularLabel);
            row[model.idKey] = numericIds ? i + 1 : `${model.Singular.toLowerCase()}-${i + 1}`;
            return row;
        });
        stores.set(model.key, { model, rows, nextId: rowCount + 1, numericIds });
    }
    // Foreign keys point at records that exist
    for (const store of stores.values()) {
        for (const field of store.model.columns) {
            const target = field.reference && stores.get(field.reference.resource);
            if (!target || target.rows.length === 0) continue;
            for (const row of store.rows) {
                const ids = target.rows.map(candidate => candidate[target.model.idKey]);
                row[field.name] = field.reference!.many ? ids.filter(() => rand() > 0.6).slice(0, 3) : pick(ids, rand);
            }
        }
    }

    const routes = models.flatMap(model => model.operations.map(op => ({ model, op, pattern: pathPattern(op.path) })));
    // The document's base path (https://api.example.com/v1 -> /v1), which the generated client puts in baseURL
    const serverPath = (() => {
        try {
            return new URL(api.servers?.[0]?.url ?? '/', 'http://localhost').pathname.replace(/\/$/, '');
        } catch {
            return '';
        }
    })();

    const findRow = (store: Store, id: string) => store.rows.find(row => String(row[store.model.idKey]) === id);

    function missingRequired(fields: Field[], body: Row): Record<string, string[]> {
        const errors: Record<string, string[]> = {};
        for (const field of fields) {
            if (field.required && !field.readOnly && (body[field.name] === undefined || body[field.name] === null || body[field.name] === '')) {
                errors[field.name] = [`${field.label} is required`];
            }
        }
        return errors;
    }

    function respondRecord(res: http.ServerResponse, op: Operation, record: Row, status = 200) {
        sendJson(res, status, shape(context, op.responseSchema, { record, envelopeKey: op.envelope ? op.envelope.key : undefined }));
    }

    async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
        res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] ?? 'Authorization, Content-Type');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            return res.end();
        }
        const url = new URL(req.url ?? '/', 'http://localhost');
        let pathname = decodeURIComponent(url.pathname);
        if (serverPath && pathname.startsWith(serverPath)) pathname = pathname.slice(serverPath.length) || '/';
        const method = (req.method ?? 'GET').toLowerCase();
        options.log?.(`${method.toUpperCase()} ${url.pathname}${url.search}`);
        if (options.delay) await new Promise(resolve => setTimeout(resolve, options.delay));

        const route = routes.find(candidate => candidate.op.method === method && candidate.pattern.test(pathname));
        if (!route) return sendJson(res, 404, { message: `No operation for ${method.toUpperCase()} ${pathname}` });
        const { model, op } = route;
        const params = pathname.match(route.pattern)!.slice(1);
        const store = stores.get(model.key);
        let body: Row;
        try {
            body = (await readBody(req)) as Row;
        } catch (error) {
            return sendJson(res, 400, { message: (error as Error).message });
        }
        const query = Object.fromEntries(url.searchParams);

        if (login && op === login.op) {
            return sendJson(res, 200, shape(context, op.responseSchema, {}));
        }
        if (store && op.crud === 'list') {
            const caps = model.listCapabilities;
            let rows = store.rows;
            const search = caps?.search && query[caps.search.name];
            if (search) rows = rows.filter(row => Object.values(row).some(value => typeof value === 'string' && value.toLowerCase().includes(search.toLowerCase())));
            for (const filter of model.filters) {
                const value = query[filter.name];
                if (value === undefined || value === '') continue;
                rows = rows.filter(row => {
                    const cell = row[filter.name];
                    return Array.isArray(cell) ? cell.map(String).includes(value) : filter.kind === 'text' ? String(cell ?? '').toLowerCase().includes(value.toLowerCase()) : String(cell) === value;
                });
            }
            if (caps?.sort && query[caps.sort.name]) {
                let key = query[caps.sort.name];
                let direction = 1;
                if (caps.sort.direction) direction = query[caps.sort.direction.name] === caps.sort.direction.desc ? -1 : 1;
                else if (key.startsWith('-')) {
                    key = key.slice(1);
                    direction = -1;
                }
                rows = [...rows].sort((a, b) => compare(a[key], b[key]) * direction);
            }
            const total = rows.length;
            let page = 1;
            if (caps?.serverPaging && caps.size) {
                const size = Number(query[caps.size.name]) || 10;
                let start = 0;
                if (caps.page) {
                    page = Number(query[caps.page.name] ?? caps.page.base) || caps.page.base;
                    start = (page - caps.page.base) * size;
                    page = page - caps.page.base + 1;
                } else if (caps.offset) {
                    start = Number(query[caps.offset.name]) || 0;
                }
                rows = rows.slice(start, start + size);
            }
            return sendJson(res, 200, shape(context, op.responseSchema, { list: rows, total, page }));
        }
        if (store && op.crud === 'retrieve') {
            const row = findRow(store, params[0]);
            return row ? respondRecord(res, op, row) : sendJson(res, 404, { success: false, message: 'Not found' });
        }
        if (store && op.crud === 'create') {
            const errors = missingRequired(model.formFields, body);
            if (Object.keys(errors).length > 0) return sendJson(res, 422, { success: false, message: 'Validation failed', errors });
            const row: Row = {};
            for (const field of model.columns) row[field.name] = field.readOnly ? fakeValue(field, store.nextId, rand) : null;
            Object.assign(row, body, { [model.idKey]: store.numericIds ? store.nextId : `${model.Singular.toLowerCase()}-${store.nextId}` });
            store.nextId++;
            store.rows.unshift(row);
            return respondRecord(res, op, row, 201);
        }
        if (store && op.crud === 'update') {
            const row = findRow(store, params[0]);
            if (!row) return sendJson(res, 404, { success: false, message: 'Not found' });
            if (op.method === 'put') {
                const errors = missingRequired(model.editFields, body);
                if (Object.keys(errors).length > 0) return sendJson(res, 422, { success: false, message: 'Validation failed', errors });
            }
            Object.assign(row, body, { [model.idKey]: row[model.idKey] });
            return respondRecord(res, op, row);
        }
        if (store && op.crud === 'delete') {
            const index = store.rows.findIndex(row => String(row[model.idKey]) === params[0]);
            if (index === -1) return sendJson(res, 404, { success: false, message: 'Not found' });
            store.rows.splice(index, 1);
            if (!op.responseSchema) {
                res.writeHead(204);
                return res.end();
            }
            return sendJson(res, 200, shape(context, op.responseSchema, {}));
        }
        // Row actions: apply what the body holds to the record
        const action = model.actions.find(candidate => candidate.op === op);
        if (store && action) {
            const row = findRow(store, params[0]);
            if (!row) return sendJson(res, 404, { success: false, message: 'Not found' });
            for (const [key, value] of Object.entries(body)) if (key in row) row[key] = value;
            return respondRecord(res, op, row);
        }
        // Lists under a record
        const sub = model.subResources.find(candidate => candidate.op === op);
        if (sub) {
            const subRand = random(params[0].length * 31 + sub.Name.length);
            const rows = Array.from({ length: 5 }, (_, i) => Object.fromEntries(sub.columns.map(field => [field.name, fakeValue(field, i + 1, subRand)])));
            return sendJson(res, 200, shape(context, op.responseSchema, { list: rows, total: rows.length }));
        }
        if (!op.responseSchema) {
            res.writeHead(204);
            return res.end();
        }
        return sendJson(res, op.method === 'post' ? 201 : 200, shape(context, op.responseSchema, {}));
    }

    return { handle, models, login: login as LoginInfo | null, serverPath, stores };
}

/** Start the mock API; resolves once it listens */
export async function startMockServer(options: MockOptions): Promise<MockServer> {
    const api = await loadSpec(options.input);
    const { handle, serverPath } = createMockHandler(api, options);
    const server = http.createServer((req, res) => {
        handle(req, res).catch(error => sendJson(res, 500, { message: (error as Error).message }));
    });
    const host = options.host ?? 'localhost';
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(options.port ?? 4010, host, () => resolve());
    });
    const { port } = server.address() as { port: number };
    return {
        url: `http://${host}:${port}${serverPath}`,
        server,
        close: () => new Promise(resolve => server.close(() => resolve())),
    };
}
