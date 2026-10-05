import { HEADER } from './api.ts';
import { generateDialogComponent, generateFormFile, generateFormPrimitives, editable, FIELDS_IMPORT, type FormSpec } from './form.ts';
import { generateFieldsComponent, generateI18n } from './runtime.ts';
import {
    SESSION_IMPORT,
    generateCreatePage,
    generateDetailPage,
    generateEditPage,
    generateHomePage,
    generateListPage,
    permissionCheck,
    tableColumns,
    type PageContext,
} from './pages.ts';
import { i18nImport } from './shared.ts';
import { applyTemplate } from '../helpers.ts';
import { generateThemeCss, iconName, isHidden, isMultiLocale, type Ui } from '../ui.ts';
import type { Field, FileMap, LoginInfo, Model, RouterName, TemplateKind, Templates } from '../model.ts';

export { tableColumns };

// shadcn/ui components the generated dashboard imports from "@/components/ui/*". Forms, selects and dialogs are
// generated into components/api-gen/, so the dashboard works with both the Radix and the Base UI flavours of shadcn/ui.
export const SHADCN_COMPONENTS = ['button', 'card', 'table', 'input', 'textarea', 'checkbox', 'sonner'];

/** npm packages the generated code imports (besides React and the shadcn/ui components) */
export function dashboardDependencies(router: RouterName, { icons = false }: { icons?: boolean } = {}): string[] {
    return [
        'axios',
        '@tanstack/react-query',
        'react-hook-form',
        'zod',
        '@hookform/resolvers',
        'sonner',
        ...(router === 'react-router' ? ['react-router-dom'] : []),
        ...(icons ? ['lucide-react'] : []),
    ];
}

// Router-specific pieces; everything else in the pages is shared
export interface Router {
    directive: string;
    linkImport: string;
    link(href: string, children: string, className?: string): string;
    navigationImport(withParams: boolean): string;
    navigatorSetup: string;
    navigate(path: string): string;
    paramsSetup: string;
    files(model: Model): {
        list: string;
        create: string;
        edit: string;
        detail: string;
        form: string;
        /** The form file, as imported from the create page, the edit page and the list page */
        createFormImport: string;
        editFormImport: string;
        listFormImport: string;
    };
    /** The home page file and its URL */
    home: { file: string; href: string };
    loginFiles: { page: string; form: string; formImport: string };
}

export const ROUTERS: Record<RouterName, Router> = {
    'react-router': {
        directive: '',
        linkImport: 'import { Link } from "react-router-dom";',
        link: (href, children, className) => `<Link to=${href}${className ? ` className={${className}}` : ''}>${children}</Link>`,
        navigationImport: withParams =>
            `import { ${withParams ? 'useNavigate, useParams' : 'useNavigate'} } from "react-router-dom";`,
        navigatorSetup: 'const navigate = useNavigate();',
        navigate: path => `navigate(${path})`,
        paramsSetup: 'const { id } = useParams();',
        files: model => ({
            list: `pages/${model.name}/${model.Plural}List.tsx`,
            create: `pages/${model.name}/Create${model.Singular}.tsx`,
            edit: `pages/${model.name}/Edit${model.Singular}.tsx`,
            detail: `pages/${model.name}/${model.Singular}Detail.tsx`,
            form: `pages/${model.name}/${model.Singular}Form.tsx`,
            createFormImport: `./${model.Singular}Form`,
            editFormImport: `./${model.Singular}Form`,
            listFormImport: `./${model.Singular}Form`,
        }),
        home: { file: 'pages/HomePage.tsx', href: '/' },
        loginFiles: { page: 'pages/LoginPage.tsx', form: 'pages/LoginForm.tsx', formImport: './LoginForm' },
    },
    next: {
        directive: '"use client";\n',
        linkImport: 'import Link from "next/link";',
        link: (href, children, className) => `<Link href=${href}${className ? ` className={${className}}` : ''}>${children}</Link>`,
        navigationImport: withParams =>
            `import { ${withParams ? 'useParams, useRouter' : 'useRouter'} } from "next/navigation";`,
        navigatorSetup: 'const router = useRouter();',
        navigate: path => `router.push(${path})`,
        paramsSetup: 'const { id } = useParams<{ id: string }>();',
        files: model => ({
            list: `app/(dashboard)/${model.slug}/page.tsx`,
            create: `app/(dashboard)/${model.slug}/create/page.tsx`,
            edit: `app/(dashboard)/${model.slug}/[id]/edit/page.tsx`,
            detail: `app/(dashboard)/${model.slug}/[id]/page.tsx`,
            form: `app/(dashboard)/${model.slug}/${model.Singular}Form.tsx`,
            createFormImport: `../${model.Singular}Form`,
            editFormImport: `../../${model.Singular}Form`,
            listFormImport: `./${model.Singular}Form`,
        }),
        // app/page.tsx usually belongs to the app, so the home page gets its own URL
        home: { file: 'app/(dashboard)/dashboard/page.tsx', href: '/dashboard' },
        loginFiles: { page: 'app/login/page.tsx', form: 'app/login/LoginForm.tsx', formImport: './LoginForm' },
    },
};

