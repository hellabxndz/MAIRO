import { db } from "@/lib/db";
import { graphApiVersion } from "@/lib/meta/client";
import { classifyMetaFailure, type FailureSide } from "./errors/classify";
import { impactClass, monitorFreshness, type MonitorFreshness } from "./impact";
import { currentOperationHealth } from "./operations";
import type { OperationHealth } from "./operations/rules";

// AIOS → Meta Intelligence, at a glance: every line here comes from a real
// check with a timestamp — the changelog reads, MAIRO's own writes to Meta,
// the errors Meta returned, the contract tests and the review queue. Nothing
// is "up to date" by default.

const REVIEW_STATUSES = ["PROPOSED", "DEVELOPMENT", "AUTOMATED_TESTING", "SANDBOX_TESTING", "APPROVED"];

/** The HTTP status a stored error carries in its message when Meta sent no code. */
const statusIn = (message: string) => Number(/HTTP (\d{3})/.exec(message)?.[1] ?? "") || null;

export function errorSide(e: { code: number | null; subcode: number | null; message: string }): FailureSide {
  return classifyMetaFailure({ status: statusIn(e.message), code: e.code, subcode: e.subcode }).side;
}

export type IntegrationHealth = {
  version: { production: string; retiresAt: Date | null };
  monitor: MonitorFreshness;
  operations: OperationHealth[];
  errors24h: Record<FailureSide, number>;
  review: { inPipeline: number; unreviewedBreaking: number; confirmedOpen: number };
  contract: { at: Date; passed: number; failed: number; criticalFailed: number } | null;
};

export async function integrationHealth(now = new Date()): Promise<IntegrationHealth> {
  const production = graphApiVersion();
  const [sources, operations, errors, open, version, contract] = await Promise.all([
    db.platformSource.findMany({ where: { platform: "META" } }),
    currentOperationHealth(now),
    db.platformApiError.findMany({ where: { platform: "META", lastAt: { gte: new Date(now.getTime() - 24 * 3_600_000) } }, select: { code: true, subcode: true, message: true, count: true } }),
    db.platformUpdate.findMany({ where: { platform: "META", status: { notIn: ["PRODUCTION", "DISMISSED"] } }, select: { status: true, impact: true, risk: true, urgency: true, changeType: true } }),
    db.platformApiVersion.findUnique({ where: { platform_version: { platform: "META", version: production } }, select: { retiresAt: true } }),
    db.platformTestRun.findFirst({ where: { platform: "META", mode: "CONTRACT", finishedAt: { not: null } }, orderBy: { startedAt: "desc" } }),
  ]);
  const errors24h: Record<FailureSide, number> = { meta: 0, account: 0, mairo: 0, unknown: 0 };
  // Groups, not single errors: a signature seen at all in the last day counts once per group.
  for (const e of errors) errors24h[errorSide(e)] += 1;
  return {
    version: { production, retiresAt: version?.retiresAt ?? null },
    monitor: monitorFreshness(sources, now),
    operations,
    errors24h,
    review: {
      inPipeline: open.filter((u) => REVIEW_STATUSES.includes(u.status)).length,
      unreviewedBreaking: open.filter((u) => { const c = impactClass(u); return !c.reviewed && c.cls === "potentially_breaking"; }).length,
      confirmedOpen: open.filter((u) => u.impact === "affects_mairo").length,
    },
    contract: contract ? { at: contract.finishedAt ?? contract.startedAt, passed: contract.passed, failed: contract.failed, criticalFailed: contract.criticalFailed } : null,
  };
}
