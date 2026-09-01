"use client";

import { useState } from "react";
import { deleteAccountAction } from "@/lib/actions/account-actions";

// Deletion is irreversible, so it takes two deliberate steps rather than one
// click that can be hit by accident.
export function DeleteAccountButton() {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-lg border border-red-500/40 px-5 py-2.5 text-sm text-red-200 transition hover:bg-red-500 hover:text-white"
      >
        Delete my account
      </button>
    );
  }

  return (
    <form
      action={deleteAccountAction}
      onSubmit={() => setPending(true)}
      className="flex flex-wrap items-center gap-3"
    >
      <span className="text-sm text-neutral-300">
        This can&apos;t be undone. Are you sure?
      </span>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-red-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-red-400 disabled:opacity-60"
      >
        {pending ? "Deleting..." : "Yes, delete everything"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={pending}
        className="text-sm text-neutral-400 underline underline-offset-4 transition hover:text-white"
      >
        Cancel
      </button>
    </form>
  );
}
