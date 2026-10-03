import type { ComponentProps } from "react";

type CheckedState = boolean | "indeterminate";

export function Checkbox(
    _props: Omit<ComponentProps<"button">, "checked"> & {
        checked?: CheckedState;
        onCheckedChange?: (checked: CheckedState) => void;
    },
) {
    return null;
}
