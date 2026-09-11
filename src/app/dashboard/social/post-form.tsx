"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import { postToInstagramAction } from "@/lib/actions/social-actions";
import { primaryButtonClass } from "@/components/ui";
import { CAPTION_MAX } from "@/lib/instagram/constants";

// Posting one of the customer's approved pictures to their Instagram.
//
// Picture first, caption second, in that order, because that is the order the
// decision actually happens in — nobody writes a caption and then goes looking
// for something to attach it to.
//
// Only approved finals are offered. There is no upload box and no free-text
// "post anything" field, which is a deliberate limit: the approval step is what
// makes MAIRO posting on somebody's behalf defensible, and the moment this can
// publish arbitrary text to a business's Instagram it is a different product.

export type PostableImage = {
  imageId: string;
  imageData: string;
  brief: string;
  /** Caption MAIRO suggests, from the concept it already wrote. */
  suggested: string;
};

export function PostForm({ images }: { images: PostableImage[] }) {
  const [state, formAction, pending] = useActionState(postToInstagramAction, undefined);
  const [picked, setPicked] = useState<string>(images[0]?.imageId ?? "");
  const [caption, setCaption] = useState<string>(images[0]?.suggested ?? "");

  function choose(image: PostableImage) {
    setPicked(image.imageId);
    // Only replaces a caption they haven't touched. Losing something somebody
    // wrote because they clicked a different picture is infuriating.
    const current = images.find((i) => i.imageId === picked);
    if (!caption.trim() || caption === current?.suggested) setCaption(image.suggested);
  }

  const over = caption.length > CAPTION_MAX;

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="imageId" value={picked} />

      <fieldset className="space-y-3">
        <legend className="text-sm text-white">Which picture?</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {images.map((image) => {
            const selected = picked === image.imageId;
            return (
              <button
                key={image.imageId}
                type="button"
                onClick={() => choose(image)}
                aria-pressed={selected}
                className={`relative overflow-hidden rounded-2xl border transition ${
                  selected
                    ? "border-sky-400/60 ring-2 ring-sky-400/30"
                    : "border-white/[0.07] hover:border-white/25"
                }`}
              >
                <Image
                  src={image.imageData}
                  alt={image.brief}
                  width={240}
                  height={240}
                  unoptimized
                  className="aspect-square w-full object-cover"
                />
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="caption" className="text-xs font-medium text-neutral-400">
          Caption
        </label>
        <textarea
          id="caption"
          name="caption"
          rows={5}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          className="w-full rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-sm leading-relaxed text-white outline-none transition placeholder:text-neutral-600 focus:border-white/25"
          placeholder="What you'd say if you were posting it yourself."
        />
        <p className={`text-[11px] ${over ? "text-red-400" : "text-neutral-600"}`}>
          {caption.length} / {CAPTION_MAX}
          {caption.length === 0 && " — MAIRO filled this in from the ad it wrote. Change anything."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending || over || !picked} className={primaryButtonClass}>
          {pending ? "Posting…" : "Post to Instagram"}
        </button>
        {state?.error && <p className="max-w-2xl text-sm leading-relaxed text-red-400">{state.error}</p>}
        {state?.posted && (
          <p className="text-sm text-emerald-400">
            {state.message}{" "}
            {state.permalink && (
              <a
                href={state.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4"
              >
                See it
              </a>
            )}
          </p>
        )}
      </div>
    </form>
  );
}
