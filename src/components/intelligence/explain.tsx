import Link from "next/link";
import type { DecisionConfidence } from "@/generated/prisma/enums";
import { basedOnLine } from "@/lib/intelligence/format";
import type { BasedOn } from "@/lib/intelligence/types";
import type { InsightView } from "@/lib/intelligence/run";

// The pieces every Mairo finding is explained with: how sure Mairo is and on
// what, the five questions (what happened, why it matters, what Mairo
// recommends, what supports it, what approving does), and the one button
// that acts on it.

const CONFIDENCE: Record<DecisionConfidence, { label: string; tone: string; note: string | null }> = {
  HIGH: { label: "High confidence", tone: "bg-emerald-400/12 text-emerald-300", note: null },
  MEDIUM: { label: "Medium confidence", tone: "bg-sky-400/12 text-sky-300", note: null },
  EARLY: { label: "Early signal", tone: "bg-amber-400/12 text-amber-300", note: "Mairo needs more data before making an automatic change." },
};

export function ConfidenceBadge({ confidence, basedOn, compact = false }: { confidence: DecisionConfidence; basedOn?: BasedOn; compact?: boolean }) {
  const c = CONFIDENCE[confidence];
  return (
    <div>
      <span className={`inline-flex rounded-md px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.1em] ${c.tone}`}>{c.label}</span>
      {!compact && basedOn && <p className="mt-1.5 text-[12px] text-faint">Based on {basedOnLine(basedOn)}</p>}
      {!compact && c.note && <p className="mt-1 text-[12px] text-amber-200/70">{c.note}</p>}
    </div>
  );
}

export const SEVERITY: Record<string, { label: string; tone: string }> = {
  INFO: { label: "Information", tone: "bg-white/[0.07] text-white/70" },
  OPPORTUNITY: { label: "Opportunity", tone: "bg-violet/20 text-violet-bright" },
  ATTENTION: { label: "Needs attention", tone: "bg-amber-400/12 text-amber-300" },
  URGENT: { label: "Urgent", tone: "bg-alert/15 text-alert" },
};

export function SeverityChip({ severity }: { severity: string }) {
  const s = SEVERITY[severity] ?? SEVERITY.INFO;
  return <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ${s.tone}`}>{s.label}</span>;
}

export function InsightExplanation({ insight, advanced }: { insight: InsightView; advanced: boolean }) {
  const rows: [string, string][] = [
    ["What happened?", advanced ? insight.happenedAdvanced : insight.happened],
    ["Why does it matter?", insight.whyItMatters],
    ["Mairo recommends", insight.recommendation],
    ["Why this?", insight.reason],
    ["If you approve", insight.ifApproved],
  ];
  return (
    <div className="space-y-3">
      {rows.map(([q, a]) => (
        <div key={q}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-bright">{q}</p>
          <p className="mt-0.5 text-[13.5px] leading-relaxed text-white/85">{a}</p>
        </div>
      ))}
      {insight.evidence.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-bright">What supports this</p>
          <dl className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
            {insight.evidence.map((e) => (
              <div key={e.label} className="flex justify-between gap-3 rounded-lg bg-white/[0.03] px-3 py-2 text-[12.5px]">
                <dt className="text-muted">{advanced && e.advancedLabel ? e.advancedLabel : e.label}</dt>
                <dd className="truncate font-medium tabular-nums text-white">{e.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <ConfidenceBadge confidence={insight.confidence} basedOn={insight.basedOn} />
    </div>
  );
}

/** The one button that acts on a finding: its Mairo Decision when there is one, otherwise where to go. */
export function FixWithMairo({ insight, label, className = "" }: { insight: Pick<InsightView, "decisionId" | "action" | "decisionDedupeKey">; label?: string; className?: string }) {
  const href = insight.decisionId ? "/dashboard/decisions" : (insight.action?.href ?? "/dashboard/decisions");
  const text = label ?? (insight.decisionId || insight.decisionDedupeKey ? "Fix with Mairo" : (insight.action?.label ?? "Take a look"));
  const external = /^https?:\/\//.test(href);
  const cls = `inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#7c5cff] px-3.5 text-[13px] font-medium text-white transition hover:brightness-110 ${className}`;
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
      {text} <span aria-hidden>↗</span>
    </a>
  ) : (
    <Link href={href} className={cls}>
      {text} <span aria-hidden>→</span>
    </Link>
  );
}

export function askMairoHref(insight: Pick<InsightView, "title" | "mairoCampaignId">): string {
  return `/dashboard/agents?ask=${encodeURIComponent(`Why is this happening: "${insight.title}"?`)}${insight.mairoCampaignId ? `&about=${insight.mairoCampaignId}` : ""}`;
}
