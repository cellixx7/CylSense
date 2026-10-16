import type { InputHTMLAttributes, ReactNode } from "react";
import { AlertCircle } from "./icons";

export function Field({
  id,
  label,
  hint,
  aside,
  ...input
}: { id: string; label: string; hint?: string; aside?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {aside}
      </div>
      <input
        id={id}
        name={id}
        aria-describedby={hint ? `${id}-dica` : undefined}
        className="h-11 rounded-cyl border border-input bg-bg px-3 text-sm placeholder:text-muted"
        {...input}
      />
      {hint && (
        <span id={`${id}-dica`} className="text-xs text-muted">
          {hint}
        </span>
      )}
    </div>
  );
}

export function FormError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex gap-2.5 rounded-cyl border border-danger p-3 text-sm">
      <AlertCircle size={18} className="mt-px flex-none text-danger" />
      {children}
    </p>
  );
}

export const submitClass =
  "flex h-12 items-center justify-center rounded-cyl bg-accent font-semibold text-on-accent disabled:cursor-wait disabled:opacity-70";
