import type { ComponentProps } from "react";

export default function Link(_props: Omit<ComponentProps<"a">, "href"> & { href: string }) {
    return null;
}
