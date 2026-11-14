"use client";
import {
  Children,
  isValidElement,
  useState,
  useCallback,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";
import { cn } from "@/lib/utils";
import styles from "./choice-select.module.css";

type Props = Omit<
  ComponentProps<"button">,
  "value" | "defaultValue" | "onChange" | "children"
> & {
  value?: string | number;
  defaultValue?: string | number;
  onValueChange?: (value: string) => void;
  required?: boolean;
  children: ReactNode;
};
/** Shared styled choices with native form submission and Radix keyboard navigation. */
export function ChoiceSelect({
  value,
  defaultValue,
  onValueChange,
  name,
  required,
  disabled,
  children,
  className,
  ...props
}: Props) {
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  const bindTrigger = useCallback(
    (node: HTMLButtonElement | null) =>
      setPortal(node?.closest<HTMLElement>("[data-debug-tools]") ?? null),
    [],
  );
  const options = Children.toArray(children).filter(
    isValidElement<ComponentProps<"option">>,
  );
  return (
    <Select
      key={defaultValue == null ? undefined : String(defaultValue)}
      name={name}
      required={required}
      disabled={disabled}
      value={value == null ? undefined : String(value)}
      defaultValue={defaultValue == null ? undefined : String(defaultValue)}
      onValueChange={onValueChange}
    >
      <SelectTrigger
        {...props}
        disabled={disabled}
        data-choice-select
        className={cn(styles.trigger, className)}
        ref={bindTrigger}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        position="popper"
        align="start"
        portalContainer={portal}
        className={styles.content}
        collisionPadding={10}
      >
        {options.map((option, index) => (
          <SelectItem
            key={option.key ?? index}
            value={String(option.props.value ?? option.props.children)}
            disabled={option.props.disabled}
            data-choice-value={String(
              option.props.value ?? option.props.children,
            )}
          >
            {option.props.children}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
