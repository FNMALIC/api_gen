// Minimal stand-in for the shadcn/ui component of the same name (same exports and props), used by the
// end-to-end test only when the shadcn registry cannot be reached (E2E_UI=fallback).
import { Toaster as Sonner, type ToasterProps } from "sonner"
export function Toaster(props: ToasterProps) { return <Sonner {...props} /> }
