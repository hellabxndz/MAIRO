import { db } from "@/lib/db";
import type { PlatformIntelligence } from "@/lib/platform-intelligence/types";
import { versionSweep, ensureProductionVersion } from "./api-versioning";
import { checkSources } from "./change-detector/run";
import { deprecationSweep } from "./deprecations";
import { discoverySweep } from "./discovery";
import { errorSweep } from "./errors/monitor";
import { seedRegistry } from "./feature-registry/store";
import { analyzePending } from "./pipeline";
import { seedSources } from "./sources/store";

// MAIRO Meta Intelligence — keeps MAIRO aligned with Meta advertising.
//
//   sources/            official Meta sources, allowlisted, fetched safely
//   change-detector/    snapshot, diff and classify what changed
//   interpretation/     "META UPDATE": AI (rules as fallback) reads a change
//   feature-registry/   the Meta Feature Registry + the guard for new campaigns
//   capabilities/       metaCapabilities: every Meta value campaigns are built with
//   knowledge-base/     versioned knowledge, never overwritten
//   compatibility/      Supported / Testing / … — never "supported" unvalidated
//   pipeline/           Detected → … → Production, with gates
//   testing/            contract tests (stubbed Meta) and sandbox runs
//   feature-flags/      Off → Internal → Selected → All eligible
//   api-versioning/     production/latest/retiring versions and alerts
//   deprecations/       impact, replacement, migration plan
//   errors/             centralized Graph error monitoring and spike detection
//   discovery/          what each business's own ad account can use
//   strategy-integration/ what the Strategy Engine may consider, goal first
//   alerts/ release-log/  admin notifications and the Meta Update log
//
// Security: documentation is untrusted input. This module detects, analyses,
// proposes and tests. It never changes code and never changes a customer's
// live campaign; production changes are structured registry/knowledge edits
// an administrator approved through the gates.

/** First-run setup: official sources, the baseline registry, the production API version. Idempotent. */
export async function ensureMetaIntelligence(): Promise<{ sources: number; features: number; version: string }> {
  const [sources, features] = [await seedSources(), await seedRegistry()];
  const version = await ensureProductionVersion();
  return { sources, features, version };
}

/** The daily run (from the review cron), within a time budget. */
export async function runMetaIntelligence(opts: { budgetMs?: number; now?: Date; fetcher?: typeof fetch } = {}): Promise<Record<string, unknown>> {
  const now = opts.now ?? new Date();
  const started = Date.now();
  const budget = opts.budgetMs ?? 20_000;
  const left = () => Math.max(0, budget - (Date.now() - started));
  const seeded = await ensureMetaIntelligence();
  const checks = await checkSources({ budgetMs: Math.min(left(), budget * 0.5), fetcher: opts.fetcher, now });
  const analyzed = left() > 3_000 ? await analyzePending(3) : 0;
  const versionAlerts = await versionSweep(now);
  const spikes = await errorSweep(now);
  const deprecations = await deprecationSweep(now);
  const discovered = left() > 3_000 ? await discoverySweep(3, now).catch(() => 0) : 0;
  return {
    seeded,
    sources: { checked: checks.length, changed: checks.filter((c) => c.changed && !c.baseline).length, failed: checks.filter((c) => !c.ok).length, updates: checks.reduce((n, c) => n + c.updates, 0) },
    analyzed,
    versionAlerts,
    spikes,
    deprecations,
    discovered,
  };
}

export const metaIntelligence: PlatformIntelligence = { platform: "META", label: "Meta Intelligence", run: runMetaIntelligence };

/** Counts for the AIOS overview. */
export async function metaIntelligenceSummary() {
  const [critical, open, alerts] = await Promise.all([
    db.platformUpdate.count({ where: { platform: "META", urgency: "CRITICAL", status: { notIn: ["PRODUCTION", "DISMISSED"] } } }),
    db.platformUpdate.count({ where: { platform: "META", status: { notIn: ["PRODUCTION", "DISMISSED"] } } }),
    db.platformAdminAlert.count({ where: { platform: "META", readAt: null } }),
  ]);
  return { critical, open, alerts };
}
