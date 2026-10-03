// Minimal stand-in for the shadcn/ui component of the same name (same exports and props), used by the
// end-to-end test only when the shadcn registry cannot be reached (E2E_UI=fallback).
import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
export function Label(props: React.ComponentProps<typeof LabelPrimitive.Root>) { return <LabelPrimitive.Root {...props} /> }
