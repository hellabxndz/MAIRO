"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { restoreVersion } from "@/lib/ai-employee/actions";

export type VersionRow = { id: string; version: number; note: string | null; publishedAt: string; by: string | null; live: boolean };

export function VersionsList({ versions, canRestore }: { versions: VersionRow[]; canRestore: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  if (versions.length === 0) return <p className="text-sm text-fg-muted">Nothing published yet. Your first publish creates version 1.</p>;
  return (
    <div className="space-y-3">
      {message && <p role="status" className={message.ok ? "text-sm text-success" : "text-sm text-danger"}>{message.text}</p>}
      <ul className="divide-y divide-line">
        {versions.map((v) => (
          <li key={v.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium">
                Version {v.version} {v.live && <Badge tone="success">Live</Badge>}
              </p>
              <p className="truncate text-xs text-fg-subtle">{v.publishedAt}{v.by ? ` · ${v.by}` : ""}{v.note ? ` · “${v.note}”` : ""}</p>
            </div>
            {canRestore && (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await restoreVersion(v.id);
                    setMessage({ ok: r.ok, text: r.message });
                    // Remount the editor so it shows the restored draft.
                    if (r.ok) router.replace(`/dashboard/ai-employee?r=${Date.now()}`, { scroll: false });
                  })
                }
              >
                Restore to draft
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
