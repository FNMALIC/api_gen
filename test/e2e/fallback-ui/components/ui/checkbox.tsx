// Minimal stand-in for the shadcn/ui component of the same name (same exports and props), used by the
// end-to-end test only when the shadcn registry cannot be reached (E2E_UI=fallback).
import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
export function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return <CheckboxPrimitive.Root className={["size-4 shrink-0 rounded-[4px] border border-input data-[state=checked]:bg-primary", className].filter(Boolean).join(" ")} {...props} />
}
