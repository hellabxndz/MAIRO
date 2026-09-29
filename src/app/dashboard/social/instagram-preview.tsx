"use client";

import Image from "next/image";
import { useState } from "react";
import type { MediaType } from "@/lib/instagram/social-logic";

// What the post will look like on their Instagram feed, before they approve
// it: their name, the picture exactly as Instagram will receive it, and the
// caption as Instagram shows it.

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function InstagramPreview({
  username,
  mediaType,
  images,
  poster,
  caption,
}: {
  username: string;
  mediaType: MediaType;
  /** Picture addresses, in order. */
  images: string[];
  /** For a Reel: its cover picture, when there is one. */
  poster: string | null;
  caption: string;
}) {
  const [at, setAt] = useState(0);
  const [open, setOpen] = useState(false);
  const short = caption.length > 125 && !open;

  return (
    <article className="overflow-hidden rounded-xl border border-white/10 bg-black text-white" aria-label="Preview of the Instagram post">
      <header className="flex items-center gap-2.5 px-3 py-2.5">
        <span className="rounded-full bg-gradient-to-tr from-[#f9ce34] via-[#ee2a7b] to-[#6228d7] p-[2px]">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-[12px] font-semibold uppercase">{username.slice(0, 1)}</span>
        </span>
        <span className="text-[13.5px] font-semibold">{username}</span>
        {mediaType === "REEL" && <span className="ml-auto text-[12px] text-white/70">Reel</span>}
      </header>

      <div className={`relative w-full bg-[#111] ${mediaType === "REEL" ? "aspect-[9/16] max-h-[520px]" : "aspect-[4/5]"}`}>
        {mediaType === "REEL" ? (
          <>
            {poster && <Image src={poster} alt="" fill unoptimized sizes="400px" className="object-cover" />}
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/55 text-[18px]">▶</span>
            </span>
          </>
        ) : images[at] ? (
          <Image src={images[at]} alt="" fill unoptimized sizes="400px" className="object-contain" />
        ) : null}
        {mediaType === "CAROUSEL" && images.length > 1 && (
          <>
            <span className="absolute right-2.5 top-2.5 rounded-full bg-black/60 px-2 py-0.5 text-[11px]">{at + 1}/{images.length}</span>
            {at > 0 && (
              <button type="button" onClick={() => setAt(at - 1)} aria-label="Previous picture" className="absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-black">‹</button>
            )}
            {at < images.length - 1 && (
              <button type="button" onClick={() => setAt(at + 1)} aria-label="Next picture" className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-black">›</button>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-4 px-3 pt-2.5">
        <Icon d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" />
        <Icon d="M20 12a8 8 0 01-11.6 7.1L4 20l1-4.2A8 8 0 1120 12z" />
        <Icon d="M21 4L3 11l7 2 2 7 9-16z" />
        {mediaType === "CAROUSEL" && images.length > 1 && (
          <span className="mx-auto flex gap-1">
            {images.map((_, i) => <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === at ? "bg-[#3897f0]" : "bg-white/30"}`} />)}
          </span>
        )}
        <span className="ml-auto"><Icon d="M6 3h12v18l-6-4-6 4z" /></span>
      </div>
      <p className="whitespace-pre-wrap px-3 pb-3 pt-2 text-[13px] leading-snug">
        <span className="font-semibold">{username}</span>{" "}
        {(short ? caption.slice(0, 125) : caption).split(/(#[\p{L}\p{N}_]+)/u).map((part, i) =>
          part.startsWith("#") ? <span key={i} className="text-[#e0f1ff]">{part}</span> : part,
        )}
        {short && (
          <button type="button" onClick={() => setOpen(true)} className="text-white/55">… more</button>
        )}
      </p>
    </article>
  );
}
