// Stand-in for the shadcn/ui component of the same name (same exports, props and new-york classes), used by the
// end-to-end test only when the shadcn registry cannot be reached (E2E_UI=fallback).
import * as React from "react"
import { cn } from "@/lib/utils"
const mk = (slot: string, base: string) => ({ className, ...props }: React.ComponentProps<"div">) => <div data-slot={slot} className={cn(base, className)} {...props} />
export const Card = mk("card", "bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm")
export const CardHeader = mk("card-header", "grid auto-rows-min items-start gap-1.5 px-6")
export const CardTitle = mk("card-title", "leading-none font-semibold")
export const CardDescription = mk("card-description", "text-muted-foreground text-sm")
export const CardContent = mk("card-content", "px-6")
export const CardFooter = mk("card-footer", "flex items-center px-6")
