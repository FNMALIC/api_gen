// Stand-in for the shadcn/ui component of the same name (same exports, props and new-york classes), used by the
// end-to-end test only when the shadcn registry cannot be reached (E2E_UI=fallback).
import * as React from "react"
import { cn } from "@/lib/utils"
export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn("border-input placeholder:text-muted-foreground flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none md:text-sm dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:border-destructive", className)} {...props} />
}
