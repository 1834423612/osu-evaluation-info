"use client";
import { forwardRef, type InputHTMLAttributes } from "react";
export type SearchFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  onValueChange?: (value: string) => void;
};
/** One native search control across domains. Existing containers own icon/layout. */
export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(
  function SearchField(
    { onValueChange, onChange, type = "search", ...props },
    ref,
  ) {
    return (
      <input
        ref={ref}
        type={type}
        maxLength={200}
        enterKeyHint="search"
        autoCapitalize="none"
        spellCheck={false}
        {...props}
        data-search-field
        onChange={(event) => {
          onValueChange?.(event.currentTarget.value);
          onChange?.(event);
        }}
      />
    );
  },
);
