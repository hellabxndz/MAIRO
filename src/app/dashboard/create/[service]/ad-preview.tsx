"use client";

import { useState, useTransition } from "react";
import { previewAdAction } from "@/lib/actions/campaign-wizard-actions";
import { PREVIEW_FORMATS, type PreviewFormat } from "@/lib/meta/preview-formats";
import type { CampaignPlan } from "@/lib/campaigns/plan";

// Meta's own drawing of the ad, placement by placement — so what the customer
// approves is what people will actually see, not MAIRO's impression of it.

const SIZE: Record<PreviewFormat, { w: number; h: number }> = {
  MOBILE_FEED_STANDARD: { w: 360, h: 620 },
  INSTAGRAM_STANDARD: { w: 360, h: 620 },
  INSTAGRAM_STORY: { w: 320, h: 570 },
  INSTAGRAM_REELS: { w: 320, h: 570 },
};

export function AdPreview({ plan }: { plan: CampaignPlan }) {
  const [format, setFormat] = useState<PreviewFormat | null>(null);
  const [shown, setShown] = useState<{ format: PreviewFormat; src: string; note: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, start] = useTransition();

  function show(next: PreviewFormat) {
    setFormat(next);
    setError(null);
    start(async () => {
      const result = await previewAdAction(plan, next).catch(() => ({ ok: false as const, error: "Couldn't reach Meta for a preview." }));
      if (result.ok) setShown({ format: next, src: result.src, note: result.note });
      else {
        setShown(null);
        setError(result.error);
      }
    });
  }

  return (
    <div className="mt-6 rounded-xl border p-5" style={{ borderColor: "var(--mairo-line)", background: "rgba(10,16,32,0.5)" }}>
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">Preview, drawn by Meta</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {PREVIEW_FORMATS.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={format === f.value}
            onClick={() => show(f.value)}
            disabled={loading}
            className="rounded-full border px-3.5 py-1.5 text-[12px] transition disabled:opacity-50"
            style={{
              borderColor: format === f.value ? "rgba(108,158,255,0.5)" : "var(--mairo-line)",
              background: format === f.value ? "rgba(61,125,255,0.1)" : "transparent",
              color: format === f.value ? "white" : undefined,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>
      {!format && <p className="mt-3 text-[12.5px] text-muted">Pick a placement to see exactly how the ad will look there.</p>}
      {loading && <p className="mt-3 text-[12.5px] text-muted">Asking Meta to draw it…</p>}
      {error && !loading && <p className="mt-3 text-[12.5px] text-amber-200/90">{error}</p>}
      {shown && !loading && (
        <div className="mt-4">
          <iframe
            key={shown.src}
            src={shown.src}
            title={`Ad preview — ${PREVIEW_FORMATS.find((f) => f.value === shown.format)?.label}`}
            width={SIZE[shown.format].w}
            height={SIZE[shown.format].h}
            className="max-w-full rounded-lg border-0 bg-white"
            sandbox="allow-scripts allow-same-origin allow-popups"
            loading="lazy"
          />
          {shown.note && <p className="mt-2 text-[11.5px] text-faint">{shown.note}</p>}
        </div>
      )}
    </div>
  );
}
