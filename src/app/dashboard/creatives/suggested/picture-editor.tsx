/* eslint-disable @next/next/no-img-element -- remote blob URLs */
"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { creditQuoteAction, editPictureAction, restorePictureAction, type CreditQuote } from "@/lib/actions/suggested-ads-actions";

// "Change the picture": a plain-language change to a direction's picture,
// with its cost shown first. The result is a new version; the one before is
// kept, shown beside it, and can be made current again without AI or credits.

export const PICTURE_CHIPS = ["Use our brand colours", "Make this more luxurious", "A brighter, cleaner background", "Focus more on the product"] as const;

type Image = {
  assetId: string;
  versionId: string | null;
  version: number | null;
  url: string | null;
  changing: boolean;
  changeError: string | null;
  history: { versionId: string; version: number; url: string; instruction: string | null }[];
};

export function PictureEditor({ angleId, image, available, paid }: { angleId: string; image: Image; available: boolean; paid: boolean }) {
  const router = useRouter();
  const [instruction, setInstruction] = useState("");
  const [quality, setQuality] = useState<"standard" | "premium">("standard");
  const [quote, setQuote] = useState<CreditQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const previous = image.history[1] ?? null;

  useEffect(() => {
    if (!available || !paid) return;
    let live = true;
    creditQuoteAction(quality, "EDIT").then((q) => live && setQuote(q));
    return () => {
      live = false;
    };
  }, [quality, available, paid]);

  const q = quote?.ok ? quote : null;
  const canChange = Boolean(q && q.available && !q.blocked && q.remaining >= q.cost && instruction.trim().length >= 3 && image.versionId && !image.changing);

  const change = () =>
    start(async () => {
      if (!q || !image.versionId) return;
      setError(null);
      setNotice(null);
      const r = await editPictureAction(angleId, image.versionId, instruction, quality, q.cost);
      if (!r.ok) {
        setError(r.error);
        router.refresh();
        return;
      }
      setInstruction("");
      setNotice("Done — this is the new version. The one before is beside it if you want it back.");
      router.refresh();
    });

  const goBack = (versionId: string, version: number) =>
    start(async () => {
      setError(null);
      const r = await restorePictureAction(angleId, versionId);
      if (!r.ok) return setError(r.error);
      setNotice(`Version ${version} is the current picture again, saved as a new version.`);
      router.refresh();
    });

  return (
    <section aria-labelledby={`pic-${angleId}`} className="rounded-2xl border px-4 py-4" style={{ borderColor: "var(--mairo-line)" }}>
      <h3 id={`pic-${angleId}`} className="text-[13.5px] font-semibold text-white">Change the picture</h3>

      {previous && image.url && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <figure>
            <img src={previous.url} alt={`Picture version ${previous.version}`} className="aspect-[4/5] w-full rounded-lg object-cover opacity-90" />
            <figcaption className="mt-1 text-[11.5px] text-muted">Before · v{previous.version}</figcaption>
            <button type="button" disabled={busy} onClick={() => goBack(previous.versionId, previous.version)} className="mt-0.5 text-[12px] text-violet-bright underline-offset-4 hover:underline disabled:opacity-50">Go back to this one</button>
          </figure>
          <figure>
            <img src={image.url} alt={`Picture version ${image.version}`} className="aspect-[4/5] w-full rounded-lg object-cover" />
            <figcaption className="mt-1 text-[11.5px] text-muted">Now · v{image.version}{image.history[0]?.instruction ? ` — “${image.history[0].instruction.slice(0, 60)}”` : ""}</figcaption>
          </figure>
        </div>
      )}

      {image.changing && <p className="mt-3 text-[12.5px] text-muted">A change is being made…</p>}
      {image.changeError && !image.changing && <p className="mt-3 text-[12.5px] text-warn">The last change couldn&rsquo;t be made, so no credits were used.</p>}

      {!available ? (
        <p className="mt-3 text-[12.5px] text-muted">Changing pictures isn&rsquo;t switched on for this deployment yet, so nothing can be changed or charged.</p>
      ) : !paid ? (
        <p className="mt-3 text-[12.5px] text-muted">Changing pictures is part of a MAIRO plan.</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {PICTURE_CHIPS.map((c) => (
              <button key={c} type="button" onClick={() => setInstruction(c)} aria-pressed={instruction === c} className={`rounded-full border px-3 py-1 text-[12px] ${instruction === c ? "border-white/70 text-white" : "border-[color:var(--mairo-line)] text-muted hover:text-white"}`}>{c}</button>
            ))}
          </div>
          <label className="mt-2 block text-[12.5px] text-white">
            What to change
            <input value={instruction} onChange={(e) => setInstruction(e.target.value)} maxLength={300} placeholder="e.g. a warmer, evening light" className="mt-1 w-full rounded-xl border border-[color:var(--mairo-line)] bg-transparent px-3 py-2 text-[13.5px] text-white" />
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
            {(["standard", "premium"] as const).map((v) => (
              <label key={v} className={`cursor-pointer rounded-full border px-3 py-1 ${quality === v ? "border-white/70 text-white" : "border-[color:var(--mairo-line)] text-muted"}`}>
                <input type="radio" name={`pq-${angleId}`} value={v} checked={quality === v} onChange={() => setQuality(v)} className="sr-only" />
                {v === "standard" ? "Standard" : "Premium"}
              </label>
            ))}
            <span className="text-muted" aria-live="polite">
              {!quote ? "Checking the cost…" : !quote.ok ? quote.error : `${quote.cost} credit${quote.cost === 1 ? "" : "s"} · ${quote.remaining} of ${quote.allowance} left this month`}
            </span>
          </div>
          {q?.blocked && <p className="mt-2 text-[12.5px] text-warn">{q.blocked}</p>}
          <button type="button" disabled={!canChange || busy} onClick={change} className="mt-3 inline-flex min-h-[38px] items-center rounded-full bg-[image:var(--mairo-ramp)] px-4 text-[13px] font-medium text-[#fff] disabled:opacity-50">
            {busy ? "Changing the picture… up to a minute" : q ? `Change it — ${q.cost} credit${q.cost === 1 ? "" : "s"}` : "Change it"}
          </button>
          <p className="mt-1.5 text-[11.5px] text-faint">Credits are used only if the new version is made. You&rsquo;ll approve the new picture before it&rsquo;s used.</p>
        </>
      )}
      {error && <p role="alert" className="mt-2 text-[12.5px] text-warn">{error}</p>}
      {notice && <p role="status" className="mt-2 text-[12.5px] text-live">{notice}</p>}
    </section>
  );
}
