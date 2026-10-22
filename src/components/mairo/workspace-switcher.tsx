"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { switchWorkspaceAction } from "@/lib/actions/team-actions";

// The businesses this person is on the team of, to switch between. Only
// shown when there's more than one. The server checks the membership again
// on every request, so choosing a business here is a request, not a grant.

export type WorkspaceOption = { id: string; name: string; role: string };

export function WorkspaceSwitcher({ workspaces, current, compact = false }: { workspaces: WorkspaceOption[]; current: string; compact?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (workspaces.length < 2) return null;
  return (
    <div className={compact ? "min-w-0" : "px-3 py-1.5"}>
      <label htmlFor={compact ? "ws-compact" : "ws"} className={compact ? "sr-only" : "block text-[11px] uppercase tracking-[0.12em] text-faint"}>Business</label>
      <select
        id={compact ? "ws-compact" : "ws"}
        value={current}
        disabled={pending}
        onChange={(e) => {
          const id = e.target.value;
          start(async () => {
            const r = await switchWorkspaceAction(id);
            if (!r.ok) return setError(r.error);
            setError(null);
            router.push("/dashboard");
            router.refresh();
          });
        }}
        className={`${compact ? "w-full text-[12.5px]" : "mt-1 w-full text-[13px]"} truncate rounded-lg border bg-transparent px-2 py-1 text-white outline-none focus:ring-2 focus:ring-violet-400/30`}
        style={{ borderColor: "var(--mairo-line)" }}
      >
        {workspaces.map((w) => (
          <option key={w.id} value={w.id} className="bg-[#1c1c1c] text-white">{w.name}</option>
        ))}
      </select>
      {error && <p role="alert" className="mt-1 text-[12px] text-red-400">{error}</p>}
    </div>
  );
}
