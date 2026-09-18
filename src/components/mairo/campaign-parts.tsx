import Link from "next/link";
import type { ReactNode } from "react";
import { MairoCard, GlassPanel } from "@/components/mairo";
import { Badge } from "@/components/ui";
import type { CampaignHealth } from "@/lib/campaigns/health";
import { healthTone } from "@/lib/campaigns/health";
import type { ActionEntry } from "@/lib/campaigns/action-log";
import { whenLabel, timeLabel } from "@/lib/campaigns/action-log";

// The pieces the campaign screens are assembled from.
//
// Server components, all of them. Nothing here holds state — the only
// interactive parts of this system are the timeline rows, the tabs and the
// assistant, and those are their own client files. Keeping these on the server
// is what stops a dashboard of twenty metric tiles shipping twenty components'
// worth of JavaScript to render text that never changes.
//
// The rule that runs through all of them: a missing number is rendered as a
// missing number. Every metric on PlatformMetrics is nullable and null means
// "the platform did not report this", which is not zero. A dash that means
// "nothing yet" is honest; a $0.00 that means the same thing is a lie the
// customer will act on.

const NONE = "—";

export function money(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return NONE;
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
}

export function count(n: number | null | undefined): string {
  if (n === null || n === undefined) return NONE;
  return n.toLocaleString();
}

export function ratio(n: number | null | undefined): string {
  if (n === null || n === undefined) return NONE;
  return `${n.toFixed(2)}x`;
}

export function percent(n: number | null | undefined): string {
  if (n === null || n === undefined) return NONE;
  return `${n.toFixed(2)}%`;
}

/* ------------------------------------------------------------------ metric */

/**
 * One number, large.
 *
 * `hint` is where the caveat goes — "all time", "since launch" — because a
 * figure with no period attached invites the reader to assume it is this month,
 * and it usually is not.
 */
export function CampaignMetric({
  label,
  value,
  hint,
  icon,
  emphasis = false,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
  /** For the one figure a screen is actually about. */
  emphasis?: boolean;
}) {
  const missing = value === NONE;
  return (
    <GlassPanel className="p-4 sm:p-5" lit={emphasis}>
      <div className="flex items-center gap-2.5">
        {icon && <span className="h-4 w-4 shrink-0 text-blue-bright">{icon}</span>}
        <p className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-faint">{label}</p>
      </div>
      <p
        className={`mt-3 text-[26px] font-semibold leading-none tracking-[-0.02em] tabular-nums sm:text-[30px] ${
          missing ? "text-faint" : "text-white"
        }`}
      >
        {value}
      </p>
      <p className="mt-2 text-[11px] leading-tight text-faint">
        {missing ? "No data yet" : (hint ?? " ")}
      </p>
    </GlassPanel>
  );
}

/* ------------------------------------------------------------------ health */

export function CampaignHealthPanel({
  health,
  className = "",
}: {
  health: CampaignHealth;
  className?: string;
}) {
  return (
    <GlassPanel className={`p-5 sm:p-6 ${className}`} lit={health.level === "attention"}>
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-faint">
          Campaign health
        </p>
        <Badge tone={healthTone(health.level)}>{health.label}</Badge>
      </div>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-white">{health.summary}</p>
      <p className="mt-2 flex items-start gap-2 text-[12.5px] leading-relaxed text-muted">
        <span aria-hidden className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-blue-bright" />
        {health.note}
      </p>
    </GlassPanel>
  );
}

/* ------------------------------------------------------------------ action */

/**
 * One thing MAIRO changed.
 *
 * The rationale is MAIRO's own sentence, written when it decided, and it is
 * rendered verbatim. Nothing here summarises or rephrases it — an audit log
 * that paraphrases is an audit log you cannot rely on when somebody asks why
 * their budget moved.
 */
