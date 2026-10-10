import type { DecisionView } from "@/lib/decisions/store";
import { describeChange } from "@/lib/decisions/guardrails";
import { CATEGORY_LABEL, whenText } from "./labels";

// Decision History: every decision that was answered, what MAIRO changed,
// the before and after, the reason, and who approved it.

const STATUS: Record<string, { label: string; color: string }> = {
  APPLIED: { label: "Approved", color: "var(--color-emerald-400)" },
  REJECTED: { label: "Rejected", color: "var(--color-red-400)" },
  FAILED: { label: "Couldn't be made", color: "var(--color-amber-400)" },
  EXPIRED: { label: "No longer needed", color: "var(--color-faint)" },
  IGNORED: { label: "Ignored", color: "var(--color-faint)" },
};

export function DecisionHistory({
  decisions,
  campaignNames,
  timeZone,
}: {
  decisions: DecisionView[];
  campaignNames: Record<string, string>;
  timeZone?: string;
}) {
  if (decisions.length === 0) {
    return <p className="text-[13px] text-muted">Nothing here yet. Decisions you approve or reject are kept here with what changed.</p>;
  }
  return (
    <ul className="space-y-3">
      {decisions.map((d) => {
        const s = STATUS[d.status] ?? { label: d.status, color: "var(--color-faint)" };
        const rows = d.result ?? d.changes.filter((c) => c.type !== "guide").map((c) => ({ ...describeChange(c), ok: false, error: null }));
        return (
          <li key={d.id} id={`d-${d.id}`} className="scroll-mt-24 rounded-xl border p-4" style={{ borderColor: "var(--mairo-line)" }}>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-faint">
              <span>{whenText(d.decidedAt ?? d.createdAt, undefined, timeZone)}</span>
              <span>·</span>
              <span>{CATEGORY_LABEL[d.category]}</span>
              {d.mairoCampaignId && campaignNames[d.mairoCampaignId] && (
                <>
                  <span>·</span>
                  <span>{campaignNames[d.mairoCampaignId]}</span>
                </>
              )}
              <span className="ml-auto font-medium" style={{ color: s.color }}>
                {d.status === "APPLIED" && d.automatic ? "Done by MAIRO (within your limits)" : s.label}
              </span>
            </div>
            <p className="mt-1.5 text-[14px] text-white">{d.title}</p>
            <p className="mt-1 text-[12.5px] text-muted">
              <span className="text-faint">Reason: </span>
              {d.noticed}
            </p>
            {d.status === "APPLIED" && rows.length > 0 && (
              <ul className="mt-3 space-y-1.5 text-[12.5px]">
                {rows.map((r, i) => (
                  <li key={i} className="flex flex-wrap gap-x-2">
                    <span className="text-faint">{r.label}:</span>
                    {r.before && <span className="text-muted">{r.before} →</span>}
                    <span className={r.ok ? "text-white" : "text-amber-200/90"}>{r.ok ? r.after ?? "Done" : `Not changed${r.error ? ` (${r.error})` : ""}`}</span>
                  </li>
                ))}
              </ul>
            )}
            {d.status === "APPLIED" && rows.length === 0 && (
              <p className="mt-2 text-[12.5px] text-muted">Nothing changed by MAIRO — you took care of it.</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
