/* eslint-disable @next/next/no-img-element -- remote blob URLs */
"use client";

import type { ReactNode } from "react";
import type { Aspect, Caption } from "@/lib/suggested-ads/video";

// MAIRO's own mock-ups of where the ad shows: the Instagram and Facebook
// feeds, Stories, Reels, and the creative on its own as a square and as 9:16.
// They show the layout — what's cut off before "more", where the button sits,
// what Reels covers, what a square crop keeps — not Meta's exact rendering,
// and every one says what it's showing: the owner's real picture or video
// (and which version), or an illustration of the layout when there's nothing
// made yet. Meta's own preview is offered beside them for pictures.

export type MockMedia =
  | { kind: "image"; url: string; version?: number | null }
  | { kind: "video"; posterUrl: string | null; aspect: Aspect; firstCaption: Caption | null; version?: number | null }
  | { kind: "none" }
  /** The website's product demonstrations only: a sample product render, never a real ad. */
  | { kind: "art"; node: ReactNode };
export type MockWords = { hook: string; body: string; cta: string };
export type Placement = "ig-feed" | "fb-feed" | "stories" | "reels" | "square" | "vertical";

export const PLACEMENTS: { id: Placement; label: string; shape: string }[] = [
  { id: "ig-feed", label: "Instagram feed", shape: "4:5" },
  { id: "fb-feed", label: "Facebook feed", shape: "4:5" },
  { id: "stories", label: "Stories", shape: "9:16" },
  { id: "reels", label: "Reels", shape: "9:16" },
  { id: "square", label: "Square", shape: "1:1" },
  { id: "vertical", label: "9:16", shape: "9:16" },
];

/** What the mock-up is made of, in words — shown under every one. */
export function mockLabel(placement: Placement, media: MockMedia): string {
  const p = PLACEMENTS.find((x) => x.id === placement)!;
  const what =
    media.kind === "art"
      ? "Product demo — a sample product render for a fictional business, in MAIRO's mock-up"
      : media.kind === "none"
      ? "Illustrative mock-up — there's no picture or video yet, so this shows the layout only"
      : media.kind === "image"
        ? `MAIRO's mock-up with your picture${media.version ? ` (version ${media.version})` : ""}`
        : `MAIRO's mock-up with a still from your video${media.version ? ` (edit version ${media.version})` : ""}`;
  const extra =
    placement === "reels"
      ? " The dashed area is covered by Reels' text and buttons."
      : placement === "square" || placement === "vertical" || placement === "stories"
        ? media.kind === "none"
          ? ""
          : ` Cropped to ${p.shape} here; Meta may crop differently — check Meta's preview.`
        : "";
  return `${what}.${extra}`;
}

const SHOWN_FB = 125;
const SHOWN_IG = 90;

function Media({ media, className }: { media: MockMedia; className: string }) {
  if (media.kind === "art") return <div className={`${className} overflow-hidden [&>img]:h-full [&>img]:w-full [&>svg]:h-full [&>svg]:w-full`}>{media.node}</div>;
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
  // Nothing made yet: a plain placeholder that can't be mistaken for a finished picture.
  return (
    <div className={`${className} flex flex-col items-center justify-center gap-1 bg-[repeating-linear-gradient(135deg,#eef0f6_0,#eef0f6_10px,#e4e7f0_10px,#e4e7f0_20px)] text-center text-[#5b6275]`}>
      <span className="rounded-full bg-[#fff]/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]">Illustration</span>
      <span className="px-6 text-[11.5px]">Your picture or video goes here</span>
    </div>
  );
}

function Avatar({ name, size = 7 }: { name: string; size?: 6 | 7 | 8 }) {
  const cls = size === 6 ? "h-6 w-6 text-[11px]" : size === 8 ? "h-8 w-8 text-[13px]" : "h-7 w-7 text-[12px]";
  return <span aria-hidden className={`flex ${cls} shrink-0 items-center justify-center rounded-full bg-[image:var(--mairo-ramp)] font-semibold text-[#fff]`}>{(name.trim()[0] ?? "M").toUpperCase()}</span>;
}

const fold = (text: string, n: number) => (text.length > n ? { shown: `${text.slice(0, n).trimEnd()}…`, folded: true } : { shown: text, folded: false });
const handle = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24) || "yourbusiness";

