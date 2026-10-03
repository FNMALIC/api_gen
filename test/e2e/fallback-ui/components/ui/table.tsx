// Minimal stand-in for the shadcn/ui component of the same name (same exports and props), used by the
// end-to-end test only when the shadcn registry cannot be reached (E2E_UI=fallback).
import * as React from "react"
export function Table(p: React.ComponentProps<"table">) { return <table {...p} /> }
export function TableHeader(p: React.ComponentProps<"thead">) { return <thead {...p} /> }
export function TableBody(p: React.ComponentProps<"tbody">) { return <tbody {...p} /> }
export function TableRow(p: React.ComponentProps<"tr">) { return <tr {...p} /> }
export function TableHead(p: React.ComponentProps<"th">) { return <th {...p} /> }
export function TableCell(p: React.ComponentProps<"td">) { return <td {...p} /> }
