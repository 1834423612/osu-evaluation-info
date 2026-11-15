"use client";
import { SelectionCheckbox } from "./selection-checkbox";
import {
  itemKey,
  itemTitle,
  itemContext,
  itemKindName,
  type ExchangeItem,
} from "@/lib/saved/exchange";
import { text, type Locale } from "@/lib/i18n";
import styles from "@/components/ui/workspace.module.css";
import layout from "./collections.module.css";
export function SavedItemPicker({
  items,
  picked,
  onChange,
  locale,
  disabled = false,
}: {
  items: ExchangeItem[];
  picked: Set<string>;
  onChange: (value: Set<string>) => void;
  locale: Locale;
  disabled?: boolean;
}) {
  return (
    <div className={layout.itemPicker}>
      <div className={layout.pickerHeading}>
        <SelectionCheckbox
          keys={items.map(itemKey)}
          selected={picked}
          onChange={onChange}
          label={text(locale, "Select all", "全选")}
          disabled={disabled}
        />
        <span role="status">
          {picked.size} / {items.length} {text(locale, "selected", "项已选")}
        </span>
      </div>
      <ul className={layout.pickerList}>
        {items.map((item) => {
          const key = itemKey(item);
          return (
            <li key={key}>
              <label className={styles.pick}>
                <input
                  className={styles.checkbox}
                  type="checkbox"
                  disabled={disabled}
                  checked={picked.has(key)}
                  onChange={() => {
                    const next = new Set(picked);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    onChange(next);
                  }}
                />
                <span>
                  <strong>{itemTitle(item)}</strong>
                  <small>
                    {itemKindName(item.kind, locale)} · {itemContext(item)}
                  </small>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
