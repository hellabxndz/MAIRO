/* eslint-disable @next/next/no-img-element -- images come from a remote blob
   store with no next.config remotePatterns entry (see storage/blob.ts); a
   plain <img> is the same choice already made for the Creatives page. */
"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  generateCreativeAction,
  transformProductAction,
  editCreativeAction,
  generateVariationsAction,
  uploadOwnCreativeAction,
  attachCreativeToCampaignAction,
} from "@/lib/actions/creative-studio-actions";
import { PresetGrid } from "./preset-grid";
import { FormatGrid } from "./format-grid";
import { CreditMeter } from "./credit-meter";
import { GeneratingOverlay } from "./generating-overlay";
import { Dropzone } from "./dropzone";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui";
import type { CreativeFormat, CreativeStylePreset } from "@/generated/prisma/enums";
import type { CreditBalance } from "@/lib/creative-studio/credits";
import type { CreditCosts } from "@/lib/creative-studio/pricing";

// The generate/transform/upload workspace — the interactive heart of AI
// Creative Studio.
//
// One component rather than three pages because the three options in the
// brief ("Generate with AI", "Upload Product & Transform", "Upload My Own")
// are really one workspace with a different starting point, and somebody
// exploring should be able to switch between them without losing the format
// and style choices they already made.
//
// Reusable by design: the campaign-creation flow embeds this exact component
// (see launch-flow.tsx) rather than linking out to a separate page, because
// navigating away and back would lose everything already typed into the
// campaign form. `embedded` trims the chrome; `onAttached` is how the
// campaign flow hears "a creative was chosen" without this component knowing
// anything about campaigns.

type Result = { assetId: string; versionId: string; imageUrl: string; width: number; height: number };
type VersionEntry = { version: number; imageUrl: string; instruction: string | null };

/**
 * Watches one action's result and, the moment it resolves to a fresh
 * success, promotes it to the shared `result` the right panel shows.
 * Guarded by a ref rather than by comparing to the current `result` prop, so
 * this never fires twice for the same versionId even if the parent re-renders
 * for an unrelated reason in between.
 */
function useResultEffect(
  state: { imageUrl?: string; assetId?: string; versionId?: string; width?: number; height?: number } | undefined,
  instruction: string | null,
  setResult: (r: Result) => void,
  setVersions: (fn: (prev: VersionEntry[]) => VersionEntry[]) => void,
  setAttached: (v: boolean) => void,
  setAttachError: (v: string | null) => void,
) {
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (!state?.imageUrl || !state.assetId || !state.versionId) return;
    if (seen.current === state.versionId) return;
    seen.current = state.versionId;

    const next: Result = {
      assetId: state.assetId,
      versionId: state.versionId,
      imageUrl: state.imageUrl,
      width: state.width ?? 0,
      height: state.height ?? 0,
    };
    setResult(next);
    setAttached(false);
    setAttachError(null);
    setVersions((prev) => [...prev, { version: prev.length + 1, imageUrl: next.imageUrl, instruction }]);
    // Deliberately keyed on versionId alone. The setters are React-stable;
    // the rest of `state` changes together with versionId by construction
    // (both come from the same action result), so re-running for them would
    // be redundant; and `instruction` is read via closure for whatever it
    // was at the moment this version arrived — re-running because the input
    // box was typed into afterwards would relabel a version that already
    // landed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.versionId]);
}

