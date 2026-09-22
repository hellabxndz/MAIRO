/* eslint-disable @next/next/no-img-element -- remote blob URLs, see studio-workspace.tsx */
"use client";

import { useState, useTransition } from "react";
import { archiveAssetAction, attachCreativeToCampaignAction } from "@/lib/actions/creative-studio-actions";
import type { LibraryItem } from "@/lib/creative-studio/library";
import { presetInfo } from "@/lib/creative-studio/presets";
import { FORMAT_LABEL } from "@/lib/creative-studio/format-info";

const SOURCE_LABEL: Record<string, string> = {
  PROMPT: "Generated",
  PRODUCT_UPLOAD: "Product transform",
  OWN_UPLOAD: "Your upload",
};

export function LibraryGrid({ items }: { items: LibraryItem[] }) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div className="rounded-[var(--radius-panel)] border border-dashed p-10 text-center" style={{ borderColor: "var(--mairo-line)" }}>
        <p className="text-[14px] text-white/85">Nothing here yet</p>
        <p className="mx-auto mt-2 max-w-sm text-[12.5px] leading-relaxed text-neutral-500">
          Everything you generate or upload is saved here automatically — your library fills in as you create.
        </p>
      </div>
    );
  }

  function archive(id: string) {
    setBusyId(id);
    startTransition(async () => {
      await archiveAssetAction(id);
      setBusyId(null);
    });
  }

  function attach(id: string) {
    setBusyId(id);
    startTransition(async () => {
      await attachCreativeToCampaignAction(id);
      setBusyId(null);
    });
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => {
        const busy = pending && busyId === item.assetId;
        const image = item.latestVersion;
        return (
          <div key={item.assetId} className="group overflow-hidden rounded-xl border" style={{ borderColor: "var(--mairo-line)" }}>
            <div className="relative aspect-square bg-black/40">
              {image?.status === "COMPLETE" && image.imageUrl ? (
                <img src={image.imageUrl} alt={image.instruction ?? "Creative"} className="h-full w-full object-cover" />
              ) : image?.status === "FAILED" ? (
                <div className="flex h-full items-center justify-center px-3 text-center text-[11px] text-red-400">
                  Failed
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-[11px] text-neutral-500">Pending…</div>
              )}
              {item.linkedCreativeRequestId && (
                <span className="absolute left-1.5 top-1.5 rounded-full bg-live/90 px-2 py-0.5 text-[9px] font-medium text-black">
                  In campaign
                </span>
              )}
            </div>
            <div className="p-2.5">
              <p className="truncate text-[11px] text-neutral-400">
                {SOURCE_LABEL[item.source] ?? item.source}
                {item.preset ? ` · ${presetInfo(item.preset as never).label}` : ""}
              </p>
              <p className="mt-0.5 text-[10px] text-neutral-600">
                {FORMAT_LABEL[item.format as keyof typeof FORMAT_LABEL]?.ratio} · v{image?.version ?? 1}
                {item.versionCount > 1 ? ` (${item.versionCount})` : ""}
              </p>
              <div className="mt-2 flex items-center gap-2.5">
                {image?.imageUrl && (
                  <a href={image.imageUrl} download className="text-[10.5px] text-neutral-400 hover:text-white">
                    Download
                  </a>
                )}
                {!item.linkedCreativeRequestId && image?.status === "COMPLETE" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => attach(item.assetId)}
                    className="text-[10.5px] text-sky-300 hover:text-white disabled:opacity-50"
                  >
                    {busy ? "…" : "Use in campaign"}
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => archive(item.assetId)}
                  className="ml-auto text-[10.5px] text-neutral-600 hover:text-red-400 disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
