"use client";

import Image from "next/image";
import type { AccountAd } from "@/lib/meta/existing-ads";

const STATUS: Record<string, string> = {
  ACTIVE: "Running",
  PAUSED: "Paused",
  CAMPAIGN_PAUSED: "Campaign paused",
  ADSET_PAUSED: "Ad set paused",
};

// Ads already in the business's Meta account, shown as the ads: picture,
// words and whether it's running now.
export function ExistingAdPicker({
  ads,
  error,
  loading,
  selectedId,
  onSelect,
}: {
  ads: AccountAd[] | null;
  error: string | null;
  loading: boolean;
  selectedId: string | null;
  onSelect: (ad: AccountAd) => void;
}) {
  if (loading && !ads) return <p className="text-[13px] text-muted">Asking Meta for your ads…</p>;
  if (error) {
    return (
      <p className="rounded-xl border p-4 text-[13px] leading-relaxed text-amber-200/90" style={{ borderColor: "var(--mairo-line)" }}>
        {error}
      </p>
    );
  }
  if (!ads) return null;
  if (ads.length === 0) {
    return <p className="text-[13px] leading-relaxed text-muted">There are no ads in your Meta account that can run again yet.</p>;
  }

  return (
    <ul className="grid gap-2.5 sm:grid-cols-2">
      {ads.map((ad) => {
        const selected = ad.id === selectedId;
        return (
          <li key={ad.id}>
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(ad)}
              className="flex w-full gap-3 rounded-xl border p-3 text-left transition-all duration-300"
              style={{
                borderColor: selected ? "rgba(108,158,255,0.5)" : "var(--mairo-line)",
                background: selected ? "rgba(61,125,255,0.08)" : "rgba(255,255,255,0.015)",
              }}
            >
              {ad.thumbnailUrl && (
                <Image src={ad.thumbnailUrl} alt="" width={64} height={64} unoptimized className="h-16 w-16 flex-none rounded-lg object-cover" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-white">{ad.name}</span>
                {(ad.headline || ad.body) && (
                  <span className="mt-0.5 line-clamp-2 block text-[12px] text-muted">{ad.headline || ad.body}</span>
                )}
                <span className="mt-1 block text-[11px] text-faint">{STATUS[ad.status] ?? ad.status}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