export function StudioWorkspace({
  assistantName,
  creditBalance,
  costs,
  mode,
  embedded = false,
  onAttached,
}: {
  assistantName: string;
  creditBalance: CreditBalance;
  costs: CreditCosts;
  mode: "simple" | "advanced";
  embedded?: boolean;
  onAttached?: (assetId: string, imageUrl: string) => void;
}) {
  const [tab, setTab] = useState<"generate" | "transform" | "upload">("generate");
  const [prompt, setPrompt] = useState("");
  const [preset, setPreset] = useState<CreativeStylePreset | null>(null);
  const [format, setFormat] = useState<CreativeFormat>("SQUARE");
  const [quality, setQuality] = useState<"standard" | "premium">("standard");
  const [productImage, setProductImage] = useState<string | null>(null);
  const [ownImage, setOwnImage] = useState<string | null>(null);

  const [result, setResult] = useState<Result | null>(null);
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [editInput, setEditInput] = useState("");
  const [attaching, startAttach] = useTransition();
  const [attached, setAttached] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);

  const [genState, generateAction, generating] = useActionState(generateCreativeAction, undefined);
  const [transformState, transformAction, transforming] = useActionState(transformProductAction, undefined);
  const [uploadState, uploadAction, uploading] = useActionState(uploadOwnCreativeAction, undefined);
  const [editState, editAction, editing] = useActionState(
    editCreativeAction.bind(null, result?.assetId ?? ""),
    undefined,
  );
  const [varState, variationsAction, varying] = useActionState(generateVariationsAction, undefined);

  const busy = generating || transforming || uploading || editing || varying;

  // Four independent useActionState hooks — one per server action — each
  // keep their own result around once set, so a naive "whichever one has an
  // imageUrl" check would keep re-showing the FIRST action to ever succeed
  // rather than the most recent one. Instead, each gets its own effect that
  // only fires when THAT action's state genuinely changes, and only that
  // effect is allowed to update the shared `result` — which is what makes
  // "most recently completed" fall out correctly with no ordering guesswork.
  useResultEffect(genState, prompt, setResult, setVersions, setAttached, setAttachError);
  useResultEffect(transformState, prompt, setResult, setVersions, setAttached, setAttachError);
  useResultEffect(uploadState, null, setResult, setVersions, setAttached, setAttachError);
  useResultEffect(editState, editInput, setResult, setVersions, setAttached, setAttachError);

  const cost = tab === "generate" || tab === "transform" ? (quality === "premium" ? costs.premium : costs.standard) : 0;

  async function attach() {
    if (!result) return;
    startAttach(async () => {
      setAttachError(null);
      const res = await attachCreativeToCampaignAction(result.assetId);
      if (res?.error) setAttachError(res.error);
      else {
        setAttached(true);
        onAttached?.(result.assetId, result.imageUrl);
      }
    });
  }

  return (
    <div className={embedded ? "" : "space-y-6"}>
      {!embedded && <CreditMeter balance={creditBalance} estimatedCost={cost || undefined} />}

      {/* Tabs — the three options in the brief. */}
      <div className="flex gap-2 border-b" style={{ borderColor: "var(--mairo-line)" }}>
        {(
          [
            ["generate", "Generate with AI"],
            ["transform", "Upload Product"],
            ["upload", "Upload My Own"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setTab(key);
              setResult(null);
              setVersions([]);
            }}
            className={`px-3.5 py-2.5 text-[13px] transition-colors ${
              tab === key ? "border-b-2 border-sky-400 text-white" : "text-neutral-400 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ---- Left: the form ---- */}
        <div className="space-y-5">
          {tab === "generate" && (
            <form action={generateAction} className="space-y-5">
              <div>
                <label className="mb-1.5 block text-[12px] text-neutral-400">Describe your advertisement</label>
                <textarea
                  name="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={4}
                  placeholder="A luxury advertisement for a black streetwear hoodie, worn by a male model in an underground parking garage."
                  className={`${inputClass} resize-none`}
                  disabled={busy}
                />
              </div>

              <div>
                <label className="mb-2 block text-[12px] text-neutral-400">Choose a style</label>
                <PresetGrid value={preset} onChange={setPreset} />
              </div>

              {mode === "advanced" && (
                <div>
                  <label className="mb-2 block text-[12px] text-neutral-400">Format</label>
                  <FormatGrid value={format} onChange={setFormat} />
                </div>
              )}

              {mode === "advanced" && (
                <div>
                  <label className="mb-2 block text-[12px] text-neutral-400">Quality</label>
                  <div className="flex gap-2">
                    {(["standard", "premium"] as const).map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setQuality(q)}
                        className={`rounded-full border px-4 py-1.5 text-[12px] transition-colors ${
                          quality === q ? "border-sky-400/50 bg-sky-400/[0.08] text-white" : "border-white/10 text-neutral-400 hover:text-white"
                        }`}
                      >
                        {q === "standard" ? `Standard · ${costs.standard} credits` : `Premium · ${costs.premium} credits`}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <input type="hidden" name="preset" value={preset ?? ""} />
              <input type="hidden" name="format" value={format} />
              <input type="hidden" name="quality" value={quality} />

              <div className="flex flex-wrap items-center gap-3">
                <button type="submit" disabled={busy || !prompt.trim()} className={primaryButtonClass}>
                  {generating ? "Working on it…" : "Generate with Mairo AI"}
                </button>
                {mode === "advanced" && (
                  <button
                    type="button"
                    disabled={busy || !prompt.trim()}
                    onClick={(e) => {
                      const form = (e.target as HTMLElement).closest("form");
                      if (!form) return;
                      const fd = new FormData(form);
                      fd.set("count", "4");
                      // A distinct action, not a resubmit of the same form —
                      // variations return a grid, not one picture. The
                      // dispatch function useActionState returns accepts a
                      // FormData directly; it does not have to be the
                      // `action` prop of a <form> to be called.
                      variationsAction(fd);
                    }}
                    className={secondaryButtonClass}
                  >
                    {varying ? "Generating…" : `Generate 4 Variations · ${costs.variation * 4} credits`}
                  </button>
                )}
              </div>
              {genState?.error && <p className="text-[12.5px] text-red-400">{genState.error}</p>}
            </form>
          )}

          {tab === "transform" && (
            <form action={transformAction} className="space-y-5">
              <div>
                <label className="mb-2 block text-[12px] text-neutral-400">Upload your product</label>
                <Dropzone value={productImage} onChange={setProductImage} label="Clothing, shoes, jewellery, food, electronics — any product photo" />
              </div>
              <div>
                <label className="mb-1.5 block text-[12px] text-neutral-400">
                  How should we style it? <span className="text-neutral-600">(optional)</span>
                </label>
                <textarea
                  name="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={3}
                  placeholder="Worn by a model in a city street at golden hour"
                  className={`${inputClass} resize-none`}
                  disabled={busy}
                />
              </div>
              <div>
                <label className="mb-2 block text-[12px] text-neutral-400">Choose a style</label>
                <PresetGrid value={preset} onChange={setPreset} />
              </div>
              {mode === "advanced" && (
                <div>
                  <label className="mb-2 block text-[12px] text-neutral-400">Format</label>
                  <FormatGrid value={format} onChange={setFormat} />
                </div>
              )}
              <input type="hidden" name="productImage" value={productImage ?? ""} />
              <input type="hidden" name="preset" value={preset ?? ""} />
              <input type="hidden" name="format" value={format} />
              <input type="hidden" name="quality" value={quality} />
              <p className="text-[11.5px] leading-relaxed text-neutral-500">
                {assistantName} keeps your product&rsquo;s shape, colour, branding and details as they actually
                are — only the setting, lighting and composition change. Review the result before running it;
                nothing here is promised pixel-perfect.
              </p>
              <button type="submit" disabled={busy || !productImage} className={primaryButtonClass}>
                {transforming ? "Working on it…" : "Generate with Mairo AI"}
              </button>
              {transformState?.error && <p className="text-[12.5px] text-red-400">{transformState.error}</p>}
            </form>
          )}

          {tab === "upload" && (
            <form action={uploadAction} className="space-y-5">
              <div>
                <label className="mb-2 block text-[12px] text-neutral-400">Upload your finished ad</label>
                <Dropzone value={ownImage} onChange={setOwnImage} label="An advertisement you've already made" />
              </div>
              <input type="hidden" name="image" value={ownImage ?? ""} />
              <input type="hidden" name="format" value={format} />
              <p className="text-[11.5px] leading-relaxed text-neutral-500">
                No AI, no credits spent — this saves it to your library exactly as it is, ready to use in a
                campaign.
              </p>
              <button type="submit" disabled={busy || !ownImage} className={primaryButtonClass}>
                {uploading ? "Saving…" : "Save to Creative Library"}
              </button>
              {uploadState?.error && <p className="text-[12.5px] text-red-400">{uploadState.error}</p>}
            </form>
          )}

          {varState?.groupId && (
            <p className="text-[12.5px] text-live">
              {varState.failures ? `Made ${4 - varState.failures} of 4 variations.` : "All 4 variations are ready."}{" "}
              <Link href={`/dashboard/creative-studio?group=${varState.groupId}`} className="underline underline-offset-2 hover:text-white">
                View them
              </Link>
            </p>
          )}
          {varState?.error && <p className="text-[12.5px] text-red-400">{varState.error}</p>}
        </div>

        {/* ---- Right: the result ---- */}
        <div>
          {busy && !result && <GeneratingOverlay label={tab === "upload" ? "Saving" : "Generating"} />}

          {!busy && !result && (
            <div
              className="flex aspect-square w-full flex-col items-center justify-center rounded-[var(--radius-panel)] border border-dashed px-6 text-center"
              style={{ borderColor: "var(--mairo-line)" }}
            >
              <p className="text-[13px] text-neutral-500">Your creative will appear here</p>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="relative overflow-hidden rounded-[var(--radius-panel)] border" style={{ borderColor: "var(--mairo-line)" }}>
                <img src={result.imageUrl} alt="Generated creative" className="w-full" />
                {busy && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                    <GeneratingOverlay label="Editing" />
                  </div>
                )}
              </div>

              {versions.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {versions.map((v) => (
                    <button
                      key={v.version}
                      type="button"
                      onClick={() => setResult({ ...result, imageUrl: v.imageUrl })}
                      className={`overflow-hidden rounded-lg border ${
                        v.imageUrl === result.imageUrl ? "border-sky-400/60" : "border-white/10"
                      }`}
                      title={v.instruction ?? `Version ${v.version}`}
                    >
                      <img src={v.imageUrl} alt={`Version ${v.version}`} className="h-14 w-14 object-cover" />
                    </button>
                  ))}
                </div>
              )}

              {/* Natural-language editing. */}
              {tab !== "upload" && (
                <form
                  action={editAction}
                  className="flex items-center gap-2"
                  onSubmit={() => setEditInput(editInput)}
                >
                  <input
                    name="instruction"
                    value={editInput}
                    onChange={(e) => setEditInput(e.target.value)}
                    placeholder="Make the background darker…"
                    className={inputClass}
                    disabled={busy}
                  />
                  <input type="hidden" name="quality" value={quality} />
                  <button type="submit" disabled={busy || !editInput.trim()} className={secondaryButtonClass}>
                    Edit
                  </button>
                </form>
              )}
              {editState?.error && <p className="text-[12.5px] text-red-400">{editState.error}</p>}

              <div className="flex flex-wrap items-center gap-3">
                <a href={result.imageUrl} download className={secondaryButtonClass}>
                  Download
                </a>
                <button type="button" onClick={attach} disabled={attaching || attached} className={primaryButtonClass}>
                  {attached ? "Attached ✓" : attaching ? "Attaching…" : "Use in Campaign"}
                </button>
              </div>
              {attachError && <p className="text-[12.5px] text-red-400">{attachError}</p>}
              {attached && (
                <p className="text-[12px] text-neutral-500">
                  Ready. {assistantName} wrote ad copy for it and it&rsquo;s waiting for your approval on the
                  Campaigns page.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
