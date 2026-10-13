/* eslint-disable @next/next/no-img-element -- remote blob URLs */
"use client";

import type { Aspect, Caption } from "@/lib/suggested-ads/video";

// MAIRO's own mock-ups of where the ad shows: the feed, Stories and Reels.
// They show the layout — what's cut off, where the button sits, what Reels
// covers — not Meta's exact rendering, and they're labelled that way. Meta's
// own preview is offered beside them for pictures.

export type MockMedia = { kind: "image"; url: string } | { kind: "video"; posterUrl: string | null; aspect: Aspect; firstCaption: Caption | null } | { kind: "none" };
export type MockWords = { hook: string; body: string; cta: string };
export type Placement = "feed" | "stories" | "reels";

export const PLACEMENTS: { id: Placement; label: string }[] = [
  { id: "feed", label: "Feed" },
  { id: "stories", label: "Stories" },
  { id: "reels", label: "Reels" },
];

const SHOWN = 125;

function Media({ media, className }: { media: MockMedia; className: string }) {
  if (media.kind === "image") return <img src={media.url} alt="" className={`${className} object-cover`} />;
  if (media.kind === "video") {
    return (
      <div className={`${className} relative bg-black`}>
        {media.posterUrl && <img src={media.posterUrl} alt="" className="h-full w-full object-cover" />}
        <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10.5px] text-[#fff]">▶ Video</span>
        {media.firstCaption && <p className="absolute inset-x-3 top-[14%] mx-auto w-fit rounded-md bg-black/75 px-2 py-1 text-center text-[11.5px] font-semibold text-[#fff]">{media.firstCaption.text}</p>}
      </div>
    );
  }
  return <div className={`${className} flex items-center justify-center bg-white/[0.05] text-[12px] text-muted`}>No picture yet</div>;
}

function Avatar({ name }: { name: string }) {
  return <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[image:var(--mairo-ramp)] text-[12px] font-semibold text-[#fff]">{(name.trim()[0] ?? "M").toUpperCase()}</span>;
}

export function PlacementMock({ placement, media, words, businessName }: { placement: Placement; media: MockMedia; words: MockWords; businessName: string }) {
  const text = [words.hook, words.body].filter(Boolean).join(" ");
  const folded = text.length > SHOWN;
  if (placement === "feed") {
    return (
      <figure className="mx-auto w-full max-w-[340px] overflow-hidden rounded-2xl border bg-[#fff] text-[#111]" style={{ borderColor: "var(--mairo-line)" }}>
        <div className="flex items-center gap-2 px-3 py-2.5">
          <Avatar name={businessName} />
          <div className="min-w-0"><p className="truncate text-[12.5px] font-semibold">{businessName}</p><p className="text-[10.5px] text-[#666]">Sponsored</p></div>
        </div>
        <p className="px-3 pb-2 text-[12.5px] leading-snug">{folded ? `${text.slice(0, SHOWN).trimEnd()}… ` : text}{folded && <span className="text-[#666]">See more</span>}</p>
        <Media media={media} className="aspect-[4/5] w-full" />
        <div className="flex items-center justify-between gap-2 bg-[#f0f2f5] px-3 py-2.5">
          <p className="line-clamp-2 text-[12.5px] font-semibold leading-snug">{words.hook.length > 40 ? `${words.hook.slice(0, 40).trimEnd()}…` : words.hook}</p>
          <span className="shrink-0 rounded-md bg-[#e4e6eb] px-3 py-1.5 text-[12px] font-semibold">{words.cta}</span>
        </div>
        <figcaption className="sr-only">How the ad sits in the Facebook and Instagram feed</figcaption>
      </figure>
    );
  }
  const reels = placement === "reels";
  return (
    <figure className="relative mx-auto aspect-[9/16] w-full max-w-[260px] overflow-hidden rounded-2xl bg-black text-[#fff]">
      <Media media={media} className="absolute inset-0 h-full w-full" />
      <div className="absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/60 to-transparent px-3 pb-6 pt-3">
        <Avatar name={businessName} />
        <p className="truncate text-[12px] font-semibold">{businessName} <span className="font-normal opacity-75">· Sponsored</span></p>
      </div>
      {reels && <div aria-hidden className="absolute bottom-0 inset-x-0 h-[22%] border-t border-dashed border-amber-300/80 bg-amber-300/10" />}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-3 pt-10">
        <p className="line-clamp-2 text-[12px] leading-snug">{text}</p>
        <span className="mt-2 block rounded-full bg-[#fff] py-1.5 text-center text-[12px] font-semibold text-[#111]">{words.cta}</span>
      </div>
      {reels && (
        <div aria-hidden className="absolute right-2 top-[42%] flex flex-col gap-3 text-[16px] opacity-90">
          <span>♡</span><span>💬</span><span>↗</span>
        </div>
      )}
      <figcaption className="sr-only">{reels ? "How the ad sits in Reels; the dashed area is covered by Reels' text and buttons" : "How the ad sits in Stories"}</figcaption>
    </figure>
  );
}
