"use client";
import { useEffect, useRef } from "react";
import { toggleSelection } from "@/lib/saved/selection";
import styles from "@/components/ui/workspace.module.css";
export function SelectionCheckbox({
  keys,
  selected,
  onChange,
  label,
  disabled = false,
}: {
  keys: string[];
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  label: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null),
    count = keys.filter((key) => selected.has(key)).length;
  useEffect(() => {
    if (ref.current)
      ref.current.indeterminate = count > 0 && count < keys.length;
  }, [count, keys.length]);
  return (
    <label className={styles.pick}>
      <input
        ref={ref}
        className={styles.checkbox}
        type="checkbox"
        disabled={disabled || !keys.length}
        checked={keys.length > 0 && count === keys.length}
        onChange={() => onChange(toggleSelection(selected, keys))}
      />
      {label}
    </label>
  );
}
