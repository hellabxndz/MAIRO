"use client";

import { useState, useTransition } from "react";
import { deleteOrganizationAction } from "@/lib/actions/aios-actions";

// Removing a client account, with the friction deliberately left in.
//
// Two steps, because this is the one screen in the app where being slightly
// annoying is the feature. The button does nothing on its own; it opens a box
// that has to be typed into, and the name has to match. Nothing about a list
// of accounts should let a mis-click take one out.
export function DeleteOrganization({
  organizationId,
  name,
  summary,
}: {
  organizationId: string;
  name: string;
  /** What goes with it — shown before anything is typed, not after. */
  summary: string[];
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const matches = typed.trim() === name.trim();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-red-500/30 px-4 py-2 text-xs uppercase tracking-[0.1em] text-red-300 transition hover:border-red-400 hover:bg-red-500/10"
      >
        Delete this account
      </button>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-neutral-300">This removes, permanently:</p>
        <ul className="mt-2 space-y-1 text-sm text-neutral-500">
          {summary.map((line) => (
            <li key={line}>· {line}</li>
          ))}
        </ul>
      </div>

      <div>
        <label
          htmlFor="confirmName"
          className="mb-2 block text-xs uppercase tracking-[0.12em] text-neutral-500"
        >
          Type <span className="text-neutral-200">{name}</span> to confirm
        </label>
        <input
          id="confirmName"
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value);
            setError(null);
          }}
          autoComplete="off"
          className="w-full max-w-sm rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!matches || pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const data = new FormData();
              data.set("confirmName", typed);
              // Refusals come back as a value, not an exception — a thrown
              // error would be stripped in production and show up as a blank
              // "a server error occurred" page instead of the reason.
              const result = await deleteOrganizationAction(organizationId, data);
              if (result?.error) setError(result.error);
            })
          }
          className="rounded-lg bg-red-500/90 px-4 py-2 text-xs uppercase tracking-[0.1em] text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Deleting…" : "Delete permanently"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setTyped("");
            setError(null);
          }}
          className="text-xs uppercase tracking-[0.1em] text-neutral-500 hover:text-neutral-300"
        >
          Cancel
        </button>
      </div>

      {error && <p className="max-w-lg text-sm text-red-400">{error}</p>}
    </div>
  );
}
