"use client";

import { useActionState, useState } from "react";
import { deleteAccountAction, type DeleteAccountState } from "@/lib/actions/account-actions";

// Deletion is irreversible, so it takes two deliberate steps rather than one
// click that can be hit by accident — and when campaigns are still running in
// Meta, a third: saying you understand they keep spending.

const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function DeleteAccountButton({ running }: { running: { name: string; dailyBudgetCents: number }[] }) {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState<DeleteAccountState, FormData>(deleteAccountAction, undefined);
  const stillRunning = state?.running ?? running;

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
    <form action={action} className="space-y-4">
      {stillRunning.length > 0 && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-4 text-sm text-amber-100">
          <p className="font-medium">
            {stillRunning.length === 1 ? "This campaign is" : `These ${stillRunning.length} campaigns are`} still running in your Meta ad account:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-100/90">
            {stillRunning.map((c) => (
              <li key={c.name}>
                {c.name} — up to {usd(c.dailyBudgetCents)} a day
              </li>
            ))}
          </ul>
          <p className="mt-3 text-amber-100/80">
            Deleting your account doesn&apos;t pause them, and afterwards MAIRO can&apos;t. They keep spending until you pause
            them in Meta Ads Manager.{" "}
            <a href="/dashboard/billing/cancel#campaigns" className="underline underline-offset-4 hover:text-white">
              Pause them in MAIRO first
            </a>
            .
          </p>
          <label className="mt-3 flex items-start gap-2">
            <input type="checkbox" name="acknowledgeRunning" value="yes" required className="mt-1" />
            <span>I understand these campaigns will keep running and spending in Meta.</span>
          </label>
        </div>
      )}
      <p className="text-sm text-neutral-300">
        This also cancels your MAIRO subscription with Stripe. It can&apos;t be undone. Are you sure?
      </p>
      <div className="flex flex-wrap items-center gap-3">
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
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-red-300">
          {state.error}
        </p>
      )}
    </form>
  );
}
