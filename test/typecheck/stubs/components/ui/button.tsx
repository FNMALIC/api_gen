import type { ComponentProps } from "react";

type Variant = "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
type Size = "default" | "sm" | "lg" | "icon";

export function buttonVariants(_options?: { variant?: Variant | null; size?: Size | null; className?: string }) {
    return "";
}

export function Button(_props: ComponentProps<"button"> & { variant?: Variant; size?: Size; asChild?: boolean }) {
    return null;
}
