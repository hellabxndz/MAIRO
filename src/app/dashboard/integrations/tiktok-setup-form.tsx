"use client";

import { useActionState, useState } from "react";
import { requestTikTokSetupAction } from "@/lib/actions/tiktok-actions";
import { inputClass, primaryButtonClass } from "@/components/ui";

// What MAIRO needs in order to build somebody's TikTok for them.
//
// Kept behind a single button until they want it, because a business owner who
// already has a TikTok should not have to scroll past a nine-field form to
// reach the connect button. Everything but the name and an email is optional —
// the point of the feature is that they don't have to know what a Business
// Center is, and a required "category" field would put the burden straight
// back on them.

export function TikTokSetupForm() {
  const [state, formAction, pending] = useActionState(requestTikTokSetupAction, undefined);
  const [open, setOpen] = useState(false);

  if (state?.success) {
    return (
      <div className="mt-5 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] p-4">
        <p className="text-sm text-emerald-300">{state.success}</p>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="mt-5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={primaryButtonClass}
        >
          Set my TikTok up for me
        </button>
        <p className="mt-2.5 text-xs text-neutral-500">
          Takes two minutes to ask for. MAIRO does the rest and emails you when it&rsquo;s yours.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-5 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="displayName"
          label="What should the account be called?"
          placeholder="e.g. Marlow &amp; Co Bakery"
          required
        />
        <Field
          name="preferredHandle"
          label="Handle you'd like"
          placeholder="marlowbakery"
          hint="Optional. Someone may already have it — we'll tell you."
        />
        <Field
          name="contactEmail"
          label="Email we can reach you on"
          type="email"
          placeholder="you@yourbusiness.com"
          required
        />
        <Field
          name="contactPhone"
          label="Mobile for TikTok's verification code"
          placeholder="Optional, but it speeds things up"
        />
        <Field
          name="alternateHandles"
          label="Backup handles"
          placeholder="marlowandco, marlowbakeryuk"
          hint="Optional. In case the first one is taken."
        />
        <Field
          name="category"
          label="What kind of business is it?"
          placeholder="Bakery, plumber, gym…"
        />
        <Field
          name="websiteUrl"
          label="Website"
          placeholder="https://…"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-neutral-400" htmlFor="tiktok-bio">
          Bio, if you have one in mind
        </label>
        <input
          id="tiktok-bio"
          name="bio"
          className={inputClass}
          placeholder="Optional — MAIRO will write one if you'd rather"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-neutral-400" htmlFor="tiktok-notes">
          Anything else we should know?
        </label>
        <input
          id="tiktok-notes"
          name="customerNotes"
          className={inputClass}
          placeholder="Optional"
        />
      </div>

      {state?.error && <p className="text-sm text-red-400">{state.error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Sending…" : "Ask MAIRO to set it up"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-neutral-500 underline underline-offset-4 transition hover:text-white"
        >
          Cancel
        </button>
      </div>

      <p className="text-xs leading-relaxed text-neutral-500">
        The account is yours, not MAIRO&rsquo;s. We hand you the login when it&rsquo;s
        ready and never keep a copy of the password.
      </p>
    </form>
  );
}

function Field({
  name,
  label,
  placeholder,
  hint,
  type = "text",
  required,
}: {
  name: string;
  label: string;
  placeholder?: string;
  hint?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-neutral-400" htmlFor={`tiktok-${name}`}>
        {label}
      </label>
      <input
        id={`tiktok-${name}`}
        name={name}
        type={type}
        required={required}
        className={inputClass}
        placeholder={placeholder}
      />
      {hint && <p className="text-xs text-neutral-600">{hint}</p>}
    </div>
  );
}
