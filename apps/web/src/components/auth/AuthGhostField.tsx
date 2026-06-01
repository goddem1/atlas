import type { InputHTMLAttributes } from "react";

type Props = {
  label: string;
  value: string;
  error?: string;
  inputClassName?: string;
} & InputHTMLAttributes<HTMLInputElement>;

export function AuthGhostField({ label, value, error, inputClassName, className, ...inputProps }: Props) {
  return (
    <>
      <label
        className={`portfolio-field portfolio-ghost-field auth-ghost-field${value ? " is-floated" : ""}${className ? ` ${className}` : ""}`}
      >
        <span className="portfolio-ghost-label">{label}</span>
        <input
          {...inputProps}
          value={value}
          className={`portfolio-input-ghost${error ? " auth-input-error" : ""}${inputClassName ? ` ${inputClassName}` : ""}`}
          placeholder=" "
        />
      </label>
      {error ? <p className="auth-field-error">{error}</p> : null}
    </>
  );
}
