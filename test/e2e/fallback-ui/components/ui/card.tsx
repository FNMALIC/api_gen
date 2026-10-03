// Minimal stand-in for the shadcn/ui component of the same name (same exports and props), used by the
// end-to-end test only when the shadcn registry cannot be reached (E2E_UI=fallback).
import * as React from "react"
const mk = () => (props: React.ComponentProps<"div">) => <div {...props} />
export const Card = mk(), CardHeader = mk(), CardTitle = mk(), CardDescription = mk(), CardContent = mk(), CardFooter = mk()
