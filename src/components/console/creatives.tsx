"use client";

import type { ReactNode } from "react";
import { Go, Panel, Pill, type PillTone } from "./kit";

// Creatives: the ads running now and the directions MAIRO suggests next.
// Each tile says exactly what it is — a picture in a live ad, a picture made
// for a direction, or a concept that hasn't been made into a picture yet —
// so a suggestion is never mistaken for a finished ad.

export type CreativeTileData = {
  key: string;
  headline: string;
  caption: string;
  /** What the tile is. "concept" has no picture yet. */
  kind: "live" | "approved" | "draft" | "concept";
  imageUrl: string | null;
  /** A demonstration's drawn illustration in place of a picture — only ever sample artwork. */
  art?: ReactNode;
  label: string;
  href?: string | null;
};

const KIND: Record<CreativeTileData["kind"], { tone: PillTone; word: string }> = {
  live: { tone: "live", word: "In a live ad" },
  approved: { tone: "blue", word: "Approved" },
  draft: { tone: "violet", word: "Draft" },
  concept: { tone: "muted", word: "Concept" },
};

export function CreativeTile({ c }: { c: CreativeTileData }) {
  const k = KIND[c.kind];
  return (
    <Go href={c.href} className="group block min-w-0">
      <div className="relative aspect-[4/5] overflow-hidden rounded-[18px] border transition group-hover:border-[color:var(--mairo-line-lit)]" style={{ borderColor: "var(--mairo-line)" }}>
        {c.art ? (
          <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full">{c.art}</div>
        ) : c.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.imageUrl} alt="" className="h-full w-full object-cover transition duration-500 [transition-timing-function:var(--ease-mairo)] group-hover:scale-[1.03]" loading="lazy" />
        ) : (
          // A concept: its words on the brand's night, clearly not a photograph.
          <div className="flex h-full flex-col justify-end bg-[radial-gradient(120%_80%_at_80%_0%,rgba(47,107,255,0.45),transparent_60%),radial-gradient(90%_70%_at_0%_100%,rgba(53,108,255,0.35),transparent_60%),#0e1122] p-3.5">
            <span className="mb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-white/55">No picture yet</span>
            <p className="text-[14px] font-semibold leading-snug text-white [text-wrap:balance]">{c.headline}</p>
          </div>
        )}
        <span className="absolute left-2.5 top-2.5">
          <Pill tone={k.tone} className="bg-[#07080d]/80">
            {k.word}
          </Pill>
        </span>
      </div>
      <p className="mt-2 truncate text-[13px] font-medium text-white">{c.imageUrl || c.art ? c.headline : c.label}</p>
      <p className="truncate text-[12px] text-faint">{c.caption}</p>
    </Go>
  );
}

export function CreativesPanel({ items, allHref, emptyText, note }: { items: CreativeTileData[]; allHref?: string | null; emptyText: string; note?: string | null }) {
  return (
    <Panel id="creatives-panel" title="Creatives" action={{ href: allHref, label: "Creative Studio" }}>
      {items.length === 0 ? (
        <p className="text-[13.5px] text-muted">{emptyText}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 @[22rem]:grid-cols-3 @3xl:grid-cols-4">
          {items.slice(0, 4).map((c) => (
            <CreativeTile key={c.key} c={c} />
          ))}
        </div>
      )}
      {note && <p className="mt-4 text-[12px] text-faint">{note}</p>}
    </Panel>
  );
}