const text = (value: string) => JSON.stringify(value);

export type DashboardModel = Model & { pages: { create: boolean; edit: boolean; detail: boolean } };

interface LayoutOptions {
    ui: Ui;
    hasTheme: boolean;
    login: LoginInfo | null;
    context: PageContext;
    homeHref: string | null;
}

function navItemsSource(models: DashboardModel[], options: LayoutOptions): { source: string; icons: string[] } {
    const { ui, context, homeHref } = options;
    const icons = models.map(model => model.icon && iconName(model.icon)).filter((icon): icon is string => !!icon);
    const homeIcon = icons.length > 0 ? 'LayoutDashboard' : null;
    const items = [
        homeHref && `{ href: ${text(homeHref)}, label: ${ui.t('home')}, exact: true${homeIcon ? `, icon: ${homeIcon}` : ''} },`,
        ...models.map(model => {
            const check = permissionCheck(context, model.permissions.list);
            const icon = model.icon ? `, icon: ${iconName(model.icon)}` : '';
            return `{ href: "/${model.slug}", label: ${ui.label(model.pluralLabel)}${icon}${check ? `, permissions: ${JSON.stringify(model.permissions.list)}` : ''} },`;
        }),
    ].filter(Boolean);
    const usesPermissions = models.some(model => permissionCheck(context, model.permissions.list));
    return {
        icons: [...new Set([...(homeIcon ? [homeIcon] : []), ...icons])],
        source: `type NavItem = { href: string; label: string; exact?: boolean; icon?: ComponentType<{ className?: string }>; permissions?: string[] };

const navItems: NavItem[] = [${items.map(item => `\n    ${item}`).join('')}
];${usesPermissions ? `

// Resources the signed-in user may not list are left out
const visibleNavItems = () => navItems.filter((item) => can(item.permissions));` : `

const visibleNavItems = () => navItems;`}`,
    };
}

function sidebarFooter({ ui, login }: LayoutOptions, signOut: string): string {
    const parts = [
        login && `{userName && (
                        <p className="truncate px-3 py-1 text-xs text-muted-foreground" title={userName}>
                            {${ui.t('signedInAs', { name: { code: 'userName' } })}}
                        </p>
                    )}`,
        isMultiLocale(ui) && '<LanguageSwitch />',
        ui.darkModeToggle && `<ThemeToggle label={${ui.t('toggleTheme')}} />`,
        login && `<Button variant="ghost" size="sm" className="justify-start" onClick={${signOut}}>
                        {${ui.t('signOut')}}
                    </Button>`,
    ].filter(Boolean);
    if (parts.length === 0) return '';
    return `
                <div className="mt-auto flex flex-col gap-1 pt-4">
                    ${parts.join('\n                    ')}
                </div>`;
}

