// Minimal stand-in for the shadcn/ui component of the same name (same exports and props), used by the
// end-to-end test only when the shadcn registry cannot be reached (E2E_UI=fallback).
import * as React from "react"
import * as A from "@radix-ui/react-alert-dialog"
export function AlertDialog(p: React.ComponentProps<typeof A.Root>) { return <A.Root {...p} /> }
export function AlertDialogTrigger(p: React.ComponentProps<typeof A.Trigger>) { return <A.Trigger {...p} /> }
export function AlertDialogContent(p: React.ComponentProps<typeof A.Content>) { return <A.Portal><A.Overlay /><A.Content {...p} /></A.Portal> }
export function AlertDialogHeader(p: React.ComponentProps<"div">) { return <div {...p} /> }
export function AlertDialogFooter(p: React.ComponentProps<"div">) { return <div {...p} /> }
export function AlertDialogTitle(p: React.ComponentProps<typeof A.Title>) { return <A.Title {...p} /> }
export function AlertDialogDescription(p: React.ComponentProps<typeof A.Description>) { return <A.Description {...p} /> }
export function AlertDialogAction(p: React.ComponentProps<typeof A.Action>) { return <A.Action {...p} /> }
export function AlertDialogCancel(p: React.ComponentProps<typeof A.Cancel>) { return <A.Cancel {...p} /> }
