import Link from "next/link";
import type { Notification } from "@/generated/prisma/client";
import type { NotificationSeverity } from "@/generated/prisma/enums";
import { kindInfo } from "@/lib/notifications/kinds";
import { GlassPanel } from "@/components/mairo";

// MAIRO speaking first.
//
// The rest of the dashboard answers questions somebody came to ask. This is
// the part that says something they had not thought to ask about — the cost
// per purchase that has been climbing, the platform quietly doing better than
// the other one — and it is the single thing that makes the product feel like
// an employee rather than a set of charts.
//
// Only unread, and only the top two. A proactive card that stays on the screen
// after it has been read stops being an interruption and becomes furniture,
// and four of them at once is a feed. Everything else is in the centre.

const TONE: Record<NotificationSeverity, { edge: string; text: string; label: string }> = {
  INFO: { edge: "rgba(108,158,255,0.42)", text: "text-blue-bright", label: "MAIRO noticed" },
  OPPORTUNITY: { edge: "rgba(52,211,153,0.42)", text: "text-live", label: "Opportunity" },
  WARNING: { edge: "rgba(251,191,36,0.42)", text: "text-warn", label: "Needs a look" },
};

export function InsightCards({
  insights,
  className = "",
}: {
  insights: Notification[];
  className?: string;
}) {
  if (insights.length === 0) return null;

  return (
    <div className={`space-y-3 ${className}`}>
      {insights.map((n) => {
        const tone = TONE[n.severity];
        return (
          <GlassPanel
            key={n.id}
            className="p-5"
            // Lit, because the point of these is that they were not asked for.
            // A card that announces itself should look different from the ones
            // that were already on the page.
            lit
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className="mt-[3px] flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                style={{ border: `1px solid ${tone.edge}` }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.edge }} />
              </span>
              <div className="min-w-0 flex-1">
                <p className={`font-mono text-[10px] uppercase tracking-[0.18em] ${tone.text}`}>
                  {tone.label} · {kindInfo(n.kind).label}
                </p>
                <h3 className="mt-1.5 text-[14.5px] font-medium leading-snug text-white">
                  {n.title}
                </h3>
                <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted">{n.body}</p>
                <div className="mt-3.5 flex flex-wrap items-center gap-4">
                  {n.actionHref && (
                    <Link
                      href={n.actionHref}
                      className="text-[12.5px] text-blue-bright transition-colors hover:text-white"
                    >
                      {n.actionLabel ?? "Take a look"} →
                    </Link>
                  )}
                  <Link
                    href={`/dashboard/agents?ask=${encodeURIComponent(n.title)}`}
                    className="text-[12.5px] text-muted transition-colors hover:text-white"
                  >
                    Ask why
                  </Link>
                </div>
              </div>
            </div>
          </GlassPanel>
        );
      })}
    </div>
  );
}
