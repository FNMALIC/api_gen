// Minimal stand-in for the shadcn/ui component of the same name (same exports and props), used by the
// end-to-end test only when the shadcn registry cannot be reached (E2E_UI=fallback).
import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { Slot } from "@radix-ui/react-slot"
import { Controller, FormProvider, useFormContext, useFormState, type ControllerProps, type FieldPath, type FieldValues } from "react-hook-form"
import { Label } from "@/components/ui/label"
const Form = FormProvider
type FormFieldContextValue<TFieldValues extends FieldValues = FieldValues, TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>> = { name: TName }
const FormFieldContext = React.createContext<FormFieldContextValue>({} as FormFieldContextValue)
const FormField = <TFieldValues extends FieldValues = FieldValues, TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>>({ ...props }: ControllerProps<TFieldValues, TName>) => (
  <FormFieldContext.Provider value={{ name: props.name }}><Controller {...props} /></FormFieldContext.Provider>
)
const useFormField = () => {
  const fieldContext = React.useContext(FormFieldContext)
  const { getFieldState } = useFormContext()
  const formState = useFormState({ name: fieldContext.name })
  return { name: fieldContext.name, ...getFieldState(fieldContext.name, formState) }
}
function FormItem(props: React.ComponentProps<"div">) { return <div {...props} /> }
function FormLabel(props: React.ComponentProps<typeof LabelPrimitive.Root>) { return <Label {...props} /> }
function FormControl(props: React.ComponentProps<typeof Slot>) { return <Slot {...props} /> }
function FormDescription(props: React.ComponentProps<"p">) { return <p {...props} /> }
function FormMessage(props: React.ComponentProps<"p">) { const { error } = useFormField(); return <p {...props}>{error ? String(error.message ?? "") : props.children}</p> }
export { useFormField, Form, FormItem, FormLabel, FormControl, FormDescription, FormMessage, FormField }