function layoutImports(options: LayoutOptions, icons: string[], usesCan: boolean): string {
    const { ui, hasTheme, login } = options;
    return [
        icons.length > 0 && `import { ${icons.join(', ')} } from "lucide-react";`,
        login && `import { ${['getUserName', 'isSignedIn', 'signOut', usesCan && 'can'].filter(Boolean).sort().join(', ')} } from "${SESSION_IMPORT}";`,
        isMultiLocale(ui) && 'import { LanguageSwitch } from "@/components/api-gen/language-switch";',
        ui.darkModeToggle && 'import { ThemeToggle } from "@/components/api-gen/theme-toggle";',
        hasTheme && 'import "@/components/api-gen/theme.css";',
    ]
        .filter(Boolean)
        .join('\n');
}

const MENU_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                        <path d="M4 6h16M4 12h16M4 18h16" />
                    </svg>`;

/** The sidebar: a column on wide screens, a drawer opened from the top bar on phones */
function sidebarShell(options: LayoutOptions, nav: string, signOut: string, main: string): string {
    const { ui } = options;
    return `<div className="api-gen-dashboard flex min-h-screen flex-col md:flex-row">
            <header className="sticky top-0 z-20 flex items-center gap-2 border-b bg-background px-4 py-2 md:hidden">
                <Button variant="ghost" size="sm" aria-label={${ui.t('menu')}} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
                    ${MENU_ICON}
                </Button>
                <span className="truncate font-semibold">{${ui.label(ui.title)}}</span>
            </header>
            {menuOpen && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" aria-hidden onClick={() => setMenuOpen(false)} />}
            <aside
                className={cn(
                    "fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col overflow-y-auto border-r bg-background p-4 transition-transform md:sticky md:top-0 md:h-screen md:w-56 md:translate-x-0 md:bg-muted/40",
                    menuOpen ? "translate-x-0" : "-translate-x-full"
                )}
            >
                <div className="mb-4 px-3 text-lg font-semibold">{${ui.label(ui.title)}}</div>
                <nav className="flex flex-col gap-1">
                    ${nav}
                </nav>${sidebarFooter(options, signOut)}
            </aside>
            <main className="min-w-0 flex-1 p-4 md:p-6">${main}</main>
            <Toaster />
        </div>`;
}

function generateReactRouterLayout(models: DashboardModel[], options: LayoutOptions): string {
    const { login, ui } = options;
    const { source, icons } = navItemsSource(models, options);
    const usesCan = source.includes('can(');
    const nav = `{visibleNavItems().map((item) => (
                        <NavLink
                            key={item.href}
                            to={item.href}
                            end={item.exact}
                            onClick={() => setMenuOpen(false)}
                            className={({ isActive }) => cn(buttonVariants({ variant: isActive ? "secondary" : "ghost" }), "justify-start gap-2")}
                        >
                            {item.icon && <item.icon className="size-4" />}
                            {item.label}
                        </NavLink>
                    ))}`;
    const signOut = `async () => {
                            await signOut();
                            navigate("/login", { replace: true });
                        }`;
    const body = `
${source}

export default function LayoutWithSidebar() {
    const [menuOpen, setMenuOpen] = useState(false);${login ? `
    const navigate = useNavigate();
    if (!isSignedIn()) return <Navigate to="/login" replace />;
    const userName = getUserName();` : ''}

    return (
        ${sidebarShell(options, nav, signOut, `
                <Outlet />
            `)}
    );
}
`;
    return `${HEADER}import { useState, type ComponentType } from "react";
import { ${login ? 'Navigate, ' : ''}NavLink, Outlet${login ? ', useNavigate' : ''} } from "react-router-dom";
import { Button, buttonVariants } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
${layoutImports(options, icons, usesCan)}${i18nImport(ui, body)}
${body}`;
}

function generateNextLayout(models: DashboardModel[], options: LayoutOptions): string {
    const { login, ui } = options;
    const { source, icons } = navItemsSource(models, options);
    const usesCan = source.includes('can(');
    const nav = `{visibleNavItems().map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setMenuOpen(false)}
                            className={cn(
                                buttonVariants({ variant: (item.exact ? pathname === item.href : pathname?.startsWith(item.href)) ? "secondary" : "ghost" }),
                                "justify-start gap-2"
                            )}
                        >
                            {item.icon && <item.icon className="size-4" />}
                            {item.label}
                        </Link>
                    ))}`;
    const signOut = `async () => {
                            await signOut();
                            router.replace("/login");
                        }`;
    const body = `
