// Two honest answers for the admin view, pure (pinned by check-meta-reliability):
//
//   Is the changelog monitor current?  Judged from the last check that actually
//   read Meta's official changelog and version pages — never from a check that
//   failed, and never "current" once the newest successful read is too old.
//   "Current" means "MAIRO read Meta's changelog recently", not "MAIRO is
//   compatible with everything Meta shipped": nothing here claims the latter.
//
//   What does an update mean for MAIRO?  informational, potentially breaking,
//   or confirmed to affect MAIRO. "Confirmed" only ever comes from a person
//   who reviewed it; the detector's reading is a lead, not a verdict.

/** The official pages the monitor must read: changelogs and the version list. */
export const REQUIRED_SOURCE_KINDS = ["CHANGELOG", "VERSIONS"] as const;

/** A day's run plus slack. Older than this, the monitor is stale. */
export const FRESH_FOR_MS = 36 * 60 * 60 * 1000;

export type MonitorSource = { key: string; name: string; url: string; kind: string; authority: string; active: boolean; lastCheckedAt: Date | null; lastSuccessAt: Date | null; lastError: string | null };

export type MonitorFreshness =
  | { state: "never"; label: string; detail: string; lastSuccessAt: null; failing: MonitorSource[] }
  | { state: "failing" | "stale" | "current"; label: string; detail: string; lastSuccessAt: Date; failing: MonitorSource[] };

const fmt = (d: Date) => d.toISOString().replace("T", " ").slice(0, 16) + " UTC";

export function monitorFreshness(sources: MonitorSource[], now: Date): MonitorFreshness {
  const required = sources.filter((s) => s.active && s.authority === "OFFICIAL" && (REQUIRED_SOURCE_KINDS as readonly string[]).includes(s.kind));
  const failing = required.filter((s) => s.lastError);
  const read = required.filter((s) => s.lastSuccessAt);
  if (required.length === 0 || read.length === 0) {
    return { state: "never", label: "Not checked yet", detail: "Meta's official changelog hasn't been read successfully yet. Run a check from Sources.", lastSuccessAt: null, failing };
  }
  // The monitor is as fresh as its stalest required page: a page never read counts as never.
  const unread = required.length - read.length;
  const oldest = read.reduce((a, s) => (s.lastSuccessAt! < a ? s.lastSuccessAt! : a), read[0].lastSuccessAt!);
  const newest = read.reduce((a, s) => (s.lastSuccessAt! > a ? s.lastSuccessAt! : a), read[0].lastSuccessAt!);
  if (failing.length > 0) {
    return {
      state: "failing",
      label: "Last check failed",
      detail: `${failing.map((s) => `${s.name}: ${s.lastError}`).join(" · ")}. Last successful read: ${fmt(newest)}.`,
      lastSuccessAt: newest,
      failing,
    };
  }
  if (unread > 0 || now.getTime() - oldest.getTime() > FRESH_FOR_MS) {
    return {
      state: "stale",
      label: "Check is out of date",
      detail: unread > 0 ? `${unread} of Meta's changelog pages haven't been read yet.` : `The oldest successful read was ${fmt(oldest)} — more than ${FRESH_FOR_MS / 3_600_000} hours ago.`,
      lastSuccessAt: newest,
      failing,
    };
  }
  return { state: "current", label: `Checked ${fmt(oldest)}`, detail: `All ${required.length} official changelog and version pages were read in the last ${FRESH_FOR_MS / 3_600_000} hours.`, lastSuccessAt: oldest, failing };
}

export type ImpactClass = "informational" | "potentially_breaking" | "affects_mairo";

export const IMPACT_LABEL: Record<ImpactClass, string> = {
  informational: "Informational",
  potentially_breaking: "Potentially breaking",
  affects_mairo: "Confirmed to affect MAIRO",
};

const REMOVING = ["DEPRECATED_FEATURE", "REMOVED_FEATURE", "REMOVED_ENDPOINT", "REMOVED_FIELD", "RENAMED_FEATURE", "API_VERSION_DEPRECATION", "PERMISSION_CHANGE", "ERROR_SPIKE"];

export function impactClass(u: { impact: string | null; risk: string; urgency: string; changeType: string }): { cls: ImpactClass; reviewed: boolean } {
  if (u.impact === "affects_mairo") return { cls: "affects_mairo", reviewed: true };
  if (u.impact === "not_affected") return { cls: "informational", reviewed: true };
  const breaking = u.risk === "BREAKING" || u.risk === "POTENTIALLY_BREAKING" || u.urgency === "CRITICAL" || u.urgency === "HIGH" || REMOVING.includes(u.changeType);
  return { cls: breaking ? "potentially_breaking" : "informational", reviewed: false };
}
