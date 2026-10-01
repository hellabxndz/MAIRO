import Link from "next/link";
import type { MissionActivity, Recommendation } from "@/lib/mission/store";
import type { ResultTile } from "@/lib/mission/goals";

// The mission at a glance, in the order an owner asks: what are we trying to
// do, what is MAIRO doing, what happened, what did MAIRO learn, what's next.

const panel = "rounded-2xl border border-white/[0.07] bg-[#0b1122]/80 p-5";

export function MissionHeadline({ title, sentence, strategy, secondary }: { title: string; sentence: string; strategy?: string; secondary?: string | null }) {
  return (
    <div>
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-violet-bright">Current MAIRO mission</p>
      <h2 className="mt-1 flex items-center gap-2 text-[24px] font-semibold text-white">
        <span aria-hidden>🎯</span>{title}
      </h2>
      <p className="mt-1 text-[14.5px] text-white/80">{sentence}</p>
      {strategy && <p className="mt-2 max-w-[760px] text-[13.5px] text-muted">{strategy}</p>}
      {secondary && <p className="mt-1 text-[12.5px] text-faint">Secondary goal: {secondary}</p>}
    </div>
  );
}

export function DoingNow({ activity }: { activity: MissionActivity }) {
  const items = [
    `${activity.campaignsRunning} campaign${activity.campaignsRunning === 1 ? "" : "s"} running`,
    `${activity.creativesTesting} ad creative${activity.creativesTesting === 1 ? "" : "s"} being tested`,
    activity.socialScheduled !== null ? `Scale: ${activity.socialScheduled} social post${activity.socialScheduled === 1 ? "" : "s"} planned this week` : null,
    activity.promotionsActive ? `${activity.promotionsActive} promotion${activity.promotionsActive === 1 ? "" : "s"} running` : null,
  ].filter(Boolean) as string[];
  return (
    <section className={panel}>
      <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-violet-bright">What MAIRO is doing</h3>
      <ul className="mt-2 space-y-1.5 text-[14px] text-white/90">
        {items.map((i) => <li key={i}>{i}</li>)}
      </ul>
    </section>
  );
}

export function GoalResults({ tiles, days, hasData }: { tiles: ResultTile[]; days: number; hasData: boolean }) {
  return (
    <section className={panel}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-violet-bright">Results for your goal</h3>
        <span className="text-[12px] text-faint">Last {days} days</span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="min-w-0" title={t.hint}>
            <dt className="text-[12px] text-muted">{t.label}</dt>
            <dd className={`mt-0.5 tabular-nums ${t.value === null ? "text-[13px] text-faint" : "text-[22px] font-semibold text-white"}`}>{t.value ?? "Not tracked yet"}</dd>
          </div>
        ))}
      </dl>
      {!hasData && <p className="mt-3 text-[12.5px] text-faint">Results appear once a campaign has been running for a day or two.</p>}
    </section>
  );
}

export function Learned({ items }: { items: { learned: string; adjusted: string }[] }) {
  return (
    <section className={panel}>
      <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-violet-bright">MAIRO learned</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-[13.5px] text-muted">Nothing certain yet. MAIRO needs a few days of results before it draws conclusions — and it won&rsquo;t guess.</p>
      ) : (
        <ul className="mt-2 space-y-3">
          {items.map((i) => (
            <li key={i.learned}>
              <p className="text-[14px] text-white/90">&ldquo;{i.learned}&rdquo;</p>
              <p className="mt-0.5 text-[12.5px] text-emerald-300/90"><span className="font-semibold">MAIRO adjusted: </span>{i.adjusted}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function NextActions({ items, fallback }: { items: Recommendation[]; fallback: string }) {
  return (
    <section className={panel}>
      <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-violet-bright">Next</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-[14px] text-white/85">{fallback}</p>
      ) : (
        <ul className="mt-2 space-y-3">
          {items.map((r) => (
            <li key={r.title} className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-[14px] font-medium text-white">{r.title}</p>
                <p className="text-[13px] text-white/75">{r.text}</p>
              </div>
              <Link href={r.href} className="shrink-0 rounded-lg border border-white/12 px-3 py-1.5 text-[12.5px] text-white/85 hover:border-white/30">{r.label}</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
