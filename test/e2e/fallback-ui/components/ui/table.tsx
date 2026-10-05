// Stand-in for the shadcn/ui component of the same name (same exports, props and new-york classes), used by the
// end-to-end test only when the shadcn registry cannot be reached (E2E_UI=fallback).
import * as React from "react"
import { cn } from "@/lib/utils"
export function Table({ className, ...p }: React.ComponentProps<"table">) {
  return <div data-slot="table-container" className="relative w-full overflow-x-auto"><table data-slot="table" className={cn("w-full caption-bottom text-sm", className)} {...p} /></div>
}
export function TableHeader({ className, ...p }: React.ComponentProps<"thead">) { return <thead className={cn("[&_tr]:border-b", className)} {...p} /> }
export function TableBody({ className, ...p }: React.ComponentProps<"tbody">) { return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...p} /> }
export function TableRow({ className, ...p }: React.ComponentProps<"tr">) { return <tr className={cn("hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors", className)} {...p} /> }
export function TableHead({ className, ...p }: React.ComponentProps<"th">) { return <th className={cn("text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap", className)} {...p} /> }
export function TableCell({ className, ...p }: React.ComponentProps<"td">) { return <td className={cn("p-2 align-middle whitespace-nowrap", className)} {...p} /> }
