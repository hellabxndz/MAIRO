import Link from "next/link";
import type { DecisionView } from "@/lib/decisions/store";
import type { DecisionCategory } from "@/generated/prisma/enums";
import { CATEGORY_TONE } from "@/components/decisions/labels";
import { PANEL } from "./format";

// MAIRO's open decisions, on the dashboard. The same rows the Decisions screen
// shows — approving, rejecting and the full reasoning live there, so each one
// here links through rather than acting on a summary.

const ICON: Record<DecisionCategory, React.ReactNode> = {
  NEEDS_ATTENTION: <path d="M12 4 2.8 19.5h18.4zM12 10v4.5M12 17.2v.3" />,
  GROWTH: <path d="M4 17l5.5-5.5 3.5 3.5L20 8M15 8h5v5" />,
  CREATIVE: <path d="M4 5h16v14H4zM4 15l4.5-4.5 4 4 2.5-2.5L20 17M15.5 9.5a1 1 0 1 0 0-.01" />,
  BUDGET: <path d="M5 19v-6M10 19V9M15 19v-9M20 19V5" />,
  AUDIENCE: <path d="M9 8.5a3.2 3.2 0 1 0 0-.01M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5M16 5.8a3 3 0 0 1 0 5.6M18 14.4c1.6.6 2.6 2.2 2.6 4.6" />,
  RETARGETING: <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4" />,
  WEBSITE: <path d="M3.5 5h17v14h-17zM3.5 9h17M6.5 7h.01M9 7h.01" />,
  TESTING: <path d="M9 3h6M10 3v6L4.5 19a1.3 1.3 0 0 0 1.2 2h12.6a1.3 1.3 0 0 0 1.2-2L14 9V3" />,
};

function Tile({ category, size = "md" }: { category: DecisionCategory; size?: "md" | "lg" }) {
  const tone = CATEGORY_TONE[category];
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-xl ${size === "lg" ? "h-12 w-12" : "h-10 w-10"}`}
      style={{ background: `${tone}22`, color: tone }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
        {ICON[category]}
      </svg>
    </span>
  );
}

const SPARK = (
  <svg viewBox="0 0 16 16" className="h-4 w-4 fill-[#a78bfa]" aria-hidden>
    <path d="M8 0c.4 3.8 2.2 5.6 6 6-3.8.4-5.6 2.2-6 6-.4-3.8-2.2-5.6-6-6 3.8-.4 5.6-2.2 6-6z" transform="translate(0 2)" />
  </svg>
);

function Nothing({ checkedAt }: { checkedAt: string | null }) {
  return (
    <p className="text-[13px] leading-relaxed text-muted">
      Nothing worth changing right now — MAIRO looks again every day.
      {checkedAt && <span className="block text-faint">Last looked {checkedAt}.</span>}
    </p>
  );
}

/** Advanced: a compact list beside the chart. */
export function InsightsList({ items, total, checkedAt }: { items: DecisionView[]; total: number; checkedAt: string | null }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[16px] font-semibold text-white">
          {SPARK} MAIRO insights
        </h2>
        <Link href="/dashboard/decisions" className="text-[12.5px] text-violet-bright hover:text-white">
          View all{total > items.length ? ` ${total}` : ""} →
        </Link>
      </div>
      <div className="mt-4 flex-1">
        {items.length === 0 ? (
          <Nothing checkedAt={checkedAt} />
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {items.map((d) => (
              <li key={d.id}>
                <Link href="/dashboard/decisions" className="group flex items-start gap-3 py-3 first:pt-0">
                  <Tile category={d.category} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-medium text-white">{d.title}</span>
                    <span className="mt-0.5 line-clamp-2 block text-[12.5px] leading-snug text-muted">{d.noticedAdvanced || d.noticed}</span>
                  </span>
                  <span aria-hidden className="mt-2 text-faint transition group-hover:translate-x-0.5 group-hover:text-white">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const ACTION_WORD: Record<string, string> = {
  "set-budget": "Review budget",
  "pause-ad": "Review ad",
  "new-ad-variation": "Fix with MAIRO",
  "widen-audience": "Review audience",
  guide: "See details",
};

/** Simple: three cards across, each with one button. */
export function Recommendations({ items, total, checkedAt }: { items: DecisionView[]; total: number; checkedAt: string | null }) {
  return (
    <section className={`${PANEL} p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[17px] font-semibold text-white">
          {SPARK} What MAIRO recommends
        </h2>
        <Link href="/dashboard/decisions" className="text-[13px] text-violet-bright hover:text-white">
          View all recommendations{total > items.length ? ` (${total})` : ""} →
        </Link>
      </div>
      {items.length === 0 ? (
        <div className="mt-4">
          <Nothing checkedAt={checkedAt} />
        </div>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {items.map((d) => {
            const tone = CATEGORY_TONE[d.category];
            return (
              <div key={d.id} className="flex gap-3.5 rounded-xl border p-4" style={{ borderColor: `${tone}33`, background: `${tone}0d` }}>
                <Tile category={d.category} size="lg" />
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold leading-snug text-white">{d.title}</p>
                  <p className="mt-1 line-clamp-3 text-[12.5px] leading-snug text-muted">{d.noticed}</p>
                  <Link
                    href="/dashboard/decisions"
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#7c5cff] px-3 py-1.5 text-[12px] font-medium text-white transition hover:brightness-110"
                  >
                    {ACTION_WORD[d.changes[0]?.type ?? "guide"] ?? "See details"} <span aria-hidden>→</span>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
