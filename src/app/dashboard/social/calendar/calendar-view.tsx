"use client";

import Image from "next/image";
import { useState } from "react";
import type { MediaItem } from "@/lib/instagram/library";
import type { CalendarPost } from "../manager-data";
import { PlatformMark, PostCard, StatusPill, TONE_CLASS } from "../post-card";

// The calendar grid. Week view shows each day's posts as cards; month view
// shows them as compact chips. Selecting one opens it in full beside the grid.

const DAY = 86_400_000;
function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * DAY).toISOString().slice(0, 10);
}
const dayName = (date: string, opts: Intl.DateTimeFormatOptions) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });

export function CalendarView({
  view,
  start,
  days,
  month,
  today,
  posts,
  library,
  instagramName,
  pageName,
}: {
  view: "week" | "month";
  start: string;
  days: number;
  month: string;
  today: string;
  posts: CalendarPost[];
  library: MediaItem[];
  instagramName: string;
  pageName: string;
}) {
  const firstOpen = posts.find((p) => p.status === "SUGGESTED" || p.status === "DRAFT") ?? posts[0] ?? null;
  const [selected, setSelected] = useState<string | null>(firstOpen?.id ?? null);
  const current = posts.find((p) => p.id === selected) ?? null;
  // Below the widest layout the full post sits under the grid; bring it into view.
  const open = (id: string) => {
    setSelected(id);
    if (typeof window !== "undefined" && window.innerWidth < 1536) {
      requestAnimationFrame(() => document.getElementById("post-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };
  const dates = Array.from({ length: days }, (_, i) => addDays(start, i));
  const byDate = new Map<string, CalendarPost[]>();
  for (const p of posts) byDate.set(p.date, [...(byDate.get(p.date) ?? []), p]);

  return (
    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="min-w-0">
        {view === "week" ? (
          <ol className="grid grid-cols-1 gap-3 md:grid-cols-7">
            {dates.map((d) => (
              <li key={d} className={`min-w-0 rounded-xl border p-2 ${d === today ? "border-violet-400/60" : "border-white/[0.07]"} bg-field/60`}>
                <p className="mb-2 px-1 text-[12px] text-faint">
                  <span className="font-semibold text-white/85">{dayName(d, { weekday: "short" })}</span> {dayName(d, { day: "numeric", month: "short" })}
                </p>
                <div className="space-y-2">
                  {(byDate.get(d) ?? []).map((p) => (
                    <button key={p.id} type="button" onClick={() => open(p.id)}
                      className={`block w-full rounded-lg border p-2 text-left transition ${selected === p.id ? "border-violet-400 bg-violet/[0.12]" : "border-white/[0.07] hover:border-white/20"}`}>
                      <span className="relative mb-1.5 block aspect-square w-full overflow-hidden rounded-md bg-white/[0.04]">
                        {p.previewUrl ? (
                          <Image src={p.previewUrl} alt="" fill unoptimized sizes="160px" className="object-cover" />
                        ) : (
                          <span className="flex h-full items-center justify-center px-2 text-center text-[10.5px] text-amber-200/80">Creative needed</span>
                        )}
                        {p.mediaType === "REEL" && <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] text-[#fff]">▶</span>}
                      </span>
                      <span className="flex items-center gap-1.5 text-[11.5px] text-white/70"><PlatformMark network={p.network} className="h-3 w-3" />{p.time}</span>
                      <span className="mt-0.5 block truncate text-[12.5px] font-medium text-white">{p.contentType}</span>
                      <span className="mt-1 block"><StatusPill post={p} /></span>
                    </button>
                  ))}
                  {(byDate.get(d) ?? []).length === 0 && <p className="px-1 pb-1 text-[11.5px] text-faint/70">—</p>}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <div className="overflow-x-auto">
            <div className="grid min-w-[640px] grid-cols-7 gap-1.5">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <p key={d} className="px-1 text-[11px] font-medium uppercase tracking-[0.12em] text-faint">{d}</p>
              ))}
              {dates.map((d) => (
                <div key={d} className={`min-h-[92px] rounded-lg border p-1.5 ${d.slice(0, 7) === month ? "bg-field/60" : "bg-transparent opacity-50"} ${d === today ? "border-violet-400/60" : "border-white/[0.06]"}`}>
                  <p className="mb-1 text-[11.5px] text-white/70">{Number(d.slice(8))}</p>
                  <div className="space-y-1">
                    {(byDate.get(d) ?? []).map((p) => (
                      <button key={p.id} type="button" onClick={() => open(p.id)} title={`${p.contentType} · ${p.statusLabel}`}
                        className={`flex w-full items-center gap-1 truncate rounded px-1.5 py-1 text-left text-[11px] ${TONE_CLASS[p.tone]} ${selected === p.id ? "ring-1 ring-violet-400" : ""}`}>
                        <PlatformMark network={p.network} className="h-3 w-3 shrink-0" />
                        <span className="truncate">{p.time} {p.contentType}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {posts.length === 0 && (
          <p className="mt-4 rounded-xl border border-dashed border-white/12 px-4 py-6 text-center text-[13.5px] text-muted">Nothing planned here yet. Use &ldquo;Plan next week&rdquo; or &ldquo;Plan the month&rdquo; above.</p>
        )}
        <p className="mt-4 flex flex-wrap gap-2 text-[11.5px] text-faint">
          Statuses:
          {(["Draft", "Awaiting approval", "Approved", "Scheduled", "Published", "Skipped"] as const).map((s) => <span key={s}>{s}</span>)}
        </p>
      </div>

      <aside id="post-detail" className="min-w-0 max-w-[560px] scroll-mt-4 2xl:sticky 2xl:top-4 2xl:max-w-none 2xl:self-start">
        {current ? (
          <PostCard key={current.id} post={current} library={library} accountName={current.network === "FACEBOOK" ? pageName : instagramName} canPost />
        ) : (
          <p className="rounded-2xl border border-dashed border-white/12 px-4 py-8 text-center text-[13px] text-muted">Select a post to see it in full.</p>
        )}
      </aside>
    </div>
  );
}
