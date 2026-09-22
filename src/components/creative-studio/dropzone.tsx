/* eslint-disable @next/next/no-img-element -- the preview is a client-side
   data URL with no remote origin, so next/image has nothing to optimise. */
"use client";

import { useRef, useState } from "react";
import { downscaleToDataUrl } from "@/lib/creative-studio/downscale";

export function Dropzone({
  value,
  onChange,
  label,
}: {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  label: string;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("That file isn't an image.");
      return;
    }
    setError(null);
    try {
      onChange(await downscaleToDataUrl(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that file.");
    }
  }

  if (value) {
    return (
      <div className="relative overflow-hidden rounded-xl border" style={{ borderColor: "var(--mairo-line)" }}>
        <img src={value} alt="Uploaded" className="max-h-72 w-full object-contain bg-black/40" />
        <button
          type="button"
          onClick={() => onChange(null)}
          className="absolute right-2 top-2 rounded-full bg-black/70 px-3 py-1.5 text-[11px] text-white/90 transition hover:bg-black/90"
        >
          Remove
        </button>
      </div>
    );
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void handleFile(e.dataTransfer.files?.[0]);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
          dragOver ? "border-sky-400/60 bg-sky-400/[0.06]" : "border-white/15 hover:border-white/25"
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-7 w-7 text-neutral-500" fill="none" aria-hidden>
          <path
            d="M12 16V4m0 0L7 9m5-5l5 5M5 20h14"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <p className="text-[13px] text-white/85">{label}</p>
        <p className="text-[11.5px] text-neutral-500">Drag a photo here, or click to choose one</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      {error && <p className="mt-2 text-[12px] text-red-400">{error}</p>}
    </div>
  );
}
