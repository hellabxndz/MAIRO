import Link from "next/link";
import type { DecisionTrail } from "@/lib/team/trail-store";
import { actorName, type TrailActor, type TrailStep } from "@/lib/team/trail";
import { AgentIcon, timeIn } from "./agent-ui";

// One recommendation's trail: a chain of who took part — specialists, you,
// Meta — and, under it, what each one did and when, from the records.

function Actor({ who, size = 30 }: { who: TrailActor; size?: number }) {
  if (who === "OWNER" || who === "META") {
    return (
      <span aria-hidden className={`flex shrink-0 items-center justify-center rounded-2xl text-[10.5px] font-semibold ${who === "OWNER" ? "bg-warn/15 text-warn" : "bg-blue/10 text-blue-bright"}`} style={{ width: size, height: size }}>
        {who === "OWNER" ? "You" : "Meta"}
      </span>
    );
  }
  return <AgentIcon role={who} size={size} />;
}

/** The chain: each participant once, in the order they took part. */
export function TrailChain({ steps }: { steps: TrailStep[] }) {
  const chain = steps.filter((s, i) => i === 0 || steps[i - 1].who !== s.who);
  return (
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2" aria-label="Who took part, in order">
      {chain.map((s, i) => (
        <li key={i} className="flex items-center gap-1.5">
          <span className={`flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 ${s.state === "waiting" ? "bg-warn/[0.08]" : s.state === "failed" ? "bg-alert/[0.08]" : "bg-white/[0.04]"}`}>
            <Actor who={s.who} size={22} />
            <span className="text-[11.5px] font-medium text-white/85">{actorName(s.who)}</span>
          </span>
          {i < chain.length - 1 && (
            <svg aria-hidden viewBox="0 0 16 10" className="h-2.5 w-3.5 text-violet-bright/60">
              <path d="M0 5h13m-4-4 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          )}
        </li>
      ))}
    </ol>
  );
}

export function TrailSteps({ steps, now, timeZone }: { steps: TrailStep[]; now: Date; timeZone?: string }) {
  return (
    <ol className="space-y-2.5">
      {steps.map((s, i) => (
        <li key={i} className="flex items-start gap-2.5">
          <Actor who={s.who} size={24} />
          <div className="min-w-0 text-[12.5px] leading-relaxed">
            <p className="text-faint">
              {actorName(s.who)}
              {s.at ? ` · ${timeIn(s.at, now, timeZone)}` : s.state === "waiting" ? " · next" : ""}
            </p>
            <p className={s.state === "failed" ? "text-alert" : s.state === "waiting" ? "text-warn" : "text-white/85"}>{s.did}</p>
            {s.detail && <p className="mt-0.5 whitespace-pre-wrap text-[11.5px] text-muted">{s.detail}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

const STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Waiting for your approval", cls: "bg-warn/15 text-warn" },
  APPLIED: { label: "Carried out on Meta", cls: "bg-live/15 text-live" },
  FAILED: { label: "Meta refused it", cls: "bg-alert/15 text-alert" },
  REJECTED: { label: "You declined it", cls: "bg-white/[0.07] text-muted" },
};

/** A recommendation's trail as a card, for the AI Team screen. */
export function TrailCard({ trail, now, timeZone }: { trail: DecisionTrail; now: Date; timeZone?: string }) {
  const st = STATUS[trail.status] ?? { label: trail.status, cls: "bg-white/[0.07] text-muted" };
  return (
    <article className="rounded-[22px] border border-[color:var(--mairo-line)] p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.label}</span>
        <span className="text-[11.5px] text-faint">{timeIn(trail.createdAt, now, timeZone)}</span>
      </div>
      <p className="mt-2 text-[14.5px] font-medium text-white">{trail.title}</p>
      <div className="mt-3">
        <TrailChain steps={trail.steps} />
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-[12.5px] text-muted hover:text-white">What each one did</summary>
        <div className="mt-3">
          <TrailSteps steps={trail.steps} now={now} timeZone={timeZone} />
        </div>
      </details>
      <Link href={`/dashboard/decisions${trail.status === "APPLIED" ? "?f=completed" : trail.status === "REJECTED" ? "?f=rejected" : ""}#d-${trail.decisionId}`} className="mt-3 inline-block text-[12.5px] text-violet-bright hover:underline">
        Open the recommendation and its evidence →
      </Link>
    </article>
  );
}
