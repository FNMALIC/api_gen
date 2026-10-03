// Minimal stand-in for the shadcn/ui component of the same name (same exports and props), used by the
// end-to-end test only when the shadcn registry cannot be reached (E2E_UI=fallback).
import * as React from "react"
import * as S from "@radix-ui/react-select"
export function Select(p: React.ComponentProps<typeof S.Root>) { return <S.Root {...p} /> }
export function SelectValue(p: React.ComponentProps<typeof S.Value>) { return <S.Value {...p} /> }
export function SelectTrigger({ size, ...p }: React.ComponentProps<typeof S.Trigger> & { size?: "sm" | "default" }) { return <S.Trigger data-size={size} {...p} /> }
export function SelectContent(p: React.ComponentProps<typeof S.Content>) { return <S.Portal><S.Content position="popper" sideOffset={4} {...p}><S.Viewport>{p.children}</S.Viewport></S.Content></S.Portal> }
export function SelectItem({ children, ...p }: React.ComponentProps<typeof S.Item>) { return <S.Item {...p}><S.ItemText>{children}</S.ItemText></S.Item> }
