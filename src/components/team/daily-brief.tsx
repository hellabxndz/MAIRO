import Link from "next/link";
import type { Brief, BriefItem } from "@/lib/team/brief";
import { AgentIcon, timeIn } from "./agent-ui";

// The Daily Brief: what's known, from the records, in six short parts — or,
// before anything has launched, the steps left to get there.

const h = "text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-bright";

function Items({ items, empty, now, timeZone, tone = "text-white/85" }: { items: BriefItem[]; empty: string; now: Date; timeZone: string; tone?: string }) {
  if (!items.length) return <p className="mt-1.5 text-[13px] text-muted">{empty}</p>;
  return (
    <ul className="mt-1.5 space-y-2">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2.5 text-[13px] leading-relaxed">
          {it.agent ? <AgentIcon role={it.agent} size={22} /> : <span aria-hidden className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-violet-bright" />}
          <span className="min-w-0">
            {it.href ? (
              <Link href={it.href} className={`${tone} hover:underline`}>
                {it.text}
              </Link>
            ) : (
              <span className={tone}>{it.text}</span>
            )}
            {it.at && <span className="ml-1.5 text-[11.5px] text-faint">{timeIn(it.at, now, timeZone)}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function DailyBrief({ brief, now, timeZone, compact = false }: { brief: Brief; now: Date; timeZone: string; compact?: boolean }) {
  const date = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone });
  if (brief.kind === "onboarding") {
    return (
      <div>
        <p className="text-[14px] leading-relaxed text-white/85">
          Your first Daily Brief arrives after your first campaign has run — until then there are no results to report, so MAIRO won&rsquo;t show any. Here&rsquo;s what&rsquo;s left to get there:
        </p>
        <ol className="mt-3 space-y-2">
          {brief.steps.map((s, i) => (
            <li key={s.label} className="flex items-center gap-3 text-[13.5px]">
              <span aria-hidden className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${s.done ? "bg-live/15 text-live" : "bg-white/[0.07] text-muted"}`}>{s.done ? "✓" : i + 1}</span>
              {s.done ? <span className="text-muted line-through">{s.label}</span> : <Link href={s.href} className="text-white hover:underline">{s.label} →</Link>}
            </li>
          ))}
        </ol>
      </div>
    );
  }
  return (
    <div>
      <p className="text-[12px] text-faint">{date}</p>
      <div className={`mt-3 grid gap-5 ${compact ? "md:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-3"}`}>
        <section>
          <h3 className={h}>Advertising results</h3>
          <Items items={brief.results} empty="No results read yet." now={now} timeZone={timeZone} />
        </section>
        <section>
          <h3 className={h}>Important changes</h3>
          <Items items={brief.changes} empty="No important changes in the last day." now={now} timeZone={timeZone} />
        </section>
        <section>
          <h3 className={h}>Completed by your AI team</h3>
          <Items items={brief.completed} empty="Nothing finished in the last day." now={now} timeZone={timeZone} tone="text-white/80" />
        </section>
        <section>
          <h3 className={h}>Campaign issues</h3>
          <Items items={brief.issues} empty="No campaign issues." now={now} timeZone={timeZone} tone="text-warn" />
        </section>
        <section>
          <h3 className={h}>Waiting for your approval</h3>
          <p className={`mt-1.5 text-[13px] leading-relaxed ${brief.pending.count ? "text-warn" : "text-muted"}`}>{brief.pending.text}</p>
          {brief.pending.count > 0 && (
            <Link href="/dashboard/decisions" className="mt-1.5 inline-block text-[12.5px] text-violet-bright hover:underline">
              Open your Approval Center →
            </Link>
          )}
        </section>
        <section>
          <h3 className={h}>Next scheduled analysis</h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-white/85">
            {brief.next}
            {brief.nextAt ? `: ${timeIn(brief.nextAt, now, timeZone)}` : "."}
          </p>
          {brief.nextAt && <p className="mt-1 text-[11.5px] text-faint">Once a day, and again when you open MAIRO if the last review is more than 6 hours old.</p>}
        </section>
      </div>
    </div>
  );
}
