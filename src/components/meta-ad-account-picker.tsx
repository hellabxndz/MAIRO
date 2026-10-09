"use client";

import { useState, useTransition } from "react";
import { listMetaAdAccountsAction, selectMetaAdAccountAction } from "@/lib/actions/meta-actions";
import type { AdAccountChoice } from "@/lib/meta/account-switch";

// Which Meta ad account MAIRO works in, and the means to change it.
//
// Connecting used to pick for the business — the account it had before, or
// the first one able to spend — and never offered a choice. Fine with one
// account; quietly wrong for an agency client or a business with a second
// brand. The list is fetched on demand, like the Page picker beside it.
export function MetaAdAccountPicker({ accountId }: { accountId: string }) {
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<AdAccountChoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function load() {
    setOpen(true);
    startTransition(async () => {
      setError(null);
      const result = await listMetaAdAccountsAction();
      if (result.ok) setAccounts(result.accounts);
      else setError(result.error);
    });
  }

  function choose(id: string) {
    startTransition(async () => {
      setError(null);
      const result = await selectMetaAdAccountAction(id);
      if (result?.error) setError(result.error);
      else setOpen(false);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-xs uppercase tracking-[0.12em] text-neutral-500">Ad account</span>
        <span className="text-sm text-white">{accountId}</span>
        {!open && (
          <button
            type="button"
            onClick={load}
            className="text-xs uppercase tracking-[0.1em] text-neutral-400 underline underline-offset-4 transition hover:text-white"
          >
            Change
          </button>
        )}
      </div>

      {open && (
        <div className="space-y-2">
          {pending && !accounts && <p className="text-sm text-neutral-500">Asking Meta…</p>}

          {accounts?.length === 0 && (
            <p className="max-w-xl text-sm text-amber-300">
              Meta didn&apos;t list any ad accounts for this login. Check your role on the account in
              Meta Business Settings, then reconnect.
            </p>
          )}

          {accounts && accounts.length > 0 && (
            <ul className="max-w-md divide-y divide-white/5 overflow-hidden rounded-lg border border-white/10">
              {accounts.map((a) => {
                const current = a.id === accountId;
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      disabled={pending || current}
                      onClick={() => choose(a.id)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition hover:bg-white/5 disabled:cursor-default"
                    >
                      <span className="min-w-0">
                        <span className={`block truncate ${current ? "text-white" : "text-neutral-300"}`}>{a.name}</span>
                        <span className={`block text-xs ${a.status === 1 ? "text-neutral-500" : "text-amber-300"}`}>
                          {a.id} · {a.label}
                        </span>
                      </span>
                      <span className="shrink-0 text-[11px] uppercase tracking-[0.12em] text-neutral-600">
                        {current ? "Current" : "Use this"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {accounts && (
            <p className="max-w-xl text-xs leading-relaxed text-neutral-500">
              Campaigns MAIRO builds go into the account chosen here, and Meta bills that account for
              the ads. While MAIRO is managing campaigns in one account, it won&apos;t switch away from it.
            </p>
          )}

          {error && <p className="max-w-xl text-sm text-red-400">{error}</p>}

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-xs uppercase tracking-[0.1em] text-neutral-500 transition hover:text-neutral-300"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
