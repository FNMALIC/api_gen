import type { ComponentProps, ReactNode } from "react";

export function Select(_props: { value?: string; defaultValue?: string; onValueChange?: (value: string) => void; children?: ReactNode }) { return null; }
export function SelectTrigger(_props: ComponentProps<"button">) { return null; }
export function SelectValue(_props: { placeholder?: ReactNode }) { return null; }
export function SelectContent(_props: { children?: ReactNode }) { return null; }
export function SelectItem(_props: ComponentProps<"div"> & { value: string }) { return null; }
