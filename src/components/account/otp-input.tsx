"use client";
import { useId, useRef, useEffect } from "react";
import styles from "./account.module.css";
export function OtpInput({
  value,
  onChange,
  label,
  disabled = false,
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus && !disabled) input.current?.focus();
  }, [autoFocus, disabled]);
  return (
    <div className={styles.otpField}>
      <label htmlFor={id}>{label}</label>
      <div className={styles.otp} data-complete={value.length === 6}>
        <input
          ref={input}
          id={id}
          aria-label={label}
          value={value}
          onChange={(e) =>
            onChange(e.target.value.replace(/\D/g, "").slice(0, 6))
          }
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          disabled={disabled}
        />
        <div aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} data-active={i === Math.min(value.length, 5)}>
              {value[i] ?? ""}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
