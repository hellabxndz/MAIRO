/* eslint-disable @next/next/no-img-element -- pictures are stored as data URLs
   with no remote origin, so next/image has nothing to optimise. */
"use client";

import { useActionState, useState, useTransition } from "react";
import {
  generateAdImageAction,
  chooseImageAction,
  unchooseImageAction,
} from "@/lib/actions/image-actions";
import { MAX_FINAL_IMAGES } from "@/lib/creative-limits";
import { inputClass, primaryButtonClass } from "@/components/ui";

export type StudioImage = {
  id: string;
  version: number;
  imageData: string;
  instruction: string | null;
  isFinal: boolean;
  reviewNotes: string | null;
};

export function ImageStudio({
  creativeRequestId,
  images,
  hasReference,
}: {
  creativeRequestId: string;
  images: StudioImage[];
  hasReference: boolean;
}) {
  const [state, formAction, generating] = useActionState(
    generateAdImageAction.bind(null, creativeRequestId),
    undefined
  );
  const [choosing, startChoosing] = useTransition();
  const [chooseError, setChooseError] = useState<string | null>(null);

  const finals = images.filter((i) => i.isFinal);
  const draft = images.find((i) => !i.isFinal);
  const current = draft ?? finals[finals.length - 1];
  const busy = generating || choosing;

  function choose(id: string) {
    startChoosing(async () => {
      setChooseError(null);
      const result = await chooseImageAction(id);
      if (result?.error) setChooseError(result.error);
    });
  }

  function unchoose(id: string) {
    startChoosing(async () => {
      setChooseError(null);
      const result = await unchooseImageAction(id);
      if (result?.error) setChooseError(result.error);
    });
  }

  if (!hasReference && images.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        Add a picture to a creative request and the AI can turn it into finished ad
        images you can keep changing by describing what you want.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.12em] text-neutral-600">
          Ad pictures
        </p>
        <p className="text-xs text-neutral-500">
          {finals.length} of {MAX_FINAL_IMAGES} chosen for the campaign
        </p>
      </div>

      {current ? (
        <div className="space-y-3">
          <img
            src={current.imageData}
            alt={
              current.instruction
                ? `Ad picture, version ${current.version}: ${current.instruction}`
                : `Ad picture, version ${current.version}`
            }
            className="w-full max-w-lg rounded-xl border border-white/10"
          />
          <p className="text-xs text-neutral-500">
            Version {current.version}
            {current.instruction ? ` · you asked for: ${current.instruction}` : ""}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            {current.isFinal ? (
              <button
                type="button"
                onClick={() => unchoose(current.id)}
                disabled={busy}
                className="rounded-lg border border-emerald-500/40 px-4 py-2 text-xs uppercase tracking-[0.1em] text-emerald-300 transition hover:bg-emerald-500 hover:text-black disabled:opacity-60"
              >
                Chosen — remove
              </button>
            ) : (
              <button
                type="button"
                onClick={() => choose(current.id)}
                disabled={busy || finals.length >= MAX_FINAL_IMAGES}
                className="rounded-lg border border-white/25 px-4 py-2 text-xs uppercase tracking-[0.1em] text-white transition hover:border-white hover:bg-white hover:text-black disabled:opacity-40"
              >
                {choosing ? "Checking…" : "Use this in the campaign"}
              </button>
            )}
            {finals.length >= MAX_FINAL_IMAGES && !current.isFinal && (
              <span className="text-xs text-neutral-500">
                Remove one of your {MAX_FINAL_IMAGES} to swap this in.
              </span>
            )}
          </div>

          {current.reviewNotes && !current.isFinal && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/[0.06] px-3 py-2 text-xs text-red-200">
              {current.reviewNotes}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-neutral-400">
          No picture yet. Make the first one from the photo you uploaded and the concept
          above.
        </p>
      )}

      <form action={formAction} className="space-y-2">
        {current && (
          <input
            name="instruction"
            className={inputClass}
            placeholder="Tell the AI what to change — e.g. darker background, bigger price, remove the logo"
            disabled={busy}
          />
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy} className={primaryButtonClass}>
            {generating
              ? "Working on it…"
              : current
                ? "Make the change"
                : "Make the first picture"}
          </button>
          {generating && (
            <span className="text-xs text-neutral-500">
              Editing a picture takes a few seconds.
            </span>
          )}
        </div>
        {state?.error && <p className="text-sm text-red-400">{state.error}</p>}
        {chooseError && <p className="text-sm text-red-400">{chooseError}</p>}
      </form>

      {finals.length > 0 && (
        <div className="border-t border-white/10 pt-4">
          <p className="mb-3 text-xs uppercase tracking-[0.12em] text-neutral-600">
            Chosen for the campaign
          </p>
          <div className="flex flex-wrap gap-3">
            {finals.map((image) => (
              <div key={image.id} className="w-32">
                <img
                  src={image.imageData}
                  alt={`Chosen ad picture, version ${image.version}`}
                  className="w-32 rounded-lg border border-emerald-500/40"
                />
                <button
                  type="button"
                  onClick={() => unchoose(image.id)}
                  disabled={busy}
                  className="mt-1 text-xs text-neutral-500 underline underline-offset-4 transition hover:text-white disabled:opacity-60"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
