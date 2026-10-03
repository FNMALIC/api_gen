// Loose OpenAPI 3.x shapes: only what the generator reads, plus vendor extensions (x-*)

export interface SchemaObject {
    $ref?: string;
    type?: string | string[];
    format?: string;
    enum?: unknown[];
    const?: unknown;
    nullable?: boolean;
    items?: SchemaObject;
    properties?: Record<string, SchemaObject>;
    required?: string[];
    additionalProperties?: boolean | SchemaObject;
    allOf?: SchemaObject[];
    oneOf?: SchemaObject[];
    anyOf?: SchemaObject[];
    description?: string;
    readOnly?: boolean;
    writeOnly?: boolean;
    minimum?: number;
    default?: unknown;
    [extension: `x-${string}`]: unknown;
}

export interface ParameterObject {
    $ref?: string;
    name: string;
    in: 'path' | 'query' | 'header' | 'cookie';
    required?: boolean;
    description?: string;
    schema?: SchemaObject;
}

export interface MediaTypeObject {
    schema?: SchemaObject;
}

export interface RequestBodyObject {
    $ref?: string;
    required?: boolean;
    content?: Record<string, MediaTypeObject>;
}

export interface ResponseObject {
    $ref?: string;
    description?: string;
    content?: Record<string, MediaTypeObject>;
}

export type SecurityRequirement = Record<string, string[]>;

export interface OperationObject {
    operationId?: string;
    summary?: string;
    description?: string;
    deprecated?: boolean;
    tags?: string[];
    parameters?: ParameterObject[];
    requestBody?: RequestBodyObject;
    responses?: Record<string, ResponseObject>;
    security?: SecurityRequirement[];
}

export const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export type PathItemObject = { parameters?: ParameterObject[] } & Partial<Record<HttpMethod, OperationObject>>;

export interface SecuritySchemeObject {
    type: 'http' | 'apiKey' | 'oauth2' | 'openIdConnect' | string;
    scheme?: string;
    in?: 'header' | 'query' | 'cookie';
    name?: string;
}

export interface OpenAPIDocument {
    openapi?: string;
    swagger?: string;
    info?: { title?: string; version?: string };
    servers?: Array<{ url: string; variables?: Record<string, { default: string }> }>;
    paths?: Record<string, PathItemObject>;
    security?: SecurityRequirement[];
    components?: {
        schemas?: Record<string, SchemaObject>;
        parameters?: Record<string, ParameterObject>;
        requestBodies?: Record<string, RequestBodyObject>;
        responses?: Record<string, ResponseObject>;
        securitySchemes?: Record<string, SecuritySchemeObject>;
    };
}

// What the generators work with

export interface PathParam {
    name: string;
    identifier: string;
    schema?: SchemaObject;
    isNumber: boolean;
}

export interface Param {
    name: string;
    required: boolean;
    schema?: SchemaObject;
    description?: string;
}

export interface RequestBody {
    contentType: string;
    schema?: SchemaObject;
    required: boolean;
    multipart: boolean;
}

export type CrudAction = 'list' | 'create' | 'retrieve' | 'update' | 'delete';

export interface Operation {
    method: HttpMethod;
    path: string;
    operationId?: string;
    summary?: string;
    description?: string;
    deprecated: boolean;
    /** Security alternatives: [["bearerAuth"], ["apiKey"]] means bearer OR api key; [] means public */
    security: string[][];
    pathParams: PathParam[];
    queryParams: Param[];
    headerParams: Param[];
    body: RequestBody | null;
    responseSchema: SchemaObject | null;
    responseIsJson: boolean;
    crud: CrudAction | null;
    functionName: string;
}

export interface Field {
    name: string;
    label: string;
    hidden: { table: boolean; form: boolean };
    order: number;
    type: string;
    format?: string;
    enum?: unknown[];
    readOnly: boolean;
    writeOnly: boolean;
    nullable: boolean;
    required: boolean;
    description?: string;
    items?: { type: string; format?: string; enum?: unknown[]; isObject: boolean };
    isMap?: boolean;
    properties?: Field[];
}

export interface ListCapabilities {
    serverPaging: boolean;
    page: { name: string; base: 0 | 1 } | null;
    offset: { name: string } | null;
    size: { name: string } | null;
    search: { name: string } | null;
    sort: { name: string; direction: { name: string; asc: string; desc: string } | null } | null;
    totalKey: string | null;
}

export interface Model {
    key: string;
    /** camelCase identifier, used for file names (api/<name>.ts) */
    name: string;
    /** kebab-case route segment */
    slug: string;
    Singular: string;
    Plural: string;
    /** Plural, or Plural + "List" when singular and plural are the same word (health, data) */
    PluralOrList: string;
    singularLabel: string;
    pluralLabel: string;
    basePath: string;
    operations: Operation[];
    crud: Partial<Record<CrudAction, Operation>>;
    formFields: Field[];
    columns: Field[];
    listCapabilities: ListCapabilities | null;
}

/** Generated files: path relative to the output directory -> content */
export type FileMap = Record<string, string>;

export type Target = 'api' | 'hooks' | 'dashboard';
export type RouterName = 'react-router' | 'next';

export interface TemplateContext {
    model: Model | null;
    router: RouterName;
    defaultContent: string;
}

export type TemplateKind = 'api' | 'hooks' | 'listPage' | 'createPage' | 'editPage' | 'form' | 'layout' | 'routes';

/** Return new content for a generated file, or undefined to keep the default */
export type Templates = Partial<Record<TemplateKind, (context: TemplateContext) => string | undefined | null>>;
