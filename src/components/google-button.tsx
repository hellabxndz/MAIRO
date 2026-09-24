"use client";

import { useState, type MouseEvent } from "react";
import { useFormStatus } from "react-dom";
import { googleSignInAction } from "@/lib/actions/auth-actions";

// "Continue with Google", placed inside an existing sign-in or sign-up form.
// It submits that same form to googleSignInAction instead of the form's own
// action, skipping the browser's required-field checks (Google supplies the
// email, and there is no password) — so the business or studio name typed
// above travels with it, along with the sign-in page's callbackUrl.
//
// On a sign-up form the one field it does need is the name: the account is
// created with it and it can't be changed later, so the button refuses to set
// off to Google until it's filled in.

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="h-4 w-4 shrink-0">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export function GoogleButton({
  mode,
  nameField,
  nameLabel,
}: {
  mode: "signin" | "client" | "freelancer";
  /** The input the new account's name comes from, on a sign-up form. */
  nameField?: "businessName" | "studioName";
  /** How that field is referred to in the reminder, e.g. "business name". */
  nameLabel?: string;
}) {
  const { pending } = useFormStatus();
  const [clicked, setClicked] = useState(false);
  const [missingName, setMissingName] = useState(false);

  function check(e: MouseEvent<HTMLButtonElement>) {
    const form = e.currentTarget.form;
    if (nameField && form) {
      const input = form.elements.namedItem(nameField);
      if (input instanceof HTMLInputElement && !input.value.trim()) {
        e.preventDefault();
        setMissingName(true);
        input.focus();
        return;
      }
    }
    setMissingName(false);
    setClicked(true);
  }

  return (
    <div className="space-y-2">
      <button
        type="submit"
        formAction={googleSignInAction.bind(null, mode)}
        formNoValidate
        onClick={check}
        disabled={pending}
        className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-white/10 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100 disabled:opacity-60"
      >
        <GoogleMark />
        {pending && clicked ? "Opening Google…" : "Continue with Google"}
      </button>
      {missingName && (
        <p className="text-sm text-red-400">
          Add your {nameLabel ?? "name"} first — it&rsquo;s the one thing Google doesn&rsquo;t tell us.
        </p>
      )}
    </div>
  );
}

export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-xs text-neutral-500" aria-hidden="true">
      <span className="h-px flex-1 bg-white/10" />
      or
      <span className="h-px flex-1 bg-white/10" />
    </div>
  );
}
