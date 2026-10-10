"use client";

import { useState } from "react";
import { PASSWORD_MIN, passwordProblem } from "@/lib/auth-rules/password";

// The inputs on the sign-in and sign-up forms.
//
// Each label is tied to its input, an error names the input it is about (and
// the screen reader hears it), and the text is 16px on phones — anything
// smaller and iOS zooms the page in the moment you tap the field.

export const authInputClass =
  "block min-h-[44px] w-full rounded-lg border bg-field px-3 py-2 text-base text-white placeholder-neutral-500 outline-none transition focus:border-violet-400/60 focus:ring-2 focus:ring-violet-400/20 sm:text-sm";

export function AuthField({
  name,
  label,
  type = "text",
  autoComplete,
  placeholder,
  defaultValue,
  error,
  hint,
  inputMode,
}: {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  defaultValue?: string;
  /** Shown under the field, and marks it invalid, when the last submission failed on it. */
  error?: string | null;
  hint?: string;
  inputMode?: "email" | "text";
}) {
  const id = `field-${name}`;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[13px] font-medium text-neutral-300">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required
        autoComplete={autoComplete}
        inputMode={inputMode}
        placeholder={placeholder}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`${authInputClass} ${error ? "border-red-400/70" : "border-white/10"}`}
      />
      {error ? (
        <p id={`${id}-error`} className="text-[13px] text-red-400">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[12.5px] text-neutral-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A password box with a Show button, and — when it's for a new password —
 * the rule checked as you type, the same one the server applies.
 */
export function PasswordField({
  label = "Password",
  autoComplete,
  isNew = false,
  error,
}: {
  label?: string;
  autoComplete: "new-password" | "current-password";
  isNew?: boolean;
  error?: string | null;
}) {
  const [shown, setShown] = useState(false);
  const [value, setValue] = useState("");
  const id = "field-password";
  const live = isNew && value ? passwordProblem(value) : null;
  const message = error ?? live;
  const ok = isNew && value.length > 0 && !live && !error;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[13px] font-medium text-neutral-300">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name="password"
          type={shown ? "text" : "password"}
          required
          minLength={isNew ? PASSWORD_MIN : undefined}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-help`}
          className={`${authInputClass} pr-16 ${error ? "border-red-400/70" : "border-white/10"}`}
        />
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          aria-pressed={shown}
          aria-controls={id}
          className="absolute inset-y-0 right-1.5 my-auto h-8 rounded-md px-2.5 text-[12.5px] font-medium text-neutral-400 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500"
        >
          {shown ? "Hide" : "Show"}
        </button>
      </div>
      <p id={`${id}-help`} aria-live="polite" className={`text-[12.5px] ${error ? "text-red-400" : ok ? "text-emerald-400" : "text-neutral-500"}`}>
        {message ?? (ok ? "Good password." : isNew ? `At least ${PASSWORD_MIN} characters. A short phrase is easy to remember and hard to guess.` : "")}
      </p>
    </div>
  );
}
