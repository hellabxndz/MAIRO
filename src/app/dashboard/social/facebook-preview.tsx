"use client";

import Image from "next/image";
import { useState } from "react";
import type { MediaType } from "@/lib/instagram/social-logic";

// What the post will look like on their Facebook Page, before they approve
// it: the Page's name, the text above the media as Facebook shows it, and the
// pictures laid out the way Facebook lays out a post with several.

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

function Pic({ src, className = "" }: { src: string; className?: string }) {
  return (
    <span className={`relative block overflow-hidden bg-[#18191a] ${className}`}>
      <Image src={src} alt="" fill unoptimized sizes="400px" className="object-cover" />
    </span>
  );
}

function Photos({ images }: { images: string[] }) {
  if (images.length === 0) return null;
  if (images.length === 1) {
    return (
      <span className="relative block aspect-[4/5] w-full bg-[#18191a]">
        <Image src={images[0]} alt="" fill unoptimized sizes="400px" className="object-contain" />
      </span>
    );
  }
  if (images.length === 2) {
    return (
      <span className="grid aspect-square grid-cols-2 gap-0.5">
        {images.map((src, i) => <Pic key={i} src={src} />)}
      </span>
    );
  }
  if (images.length === 3) {
    return (
      <span className="grid aspect-square grid-cols-2 grid-rows-2 gap-0.5">
        <Pic src={images[0]} className="row-span-2" />
        <Pic src={images[1]} />
        <Pic src={images[2]} />
      </span>
    );
  }
  const more = images.length - 4;
  return (
    <span className="grid aspect-square grid-cols-2 grid-rows-2 gap-0.5">
      {images.slice(0, 4).map((src, i) => (
        <span key={i} className="relative block">
          <Pic src={src} className="h-full w-full" />
          {i === 3 && more > 0 && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-[26px] font-semibold text-[#fff]">+{more}</span>
          )}
        </span>
      ))}
    </span>
  );
}

export function FacebookPreview({
  pageName,
  mediaType,
  images,
  poster,
  text,
}: {
  pageName: string;
  mediaType: MediaType;
  /** Picture addresses, in order. */
  images: string[];
  /** For a video: its cover picture, when there is one. */
  poster: string | null;
  text: string;
}) {
  const [open, setOpen] = useState(false);
  const short = text.length > 240 && !open;

  return (
    <article data-palette="classic" className="overflow-hidden rounded-xl border border-white/10 bg-[#242526] text-[#e4e6eb]" aria-label="Preview of the Facebook post">
      <header className="flex items-center gap-2.5 px-3 pt-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1877f2] text-[15px] font-semibold uppercase text-white">
          {pageName.slice(0, 1)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-semibold">{pageName}</span>
          <span className="flex items-center gap-1 text-[12px] text-[#b0b3b8]">
            Just now ·
            <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.3" aria-label="Public">
              <circle cx="8" cy="8" r="6.2" />
              <path d="M1.8 8h12.4M8 1.8c1.8 1.9 1.8 10.5 0 12.4M8 1.8c-1.8 1.9-1.8 10.5 0 12.4" />
            </svg>
          </span>
        </span>
        <span className="ml-auto text-[18px] leading-none text-[#b0b3b8]" aria-hidden>···</span>
      </header>

      <p className="whitespace-pre-wrap px-3 pb-3 pt-2.5 text-[14px] leading-snug">
        {short ? text.slice(0, 240) : text}
        {short && (
          <>
            …{" "}
            <button type="button" onClick={() => setOpen(true)} className="font-semibold text-[#e4e6eb] hover:underline">See more</button>
          </>
        )}
      </p>

      {mediaType === "REEL" ? (
        <span className="relative block aspect-video w-full bg-black">
          {poster && <Image src={poster} alt="" fill unoptimized sizes="400px" className="object-cover" />}
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/55 text-[18px] text-[#fff]">▶</span>
          </span>
        </span>
      ) : (
        <Photos images={images} />
      )}

      <div className="mx-3 mt-1 grid grid-cols-3 border-t border-white/10 py-1 text-[13.5px] font-semibold text-[#b0b3b8]">
        <span className="flex items-center justify-center gap-1.5 py-1.5"><Icon d="M7 10v10H4V10h3zm0 0l4-7a2 2 0 012 2.5L12 9h6a2 2 0 012 2.3l-1.2 7A2 2 0 0116.8 20H7" />Like</span>
        <span className="flex items-center justify-center gap-1.5 py-1.5"><Icon d="M20 12a8 8 0 01-11.6 7.1L4 20l1-4.2A8 8 0 1120 12z" />Comment</span>
        <span className="flex items-center justify-center gap-1.5 py-1.5"><Icon d="M14 5l7 7-7 7v-4c-5 0-8 1.5-10 5 .5-5.5 3-10 10-11V5z" />Share</span>
      </div>
    </article>
  );
}