${source}

export default function DashboardLayout({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const [menuOpen, setMenuOpen] = useState(false);${login ? `
    const router = useRouter();
    // The token lives in localStorage, so the check runs in the browser
    const [signedIn, setSignedIn] = useState(false);
    useEffect(() => {
        if (isSignedIn()) setSignedIn(true);
        else router.replace("/login");
    }, [router]);
    if (!signedIn) return null;
    const userName = getUserName();` : ''}

    return (
        ${sidebarShell(options, nav, signOut, '{children}')}
    );
}
`;
    return `"use client";
${HEADER}import { ${login ? 'useEffect, ' : ''}useState, type ComponentType, type ReactNode } from "react";
import Link from "next/link";
import { usePathname${login ? ', useRouter' : ''} } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
${layoutImports(options, icons, usesCan)}${i18nImport(ui, body)}
${body}`;
}

// Route config to plug into createBrowserRouter / useRoutes
function generateRoutes(models: DashboardModel[], router: Router, login: boolean, home: boolean): string {
    const imports: string[] = [];
    const routes: string[] = [];
    const relative = (file: string) => `./${file.replace(/^pages\//, '').replace(/\.tsx$/, '')}`;
    if (home) {
        imports.push(`import HomePage from "${relative(router.home.file)}";`);
        routes.push('{ path: "/", element: <HomePage /> },');
    } else if (models.length > 0) {
        routes.push(`{ path: "/", element: <Navigate to="/${models[0].slug}" replace /> },`);
    }
    for (const model of models) {
        const files = router.files(model);
        imports.push(`import ${model.Plural}List from "${relative(files.list)}";`);
        routes.push(`{ path: "/${model.slug}", element: <${model.Plural}List /> },`);
        if (model.pages.create) {
            imports.push(`import Create${model.Singular} from "${relative(files.create)}";`);
            routes.push(`{ path: "/${model.slug}/create", element: <Create${model.Singular} /> },`);
        }
        if (model.pages.detail) {
            imports.push(`import ${model.Singular}Detail from "${relative(files.detail)}";`);
            routes.push(`{ path: "/${model.slug}/:id", element: <${model.Singular}Detail /> },`);
        }
        if (model.pages.edit) {
            imports.push(`import Edit${model.Singular} from "${relative(files.edit)}";`);
            routes.push(`{ path: "/${model.slug}/:id/edit", element: <Edit${model.Singular} /> },`);
        }
    }
    const usesNavigate = routes.some(route => route.includes('<Navigate'));

    return `${HEADER}import ${usesNavigate ? '{ Navigate, type RouteObject }' : '{ type RouteObject }'} from "react-router-dom";
import LayoutWithSidebar from "./LayoutWithSidebar";${login ? `
import LoginPage from "./LoginPage";` : ''}
${imports.join('\n')}

export const dashboardRoutes: RouteObject[] = [${login ? `
    { path: "/login", element: <LoginPage /> },` : ''}
    {
        element: <LayoutWithSidebar />,
        children: [
            ${routes.join('\n            ')}
        ],
    },
];
`;
}

// components/api-gen/theme-toggle.tsx: light/dark switch, remembered in localStorage
function generateThemeToggle(): string {
    return `"use client";
${HEADER}import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "api-gen-theme";

export function ThemeToggle({ label }: { label: string }) {
    // null until the saved or system preference is known, so nothing is written before then
    const [dark, setDark] = useState<boolean | null>(null);

    useEffect(() => {
        let saved: string | null = null;
        try {
            saved = localStorage.getItem(STORAGE_KEY);
        } catch {
            // storage unavailable (private mode): fall back to the system preference
        }
        setDark(saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches);
    }, []);

    useEffect(() => {
        if (dark === null) return;
        document.documentElement.classList.toggle("dark", dark);
        try {
            localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
        } catch {
            // not saved; the choice still applies until reload
        }
    }, [dark]);

    return (
        <Button variant="ghost" size="sm" className="justify-start" aria-label={label} title={label} onClick={() => setDark((value) => !value)}>
            {dark ? "☀" : "☾"} {label}
        </Button>
    );
}
`;
}

// components/api-gen/language-switch.tsx: picks one of ui.locales
function generateLanguageSwitch(): string {
    return `"use client";
${HEADER}import { NativeSelect } from "./fields";
import { LOCALES, getLocale, setLocale, t, type Locale } from "./i18n";

export function LanguageSwitch({ className }: { className?: string }) {
    return (
        <NativeSelect
            aria-label={t("language")}
            className={className ?? "h-8"}
            value={getLocale()}
            onChange={(value) => value && setLocale(value as Locale)}
            placeholder={t("language")}
            options={LOCALES.map((locale) => ({ value: locale.code, label: locale.name }))}
        />
    );
}
`;
}

const pathCode = (path: string[] | null) => (path ? JSON.stringify(path) : 'null');

// components/api-gen/session.ts: the signed-in user's token, permissions and name; refresh and sign-out
function generateSession(login: LoginInfo, bearerSchemes: string[]): string {
    const register =
        bearerSchemes.length > 0
            ? bearerSchemes.map(name => `setCredentials(${JSON.stringify(name)}, getToken);`).join('\n')
            : 'setAuthTokenGetter(getToken);';
    const { logout, refresh } = login;
    const apiModules = new Map<string, string>();
    const apiAlias = (model: Model) => {
        if (!apiModules.has(model.name)) apiModules.set(model.name, `${model.name}Api`);
        return apiModules.get(model.name)!;
    };
    const logoutCall = logout ? `${apiAlias(logout.model)}.${logout.op.functionName}(${logout.op.body ? 'undefined' : ''})` : null;
    const refreshCall = refresh
        ? `${apiAlias(refresh.model)}.${refresh.op.functionName}({ ${JSON.stringify(refresh.field)}: refreshToken } as Parameters<typeof ${apiAlias(refresh.model)}.${refresh.op.functionName}>[0])`
        : null;

    return `${HEADER}import instance${bearerSchemes.length > 0 ? '' : ', { setAuthTokenGetter }'} from "@/utils/api";${bearerSchemes.length > 0 ? `
import { setCredentials } from "@/utils/auth";` : ''}${[...apiModules].map(([name, alias]) => `
import * as ${alias} from "@/api/${name}";`).join('')}${refresh ? `
import { readPath } from "./fields";` : ''}

const TOKEN_KEY = "api-gen-token";
const REFRESH_TOKEN_KEY = "api-gen-refresh-token";
const PERMISSIONS_KEY = "api-gen-permissions";
const USER_KEY = "api-gen-user";
const LOGIN_URL = "/login";

function read(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function write(key: string, value: string | null | undefined) {
    try {
        if (value === null || value === undefined) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
    } catch {
        // storage unavailable (private mode): the user will have to sign in again
    }
}

export const getToken = (): string | null => read(TOKEN_KEY);
export const setToken = (token: string) => write(TOKEN_KEY, token);
export const getRefreshToken = (): string | null => read(REFRESH_TOKEN_KEY);
export const isSignedIn = () => !!getToken();

/** Permission names from a sign-in response or a token: ["users.read"], [{ name: "admin" }] or "read write" */
export function toPermissions(value: unknown): string[] | null {
    if (typeof value === "string") return value.split(/[\\s,]+/).filter(Boolean);
    if (!Array.isArray(value)) return null;
    return value
        .map((item) => {
            if (item && typeof item === "object") {
                const record = item as Record<string, unknown>;
                return String(record.name ?? record.code ?? record.key ?? record.slug ?? record.id ?? "");
            }
            return String(item);
        })
        .filter(Boolean);
}

/** Remember what signing in returned */
export function startSession({
    token,
    refreshToken,
    permissions,
    userName,
}: {
    token: string;
    refreshToken?: unknown;
    permissions?: unknown;
    userName?: unknown;
}) {
    setToken(token);
    write(REFRESH_TOKEN_KEY, typeof refreshToken === "string" && refreshToken ? refreshToken : null);
    const list = toPermissions(permissions);
    write(PERMISSIONS_KEY, list ? JSON.stringify(list) : null);
    write(USER_KEY, typeof userName === "string" && userName ? userName : null);
}

export function clearToken() {
    [TOKEN_KEY, REFRESH_TOKEN_KEY, PERMISSIONS_KEY, USER_KEY].forEach((key) => write(key, null));
}

// The token's claims when it is a JWT
function claims(): Record<string, unknown> | null {
    const payload = getToken()?.split(".")[1];
    if (!payload) return null;
    try {
        const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "="));
        const decoded = JSON.parse(decodeURIComponent(Array.from(json, (char) => \`%\${char.charCodeAt(0).toString(16).padStart(2, "0")}\`).join("")));
        return decoded && typeof decoded === "object" ? decoded : null;
    } catch {
        return null;
    }
}

/** The signed-in user's name or email, from the sign-in response or the token */
export function getUserName(): string | null {
    const saved = read(USER_KEY);
    if (saved) return saved;
    const token = claims();
    const name = token?.name ?? token?.preferred_username ?? token?.email ?? token?.username;
    return typeof name === "string" ? name : null;
}

/** What the signed-in user may do, or null when neither the sign-in response nor the token says */
export function getPermissions(): string[] | null {
    const saved = read(PERMISSIONS_KEY);
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch {
            // fall through to the token
        }
    }
    const token = claims();
    return toPermissions(token?.permissions ?? token?.scopes ?? token?.authorities ?? token?.roles ?? token?.scope ?? token?.scp);
}

/**
 * Whether the signed-in user holds any of these permissions ("*" holds them all).
 * Without known permissions everything shows and the API decides.
 */
export function can(required?: readonly string[]): boolean {
    if (!required || required.length === 0) return true;
    const granted = getPermissions();
    if (!granted) return true;
    return granted.includes("*") || required.some((permission) => granted.includes(permission));
}

/** Sign out${logout ? ' on the server, then' : ''} in this browser */
export async function signOut() {${logoutCall ? `
    if (getToken()) {
        try {
            await ${logoutCall};
        } catch {
            // already signed out on the server, or offline: sign out here anyway
        }
    }` : ''}
    clearToken();
}

${register}
${refresh ? `
let refreshing: Promise<string | null> | null = null;

// Trade the refresh token for a new access token; concurrent requests share one refresh
function refreshAccessToken(): Promise<string | null> {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return Promise.resolve(null);
    refreshing ??= (async () => {
        try {
            const result = await ${refreshCall};
            const token = readPath(result, ${JSON.stringify(refresh.tokenPath)});
            if (typeof token !== "string" || !token) return null;
            setToken(token);${refresh.refreshTokenPath ? `
            const next = readPath(result, ${JSON.stringify(refresh.refreshTokenPath)});
            if (typeof next === "string" && next) write(REFRESH_TOKEN_KEY, next);` : ''}
            return token;
        } catch {
            return null;
        } finally {
            refreshing = null;
        }
    })();
    return refreshing;
}
` : ''}
// When the API rejects the token (expired, revoked)${refresh ? ', refresh it once and retry; failing that' : ''}, sign out and go to the sign-in page
instance.interceptors.response.use(undefined, async (error) => {
    if (error?.response?.status === 401 && getToken()) {${refresh ? `
        const config = error.config;
        if (config && !config._apiGenRetry && !String(config.url ?? "").endsWith(${JSON.stringify(refresh.op.path)})) {
            const token = await refreshAccessToken();
            if (token) {
                config._apiGenRetry = true;
                config.headers.Authorization = \`Bearer \${token}\`;
                return instance(config);
            }
        }` : ''}
        clearToken();
        window.location.assign(LOGIN_URL);
    }
    return Promise.reject(error);
});
`;
}

function generateLoginPage(login: LoginInfo, router: Router, ui: Ui, homeHref: string): string {
    const fn = login.op.functionName;
    const goHome = router.directive ? `router.replace(${JSON.stringify(homeHref)})` : `navigate(${JSON.stringify(homeHref)}, { replace: true })`;
    const multi = isMultiLocale(ui);
    const body = `
export default function LoginPage() {
    ${router.directive ? 'const router = useRouter();' : 'const navigate = useNavigate();'}
    const signIn = useMutation({
        mutationFn: (values: Parameters<typeof api.${fn}>[0]) => api.${fn}(values),
        onSuccess: (result) => {
            const token = readPath(result, ${JSON.stringify(login.tokenPath)});
            if (typeof token !== "string" || !token) {
                toast.error(${ui.t('signInFailed')});
                return;
            }
            startSession({
                token,${login.refreshTokenPath ? `
                refreshToken: readPath(result, ${pathCode(login.refreshTokenPath)}),` : ''}${login.permissionsPath ? `
                permissions: readPath(result, ${pathCode(login.permissionsPath)}),` : ''}${login.userNamePath ? `
                userName: readPath(result, ${pathCode(login.userNamePath)}),` : ''}
            });
            ${goHome};
        },
        onError: (error: Error) => {
            toast.error(${ui.t('signInFailed')}, { description: error.message });
        },
    });

    return (
        <div className="api-gen-dashboard flex min-h-screen items-center justify-center p-4">
            <Card className="w-full max-w-sm">
                <CardHeader>
                    <CardTitle>{${ui.t('signInTitle', { title: ui.labelValue(ui.title) })}}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <LoginForm
                        onSubmit={(values) => signIn.mutate(values as Parameters<typeof api.${fn}>[0])}
                        isSubmitting={signIn.isPending}
                        error={signIn.error}
                        submitLabel={${ui.t('signIn')}}
                    />${multi ? `
                    <LanguageSwitch />` : ''}
                </CardContent>
            </Card>
            <Toaster />
        </div>
    );
}
`;
    return `${router.directive}${HEADER}import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
${router.directive ? 'import { useRouter } from "next/navigation";' : 'import { useNavigate } from "react-router-dom";'}
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Toaster } from "@/components/ui/sonner";
import { readPath } from "${FIELDS_IMPORT}";${multi ? `
import { LanguageSwitch } from "@/components/api-gen/language-switch";` : ''}
import { startSession } from "${SESSION_IMPORT}";
import * as api from "@/api/${login.model.name}";
import { LoginForm } from "${router.loginFiles.formImport}";${i18nImport(ui, body)}
${body}`;
}

export interface DashboardOptions {
    router?: RouterName;
    templates?: Templates | null;
    ui: Ui;
    /** The API's sign-in endpoint: generates a login page, token storage and a guard on the dashboard */
    login?: LoginInfo | null;
    /** Security schemes the signed-in token is sent with (bearer, OAuth2, OpenID Connect) */
    bearerSchemes?: string[];
}

/**
 * CRUD dashboard pages for every model with a list operation.
 * router: "react-router" (pages/ + routes.tsx) or "next" (App Router, app/(dashboard)/)
 * templates: optional overrides, see applyTemplate
 */
export function generateCRUDDashboard(
    models: Model[],
    { router: routerName = 'react-router', templates, ui, login = null, bearerSchemes = [] }: DashboardOptions
): { files: FileMap; warnings: string[]; dependencies: string[] } {
    const router = ROUTERS[routerName];
    if (!router) {
        throw new Error(`Unknown router "${routerName}". Use one of: ${Object.keys(ROUTERS).join(', ')}`);
    }

    const files: FileMap = {};
    const warnings: string[] = [];
    const render = (kind: TemplateKind, defaultContent: string, model: Model | null) => applyTemplate(templates, kind, defaultContent, { model, router: routerName });

    // Which resources get pages
    const dashboardModels: DashboardModel[] = [];
    for (const model of models) {
        const { list, retrieve, create, update } = model.crud;
        if (isHidden(model, ui)) continue;
        if (!list) {
            if (login?.model !== model) warnings.push(`Skipping dashboard for "${model.key}": no list operation (GET ${model.basePath}).`);
            continue;
        }
        if (tableColumns(model).length === 0) {
            warnings.push(`Skipping dashboard for "${model.key}": its list response has no fields to show.`);
            continue;
        }
        dashboardModels.push({ ...model, pages: { create: !!create, edit: !!(retrieve && update), detail: !!retrieve } });
    }
    const context: PageContext = { router, ui, models, dashboardModels, auth: !!login };

    for (const model of dashboardModels) {
        const { pages } = model;
        const paths = router.files(model);
        const forms: FormSpec[] = [
            ...(pages.create ? [{ component: `${model.Singular}CreateForm`, fields: model.formFields }] : []),
            ...(pages.edit ? [{ component: `${model.Singular}EditForm`, fields: model.editFields }] : []),
            ...model.actions.filter(action => action.fields && !action.hidden).map(action => ({ component: `${action.Name}Form`, fields: action.fields as Field[] })),
        ];

        files[paths.list] = render('listPage', generateListPage(model, context, paths.listFormImport), model);
        if (forms.length > 0) files[paths.form] = render('form', generateFormFile(forms, router, ui, models), model);
        if (pages.create) files[paths.create] = render('createPage', generateCreatePage(model, context, paths.createFormImport), model);
        if (pages.detail) files[paths.detail] = render('detailPage', generateDetailPage(model, context), model);
        if (pages.edit) files[paths.edit] = render('editPage', generateEditPage(model, context, paths.editFormImport), model);
        if (pages.edit && editable(model.editFields).length === 0) {
            warnings.push(`The edit form for "${model.key}" has no fields: its update request body has no editable properties.`);
        }
    }

    const icons = dashboardModels.some(model => model.icon);
    if (dashboardModels.length > 0) {
        const themeCss = generateThemeCss(ui.theme);
        const homeHref = ui.home ? router.home.href : null;
        const layout: LayoutOptions = { ui, hasTheme: !!themeCss, login, context, homeHref };
        files['components/api-gen/fields.tsx'] = generateFieldsComponent(ui);
        files['components/api-gen/form.tsx'] = generateFormPrimitives();
        files['components/api-gen/dialog.tsx'] = generateDialogComponent(ui);
        if (ui.darkModeToggle) files['components/api-gen/theme-toggle.tsx'] = generateThemeToggle();
        if (themeCss) files['components/api-gen/theme.css'] = themeCss;
        if (isMultiLocale(ui)) {
            files['components/api-gen/i18n.ts'] = generateI18n(ui);
            files['components/api-gen/language-switch.tsx'] = generateLanguageSwitch();
        }
        if (ui.home) files[router.home.file] = render('homePage', generateHomePage(context), null);
        if (login) {
            files['components/api-gen/session.ts'] = generateSession(login, bearerSchemes);
            files[router.loginFiles.form] = generateFormFile([{ component: 'LoginForm', fields: login.fields }], router, ui, models);
            files[router.loginFiles.page] = render('loginPage', generateLoginPage(login, router, ui, homeHref ?? `/${dashboardModels[0].slug}`), null);
        }
        if (routerName === 'next') {
            files['app/(dashboard)/layout.tsx'] = render('layout', generateNextLayout(dashboardModels, layout), null);
        } else {
            files['pages/LayoutWithSidebar.tsx'] = render('layout', generateReactRouterLayout(dashboardModels, layout), null);
            files['pages/routes.tsx'] = render('routes', generateRoutes(dashboardModels, router, !!login, ui.home), null);
        }
    }

    return { files, warnings, dependencies: dashboardDependencies(routerName, { icons }) };
}