export function PlacementMock({ placement, media, words, businessName }: { placement: Placement; media: MockMedia; words: MockWords; businessName: string }) {
  const text = [words.hook, words.body].filter(Boolean).join(" ");

  if (placement === "ig-feed") {
    const t = fold(text, SHOWN_IG);
    return (
      <figure className="mx-auto w-full max-w-[340px] overflow-hidden rounded-2xl border bg-[#fff] text-[#111]" style={{ borderColor: "var(--mairo-line)" }}>
        <div className="flex items-center gap-2 px-3 py-2.5">
          <Avatar name={businessName} size={8} />
          <div className="min-w-0 flex-1"><p className="truncate text-[12.5px] font-semibold">{handle(businessName)}</p><p className="text-[10.5px] text-[#666]">Sponsored</p></div>
          <span aria-hidden className="text-[16px] text-[#666]">···</span>
        </div>
        <Media media={media} className="aspect-[4/5] w-full" />
        <div className="flex items-center justify-between bg-[#3f5efb] px-3 py-2 text-[12.5px] font-semibold text-[#fff]"><span>{words.cta}</span><span aria-hidden>›</span></div>
        <div aria-hidden className="flex gap-3 px-3 pt-2.5 text-[17px]"><span>♡</span><span>💬</span><span>↗</span><span className="ml-auto">⌑</span></div>
        <p className="px-3 pb-3 pt-1.5 text-[12.5px] leading-snug"><span className="font-semibold">{handle(businessName)}</span> {t.shown}{t.folded && <span className="text-[#666]"> more</span>}</p>
        <figcaption className="sr-only">How the ad sits in the Instagram feed</figcaption>
      </figure>
    );
  }

  if (placement === "fb-feed") {
    const t = fold(text, SHOWN_FB);
    return (
      <figure className="mx-auto w-full max-w-[340px] overflow-hidden rounded-2xl border bg-[#fff] text-[#111]" style={{ borderColor: "var(--mairo-line)" }}>
        <div className="flex items-center gap-2 px-3 py-2.5">
          <Avatar name={businessName} />
          <div className="min-w-0"><p className="truncate text-[12.5px] font-semibold">{businessName}</p><p className="text-[10.5px] text-[#666]">Sponsored · 🌐</p></div>
        </div>
        <p className="px-3 pb-2 text-[12.5px] leading-snug">{t.shown}{t.folded && <span className="text-[#666]"> See more</span>}</p>
        <Media media={media} className="aspect-[4/5] w-full" />
        <div className="flex items-center justify-between gap-2 bg-[#f0f2f5] px-3 py-2.5">
          <p className="line-clamp-2 text-[12.5px] font-semibold leading-snug">{words.hook.length > 40 ? `${words.hook.slice(0, 40).trimEnd()}…` : words.hook}</p>
          <span className="shrink-0 rounded-md bg-[#e4e6eb] px-3 py-1.5 text-[12px] font-semibold">{words.cta}</span>
        </div>
        <div aria-hidden className="flex justify-around border-t border-[#e4e6eb] py-2 text-[11.5px] text-[#555]"><span>👍 Like</span><span>💬 Comment</span><span>↗ Share</span></div>
        <figcaption className="sr-only">How the ad sits in the Facebook feed</figcaption>
      </figure>
    );
  }

  if (placement === "square") {
    return (
      <figure className="mx-auto w-full max-w-[320px]">
        <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-black">
          <Media media={media} className="absolute inset-0 h-full w-full" />
        </div>
        <figcaption className="sr-only">The creative as a square, for the feed and right-hand column</figcaption>
      </figure>
    );
  }

  if (placement === "vertical") {
    return (
      <figure className="relative mx-auto aspect-[9/16] w-full max-w-[250px] overflow-hidden rounded-2xl bg-black">
        <Media media={media} className="absolute inset-0 h-full w-full" />
        {/* Where Stories and Reels put their own text and buttons: keep words and faces out of these. */}
        <div aria-hidden className="absolute inset-x-0 top-0 h-[14%] border-b border-dashed border-sky-300/80 bg-sky-300/10" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-[20%] border-t border-dashed border-sky-300/80 bg-sky-300/10" />
        <span className="absolute left-2 top-[15%] rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-[#fff]">Safe area</span>
        <figcaption className="sr-only">The creative as 9:16; the dashed bands are where Stories and Reels place their own text and buttons</figcaption>
      </figure>
    );
  }

  const reels = placement === "reels";
  return (
    <figure className="relative mx-auto aspect-[9/16] w-full max-w-[250px] overflow-hidden rounded-2xl bg-black text-[#fff]">
      <Media media={media} className="absolute inset-0 h-full w-full" />
      {!reels && (
        <div aria-hidden className="absolute inset-x-3 top-2 flex gap-1">
          <span className="h-[2px] flex-1 rounded bg-[#fff]/90" /><span className="h-[2px] flex-1 rounded bg-[#fff]/40" />
        </div>
      )}
      <div className="absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/60 to-transparent px-3 pb-6 pt-4">
        <Avatar name={businessName} size={6} />
        <p className="truncate text-[12px] font-semibold">{businessName} <span className="font-normal opacity-75">· Sponsored</span></p>
      </div>
      {reels && <div aria-hidden className="absolute inset-x-0 bottom-0 h-[22%] border-t border-dashed border-amber-300/80 bg-amber-300/10" />}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-3 pt-10">
        <p className="line-clamp-2 text-[12px] leading-snug">{text}</p>
        {reels ? (
          <span className="mt-2 block rounded-md bg-[#fff]/20 py-1.5 text-center text-[12px] font-semibold backdrop-blur">{words.cta}</span>
        ) : (
          <span className="mt-2 flex flex-col items-center text-[12px] font-semibold"><span aria-hidden>︿</span><span className="rounded-full bg-[#fff] px-4 py-1.5 text-[#111]">{words.cta}</span></span>
        )}
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
