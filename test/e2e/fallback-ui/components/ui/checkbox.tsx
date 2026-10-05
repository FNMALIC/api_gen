// Stand-in for the shadcn/ui component of the same name (same exports, props and new-york classes), used by the
// end-to-end test only when the shadcn registry cannot be reached (E2E_UI=fallback).
import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { cn } from "@/lib/utils"
export function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root data-slot="checkbox" className={cn("peer border-input size-4 shrink-0 rounded-[4px] border shadow-xs outline-none data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:border-primary", className)} {...props}>
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}
