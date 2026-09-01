/* eslint-disable @next/next/no-img-element -- the preview is a client-side
   data URL with no remote origin, so next/image has nothing to optimise. */
"use client";

import { useActionState, useRef, useState } from "react";
import { requestCreativeAction } from "@/lib/actions/creative-actions";
import { inputClass, primaryButtonClass } from "@/components/ui";

const TYPES = [
  { value: "IMAGE", label: "Image" },
  { value: "VIDEO", label: "Video" },
  { value: "COPY", label: "Ad copy" },
  { value: "CAROUSEL", label: "Carousel" },
];

// Phone cameras produce 4-8MB files. Downscaling in the browser keeps the
// upload fast on a phone signal and the stored data URL small — the model sees
// everything it needs at this size, and nothing is gained by sending more.
const MAX_EDGE = 1400;
const JPEG_QUALITY = 0.82;

function downscaleToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file isn't an image we can read."));
      img.onload = () => {
        const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Couldn't process that image."));

        // Flatten onto white: a transparent PNG would otherwise turn black
        // once encoded as JPEG.
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function CreativeRequestForm() {
  const [state, formAction, pending] = useActionState(requestCreativeAction, undefined);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setFileError(null);
    if (!file) {
      setPreview(null);
      setFileName(null);
      return;
    }

    if (!file.type.startsWith("image/")) {
      setFileError("Pick an image — PNG, JPEG, or WebP.");
      return;
    }

    setReading(true);
    try {
      const dataUrl = await downscaleToDataUrl(file);
      setPreview(dataUrl);
      setFileName(file.name);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Couldn't read that image.");
      setPreview(null);
      setFileName(null);
    } finally {
      setReading(false);
    }
  }

  function clearFile() {
    setPreview(null);
    setFileName(null);
    setFileError(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  return (
    <form action={formAction} className="space-y-4">
      {/* The downscaled image travels as a hidden field rather than the raw
          File, so the server stores exactly what was previewed here. */}
      {preview && <input type="hidden" name="referenceImage" value={preview} />}

      <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
        <div className="space-y-1">
          <label className="text-xs font-medium text-neutral-400">Type</label>
          <select name="type" required className={inputClass}>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-neutral-400">
            What do you want the ad to say?
          </label>
          <input
            name="brief"
            required
            className={inputClass}
            placeholder="e.g. Promo image for our fall sale, 20% off, warm colors"
          />
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-dashed border-white/15 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-lg border border-white/20 px-4 py-2 text-xs uppercase tracking-[0.1em] text-neutral-300 transition hover:border-white hover:bg-white hover:text-black">
            {preview ? "Change picture" : "Add a picture"}
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              onChange={handleFile}
              className="hidden"
            />
          </label>
          {reading && <span className="text-xs text-neutral-500">Reading image…</span>}
          {fileName && !reading && (
            <span className="truncate text-xs text-neutral-400">{fileName}</span>
          )}
          {preview && !reading && (
            <button
              type="button"
              onClick={clearFile}
              className="text-xs text-neutral-500 underline underline-offset-4 transition hover:text-white"
            >
              Remove
            </button>
          )}
        </div>

        <p className="text-xs leading-relaxed text-neutral-500">
          Optional. Upload a product photo, a piece of clothing, a competitor&apos;s ad — anything
          you have in mind. The AI looks at it and builds the concept around what it sees.
        </p>

        {fileError && <p className="text-xs text-red-400">{fileError}</p>}

        {preview && (
          <img
            src={preview}
            alt="Your reference"
            className="mt-2 max-h-56 rounded-lg border border-white/10 object-contain"
          />
        )}
      </div>

      {state?.error && <p className="text-sm text-red-400">{state.error}</p>}

      <button type="submit" disabled={pending || reading} className={primaryButtonClass}>
        {pending ? "Writing your concept…" : "Request creative"}
      </button>
      {pending && (
        <p className="text-xs text-neutral-500">
          The AI is looking at your brief{preview ? " and picture" : ""} — this takes a few seconds.
        </p>
      )}
    </form>
  );
}
