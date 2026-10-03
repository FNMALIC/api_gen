// Same exports and generics as shadcn/ui's form.tsx
import type { ComponentProps, ReactNode } from "react";
import { Controller, FormProvider, type ControllerProps, type FieldPath, type FieldValues } from "react-hook-form";

export const Form = FormProvider;

export const FormField = <
    TFieldValues extends FieldValues = FieldValues,
    TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>(
    props: ControllerProps<TFieldValues, TName>,
) => <Controller {...props} />;

export function FormItem(_props: ComponentProps<"div">) { return null; }
export function FormLabel(_props: ComponentProps<"label">) { return null; }
export function FormControl(_props: { children?: ReactNode }) { return null; }
export function FormDescription(_props: ComponentProps<"p">) { return null; }
export function FormMessage(_props: ComponentProps<"p">) { return null; }