export function AIActionCard({
  entry,
  showCampaign = false,
}: {
  entry: ActionEntry;
  showCampaign?: boolean;
}) {
  return (
    <div
      className="rounded-[var(--radius-card)] border p-4"
      style={{ borderColor: "var(--mairo-line)", background: "rgba(10,16,32,0.45)" }}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-blue-bright">
          {entry.kind}
        </span>
        {entry.automatic ? (
          <Badge tone="blue">Automatic</Badge>
        ) : (
          <Badge tone="neutral">You approved</Badge>
        )}
        <span className="ml-auto font-mono text-[10px] text-faint">
          {whenLabel(entry.at)} · {timeLabel(entry.at)}
        </span>
      </div>
      <p className="mt-2.5 text-[13.5px] leading-relaxed text-white/90">{entry.rationale}</p>
      {showCampaign && (
        <Link
          href={`/dashboard/campaigns/${entry.campaignId}`}
          className="mt-2 inline-block text-[12px] text-muted transition-colors hover:text-white"
        >
          {entry.campaignName} →
        </Link>
      )}
    </div>
  );
}

/** Nothing has needed changing yet, said without implying something is wrong. */
export function NoActionsYet({ live }: { live: boolean }) {
  return (
    <div
      className="rounded-[var(--radius-card)] border border-dashed p-8 text-center"
      style={{ borderColor: "var(--mairo-line)" }}
    >
      <p className="text-[14px] text-white">
        {live ? "Nothing to change yet" : "Nothing yet"}
      </p>
      <p className="mx-auto mt-2 max-w-sm text-[12.5px] leading-relaxed text-muted">
        {live
          ? "MAIRO leaves a campaign alone while the platform is still learning who to show it to. Every change it does make will be listed here, with the numbers behind it."
          : "Once a campaign is live, everything MAIRO changes shows up here — what it changed, and why."}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- platform */

export type ServiceStatus =
  | { kind: "connected"; detail: string }
  | { kind: "available"; detail: string }
  | { kind: "soon"; detail: string };

/**
 * One thing MAIRO can run for the business.
 *
 * Deliberately not a product tile. There is no price on it, no basket, no
 * "buy" — the plan is already paid for, and what is being chosen here is what
 * MAIRO should operate, not what to purchase. The monthly plan line is there
 * because the limits are real, not to sell anything.
 */
export function PlatformCard({
  name,
  tagline,
  icon,
  capabilities,
  status,
  planNote,
  recommended = false,
  href,
}: {
  name: string;
  tagline: string;
  icon: ReactNode;
  capabilities: string[];
  status: ServiceStatus;
  planNote?: string;
  recommended?: boolean;
  href: string | null;
}) {
  const disabled = href === null;
  const body = (
    <div className="flex h-full flex-col">
      <div className="flex items-start gap-3.5">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border p-2.5"
          style={{ borderColor: "var(--mairo-line)", background: "rgba(61,125,255,0.08)" }}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[16px] font-medium text-white">{name}</h3>
            {recommended && <Badge tone="blue">Recommended</Badge>}
          </div>
          <p className="mt-1 text-[12.5px] text-muted">{tagline}</p>
        </div>
      </div>

      <ul className="mt-4 flex-1 space-y-1.5">
        {capabilities.map((c) => (
          <li key={c} className="flex gap-2.5 text-[12.5px] text-muted">
            <span
              aria-hidden
              className="mt-[9px] h-px w-2.5 shrink-0"
              style={{ background: "var(--mairo-line-lit)" }}
            />
            {c}
          </li>
        ))}
      </ul>

      <div
        className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4"
        style={{ borderColor: "var(--mairo-line)" }}
      >
        <div className="min-w-0">
          <Badge
            tone={
              status.kind === "connected" ? "green" : status.kind === "available" ? "yellow" : "neutral"
            }
          >
            {status.detail}
          </Badge>
          {planNote && <p className="mt-1.5 text-[11px] text-faint">{planNote}</p>}
        </div>
        {disabled ? (
          <span className="text-[12.5px] text-faint">Coming soon</span>
        ) : (
          <span
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[12.5px] font-medium text-white transition-all duration-300 [transition-timing-function:var(--ease-mairo)] group-hover:brightness-110"
            style={{ backgroundImage: "var(--mairo-ramp)", boxShadow: "var(--mairo-glow-key)" }}
          >
            Launch campaign
            <span aria-hidden>→</span>
          </span>
        )}
      </div>
    </div>
  );

  if (disabled) {
    return (
      <div
        className="h-full rounded-[var(--radius-card)] border p-5 opacity-55"
        style={{ borderColor: "var(--mairo-line)", backgroundImage: "var(--mairo-glass)" }}
      >
        {body}
      </div>
    );
  }
  return (
    <MairoCard href={href} className="h-full p-5">
      {body}
    </MairoCard>
  );
}
