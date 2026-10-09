import Link from "next/link";
import type { ReactNode } from "react";
import type { AgentRole } from "@/generated/prisma/enums";
import { AGENT, agentForDecision } from "@/lib/team/agents";
import type { TeamView } from "@/lib/team/store";
import type { DecisionView } from "@/lib/decisions/store";
import { budgetImpact } from "@/lib/decisions/approval";
import type { OtherApproval } from "@/lib/approvals/queue";
import { AgentIcon, StatePill, timeIn } from "@/components/team/agent-ui";
import { RISK_LABEL } from "@/components/decisions/labels";

// The home screen's sections: your AI advertising team at a glance, what it
// did recently, and what's waiting for your approval. Each section has one
// job and one way through to the full screen; every line comes from a record.

const eyebrow = "text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-bright";
const surface = { background: "linear-gradient(180deg, rgba(var(--mairo-fg-rgb),0.035), rgba(var(--mairo-fg-rgb),0.015))" };

export function HomeSection({ id, title, action, children, tint = false }: { id: string; title: string; action?: { href: string; label: string }; children: ReactNode; tint?: boolean }) {
  return (
    <section aria-labelledby={id} className="rounded-[28px] p-6 sm:p-7" style={tint ? { background: "linear-gradient(160deg, rgba(124,92,255,0.10), rgba(var(--mairo-fg-rgb),0.015) 60%)" } : surface}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id={id} className={eyebrow}>{title}</h2>
        {action && (
          <Link href={action.href} className="text-[13px] text-muted hover:text-white">
            {action.label} →
          </Link>
        )}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** 2. Your AI Advertising Team — each specialist's verified state. */
export function TeamStrip({ team }: { team: TeamView }) {
  return (
    <>
      <p className="max-w-[760px] text-[14px] leading-relaxed text-white/85">{team.welcome}</p>
      <ul className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {team.statuses.map((s) => (
          <li key={s.role}>
            <Link href={`/dashboard/team?agent=${s.role}#activity`} className="flex h-full items-start gap-3 rounded-2xl border border-[color:var(--mairo-line)] p-3 transition hover:border-[color:var(--mairo-line-lit)]">
              <AgentIcon role={s.role} size={32} />
              <span className="min-w-0">
                <span className="block text-[13.5px] font-medium text-white">{AGENT[s.role].name}</span>
                <span className="mt-1 block">
                  <StatePill status={s} />
                </span>
                {s.current && <span className="mt-1 block text-[11.5px] text-violet-bright">{s.current}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

/** 3. What MAIRO did recently — finished work only, newest first. */
export function RecentWork({ team, now }: { team: TeamView; now: Date }) {
  const items = team.feed.filter((f) => f.status !== "RUNNING").slice(0, 5);
  if (!items.length) {
    return <p className="text-[14px] text-muted">Nothing yet. As soon as your team does something — reads your website, writes your plan, builds or checks a campaign — it shows here.</p>;
  }
  return (
    <ul className="space-y-3">
      {items.map((f) => (
        <li key={f.id} className="flex items-start gap-3">
          <AgentIcon role={f.agent} size={28} />
          <p className="min-w-0 text-[13.5px] leading-relaxed">
            <span className="text-faint">
              {AGENT[f.agent].name} · {timeIn(f.at, now, team.timeZone)}
              {f.status === "FAILED" ? " · didn't finish" : ""}
            </span>
            <br />
            {f.href ? (
              <Link href={f.href} className={`${f.status === "FAILED" ? "text-alert" : "text-white/85"} hover:underline`}>
                {f.summary}
              </Link>
            ) : (
              <span className={f.status === "FAILED" ? "text-alert" : "text-white/85"}>{f.summary}</span>
            )}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** 4. Recommendations awaiting approval — the first few, each with its budget impact. */
export function ApprovalsPreview({ decisions, others }: { decisions: DecisionView[]; others: OtherApproval[] }) {
  const launches = others.filter((o) => o.kind === "launch");
  const rest = others.filter((o) => o.kind !== "launch");
  const rows: { key: string; role: AgentRole; title: string; budget: string; risk: string | null; href: string; money: boolean }[] = [
    ...launches.map((o) => ({ key: o.key, role: o.agent, title: o.title, budget: o.budget, risk: null, href: "/dashboard/decisions", money: true })),
    ...decisions.map((d) => {
      const b = budgetImpact(d.changes);
      return { key: d.id, role: agentForDecision(d.kind, d.category), title: d.title, budget: b.text, risk: RISK_LABEL[d.risk], href: `/dashboard/decisions#d-${d.id}`, money: b.direction === "up" };
    }),
    ...rest.map((o) => ({ key: o.key, role: o.agent, title: o.title, budget: o.budget, risk: null, href: o.href, money: false })),
  ].slice(0, 3);
  const total = decisions.length + others.length;
  if (!total) return <p className="text-[14px] text-muted">Nothing is waiting for your approval. When your team recommends a change, it waits here — nothing changes on Meta until you approve it.</p>;
  return (
    <>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.key}>
            <Link href={r.href} className="flex items-start gap-3 rounded-2xl border border-[color:var(--mairo-line)] p-3.5 transition hover:border-[color:var(--mairo-line-lit)]">
              <AgentIcon role={r.role} size={28} />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium text-white">{r.title}</span>
                <span className="mt-0.5 block text-[12px] text-faint">From your {AGENT[r.role].name}{r.risk ? ` · ${r.risk}` : ""}</span>
                <span className={`mt-1 block text-[12.5px] ${r.money ? "text-warn" : "text-muted"}`}>{r.budget}</span>
              </span>
              <span className="shrink-0 self-center text-[12.5px] text-violet-bright">Review →</span>
            </Link>
          </li>
        ))}
      </ul>
      {total > rows.length && <p className="mt-3 text-[12.5px] text-muted">{total - rows.length} more in your Approval Center.</p>}
    </>
  );
}
