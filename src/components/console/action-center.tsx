"use client";

import type { ReactNode } from "react";
import type { AgentRole } from "@/generated/prisma/enums";
import { AGENT } from "@/lib/team/agents";
import { AgentIcon } from "@/components/team/agent-ui";
import { Go, Panel, Pill, primaryAction } from "./kit";

// The AI Action Center: the few things MAIRO most wants the owner to look at
// — a recommendation to approve, a launch waiting, a tracking problem, new
// creative directions — each with who on the AI team raised it, why, what it
// does to spending, and the controls to act on it. Nothing here changes an
// account until the owner approves it.

export type ActionKind = "creative" | "audience" | "budget" | "tracking" | "launch" | "setup" | "website" | "other";

export type ActionItemData = {
  key: string;
  agent: AgentRole;
  kind: ActionKind;
  title: string;
  /** One or two plain sentences: what MAIRO noticed and why it matters. */
  why: string;
  impact: { text: string; up: boolean } | null;
  risk: string | null;
  href?: string | null;
  cta: string;
  urgent?: boolean;
};

const KIND_LABEL: Record<ActionKind, string> = {
  creative: "Creative",
  audience: "Audience",
  budget: "Budget",
  tracking: "Tracking",
  launch: "Launch",
  setup: "Setup",
  website: "Website",
  other: "Recommendation",
};

export function ActionCard({ item, controls }: { item: ActionItemData; controls?: ReactNode }) {
  return (
    <article className="flex h-full flex-col rounded-[18px] border p-4 transition hover:border-[color:var(--mairo-line-lit)] sm:p-5" style={{ borderColor: item.urgent ? "rgba(255,61,110,0.4)" : "var(--mairo-line)", background: "rgba(var(--mairo-bg-rgb),0.55)" }}>
      <div className="flex items-center gap-2">
        <AgentIcon role={item.agent} size={26} />
        <p className="min-w-0 truncate text-[12px] text-muted">{AGENT[item.agent].name}</p>
        <Pill tone={item.urgent ? "alert" : item.kind === "tracking" || item.kind === "setup" ? "warn" : "violet"} className="ml-auto">
          {item.urgent ? "Urgent · " : ""}
          {KIND_LABEL[item.kind]}
        </Pill>
      </div>
      <h3 className="mt-3 text-[15.5px] font-semibold leading-snug text-white">{item.title}</h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-white/75">{item.why}</p>
      {(item.impact || item.risk) && (
        <p className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
          {item.impact && <span className={item.impact.up ? "text-amber-300" : "text-muted"}>{item.impact.text}</span>}
          {item.risk && <span className="text-faint">{item.risk}</span>}
        </p>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        {controls ?? (
          <Go href={item.href} className={primaryAction}>
            {item.cta}
          </Go>
        )}
      </div>
    </article>
  );
}

export function ActionCenter({
  items,
  total,
  controls,
  allHref,
  emptyText,
}: {
  items: ActionItemData[];
  /** Everything waiting, including what isn't shown here. */
  total: number;
  /** Per item, the real controls (the dashboard passes approve/decline; a demonstration passes none). */
  controls?: Record<string, ReactNode>;
  allHref?: string | null;
  emptyText: string;
}) {
  return (
    <Panel id="action-center" title="AI Action Center" tone="lit" action={{ href: allHref, label: total > items.length ? `All ${total} in Approvals` : "Approvals" }}>
      {items.length === 0 ? (
        <p className="max-w-[640px] text-[14px] leading-relaxed text-white/75">{emptyText}</p>
      ) : (
        <div className="grid gap-3 @2xl:grid-cols-2 @4xl:grid-cols-3">
          {items.map((it) => (
            <ActionCard key={it.key} item={it} controls={controls?.[it.key]} />
          ))}
        </div>
      )}
      <p className="mt-4 text-[12px] text-faint">Nothing changes in your ad account until you approve it.</p>
    </Panel>
  );
}
