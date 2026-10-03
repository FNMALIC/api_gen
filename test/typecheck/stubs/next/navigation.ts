export function useRouter(): { push(href: string): void; replace(href: string): void; back(): void } {
    throw new Error("stub");
}
export function useParams<T extends Record<string, string | string[]> = Record<string, string | string[]>>(): T {
    throw new Error("stub");
}
export function usePathname(): string {
    throw new Error("stub");
}
