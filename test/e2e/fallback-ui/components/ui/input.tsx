// Stand-in for the shadcn/ui component of the same name (same exports, props and new-york classes), used by the
// end-to-end test only when the shadcn registry cannot be reached (E2E_UI=fallback).
import * as React from "react"
import { cn } from "@/lib/utils"
export function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return <input type={type} data-slot="input" className={cn("file:text-foreground placeholder:text-muted-foreground border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium md:text-sm dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:border-destructive aria-invalid:ring-destructive/20", className)} {...props} />
}
