import Link from "next/link";
import type { AgentRole } from "@/generated/prisma/enums";
import { AGENT } from "@/lib/team/agents";
import type { AgentState, AgentStatus } from "@/lib/team/status";
import type { FeedItem } from "@/lib/team/store";

// The AI Team's pieces: an icon per specialty, the agent card, and one line
// of activity. Drawn, not imported — eight small glyphs aren't worth a
// dependency.

const GLYPH: Record<AgentRole, string> = {
  STRATEGIST: "M10 3l2 4.5 4.8.4-3.7 3.2 1.1 4.7L10 13.4 5.8 15.8l1.1-4.7L3.2 7.9 8 7.5z",
  AUDIENCE: "M7 9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM13.5 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM2.5 16c.4-2.6 2.3-4.2 4.5-4.2s4.1 1.6 4.5 4.2M11.5 12.3c.6-.3 1.3-.5 2-.5 1.9 0 3.5 1.4 3.9 3.7",
  CREATIVE: "M4 15.5l2.6-.6L15.3 6.2a1.5 1.5 0 0 0-2.1-2.1L4.6 12.8zM12 5.3l2.1 2.1M3.5 3.5h3M5 2v3",
  ARCHITECT: "M3 16.5h14M5 16.5V9l5-4 5 4v7.5M8.2 16.5v-4h3.6v4",
  OPTIMIZER: "M3 14.5l4-4 3 3 6-6.5M12.5 7h3.5v3.5",
  GUARDIAN: "M10 2.8l6 2.4v4.3c0 3.7-2.6 6.2-6 7.7-3.4-1.5-6-4-6-7.7V5.2zM7.4 10l1.8 1.8 3.5-3.6",
  ANALYST: "M4 16V10M8 16V6M12 16v-4M16 16V4",
  GROWTH: "M10 17V8M10 8c0-3 2.2-5 5-5 0 3-2.2 5-5 5zM10 11c0-2.4-1.8-4-4-4 0 2.4 1.8 4 4 4z",
};

export function AgentIcon({ role, size = 40 }: { role: AgentRole; size?: number }) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-2xl"
      style={{ width: size, height: size, background: "linear-gradient(140deg, #7c5cff, #4f6bff)", boxShadow: "0 6px 16px -8px rgba(124,92,255,0.7)" }}
    >
      <svg viewBox="0 0 20 20" width={size * 0.5} height={size * 0.5} fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d={GLYPH[role]} />
      </svg>
    </span>
  );
}

const TONE: Record<AgentState, { dot: string; text: string; pulse?: boolean }> = {
  WORKING: { dot: "#a78bfa", text: "text-violet-200", pulse: true },
  MONITORING: { dot: "#34d399", text: "text-emerald-200" },
  WAITING: { dot: "#fbbf24", text: "text-amber-200" },
  COMPLETED: { dot: "#60a5fa", text: "text-blue-200" },
  ATTENTION: { dot: "#fb923c", text: "text-orange-200" },
  IDLE: { dot: "rgba(var(--mairo-fg-rgb),0.35)", text: "text-white/60" },
  CONNECT: { dot: "#fbbf24", text: "text-amber-200" },
  ERROR: { dot: "#f87171", text: "text-red-200" },
};

export function StatePill({ status }: { status: AgentStatus }) {
  const t = TONE[status.state];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full bg-white/[0.05] px-2.5 py-1 text-[11.5px] ${t.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${t.pulse ? "motion-safe:animate-pulse" : ""}`} style={{ background: t.dot }} />
      {status.label}
    </span>
  );
}

const time = (d: Date, now: Date) => {
  const sameDay = d.toDateString() === now.toDateString();
  const t = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return sameDay ? t : `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${t}`;
};

export function AgentCard({ status, pending, contribution, now }: { status: AgentStatus; pending: number; contribution: string | null; now: Date }) {
  const info = AGENT[status.role];
  const action =
    status.state === "CONNECT"
      ? { href: "/dashboard/meta", label: "Connect Meta" }
      : pending > 0
        ? { href: "/dashboard/decisions", label: `Review ${pending === 1 ? "recommendation" : `${pending} recommendations`}` }
        : null;
  return (
    <article className="flex flex-col rounded-[24px] p-5" style={{ background: "linear-gradient(180deg, rgba(var(--mairo-fg-rgb),0.04), rgba(var(--mairo-fg-rgb),0.015))", boxShadow: "inset 0 0 0 1px rgba(var(--mairo-fg-rgb),0.05)" }}>
      <div className="flex items-start gap-3">
        <AgentIcon role={status.role} />
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-medium text-white">{info.name}</h3>
          <p className="text-[12.5px] text-muted">{info.specialty}</p>
        </div>
      </div>
      <div className="mt-4">
        <StatePill status={status} />
        <p className="mt-2 text-[13px] leading-relaxed text-white/80">{status.line}</p>
        {status.current && <p className="mt-1 text-[12.5px] text-violet-200">Now: {status.current}</p>}
      </div>
      {status.lastDone && (
        <div className="mt-3 rounded-xl bg-white/[0.03] px-3 py-2">
          <p className="text-[11px] text-faint">Last finished · {time(status.lastDone.at, now)}</p>
          <p className="mt-0.5 line-clamp-3 text-[12.5px] text-white/85">{status.lastDone.summary}</p>
        </div>
      )}
      {contribution && <p className="mt-3 text-[12px] text-muted">This month: {contribution}</p>}
      <div className="mt-auto flex flex-wrap items-center gap-3 pt-4">
        {action && (
          <Link href={action.href} className="rounded-full bg-[image:var(--mairo-ramp)] px-3.5 py-1.5 text-[12.5px] font-medium text-white">
            {action.label}
          </Link>
        )}
        <Link href={`/dashboard/team?agent=${status.role}#activity`} className="text-[12.5px] text-muted hover:text-white">
          View activity →
        </Link>
      </div>
    </article>
  );
}

const STATUS_WORD: Record<FeedItem["status"], string> = { RUNNING: "working", DONE: "", NOTHING: "", FAILED: "didn't finish" };

export function FeedLine({ item, now }: { item: FeedItem; now: Date }) {
  const info = AGENT[item.agent];
  const body = (
    <div className="flex items-start gap-3">
      <AgentIcon role={item.agent} size={30} />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] text-faint">
          {time(item.at, now)} · {info.name}
          {STATUS_WORD[item.status] ? ` · ${STATUS_WORD[item.status]}` : ""}
        </p>
        <p className={`mt-0.5 text-[13.5px] leading-relaxed ${item.status === "FAILED" ? "text-red-200" : item.status === "NOTHING" ? "text-white/65" : "text-white/90"}`}>{item.summary}</p>
      </div>
    </div>
  );
  if (!item.detail && !item.href) return <li className="px-3 py-3">{body}</li>;
  return (
    <li>
      <details className="group rounded-2xl px-3 py-3 transition hover:bg-white/[0.03]">
        <summary className="cursor-pointer list-none">{body}</summary>
        <div className="ml-[42px] mt-2 space-y-2">
          {item.detail && <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-muted">{item.detail}</p>}
          {item.href && (
            <Link href={item.href} className="inline-block text-[12.5px] text-violet-bright hover:text-white">
              See it →
            </Link>
          )}
        </div>
      </details>
    </li>
  );
}
