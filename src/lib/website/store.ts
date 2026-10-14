import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import type { ScanResult } from "./scan";
import { familyOf, type Finding } from "./audit";

// Where website readings and the owner's decisions about them live.
//
// Company isolation: every read and write that concerns a business is scoped
// by its organizationId — a scan, a finding, a decision. Public free-tool
// scans have no organization and are never shown inside an account, and an
// account's scans (which can carry its ad text) are never reused publicly.
//
// Cost control for the free tools: a disclosed per-visitor limit, a
// server-wide daily budget, and a short cache so the same public address
// isn't fetched again and again. The visitor is counted by a salted one-way
// hash — no IP address is stored.

export const ANON_SCANS_PER_HOUR = 5;
export const SCANS_PER_DAY_ALL = 400;
export const ORG_SCANS_PER_HOUR = 20;
export const PUBLIC_CACHE_HOURS = 6;
const MAX_JSON = 180_000;

export function anonKeyFor(ip: string | null, userAgent: string | null): string {
  const salt = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "mairo";
  return createHash("sha256").update(`${salt}|${ip ?? "?"}|${(userAgent ?? "").slice(0, 120)}`).digest("hex").slice(0, 32);
}

const hourKey = (d = new Date()) => d.toISOString().slice(0, 13);
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

/** Counts one use against a window and says whether it's within the limit. Atomic per bucket. */
async function take(bucket: string, limit: number, windowStart: Date): Promise<boolean> {
  const row = await db.toolUsage.upsert({
    where: { bucket },
    create: { bucket, count: 1, windowStart },
    update: { count: { increment: 1 } },
    select: { count: true },
  });
  return row.count <= limit;
}

export type Quota = { ok: true } | { ok: false; reason: "visitor" | "budget" | "account"; message: string };

export async function takeScanQuota(who: { anonKey: string } | { organizationId: string }): Promise<Quota> {
  const now = new Date();
  const hourStart = new Date(`${hourKey(now)}:00:00.000Z`);
  const dayStart = new Date(`${dayKey(now)}T00:00:00.000Z`);
  if ("organizationId" in who) {
    return (await take(`scan:org:${who.organizationId}:${hourKey(now)}`, ORG_SCANS_PER_HOUR, hourStart))
      ? { ok: true }
      : { ok: false, reason: "account", message: `That's ${ORG_SCANS_PER_HOUR} website checks this hour — try again after the hour.` };
  }
  if (!(await take(`scan:all:${dayKey(now)}`, SCANS_PER_DAY_ALL, dayStart))) {
    return { ok: false, reason: "budget", message: "MAIRO's free website checks have reached today's limit. Try again tomorrow — or create a free account to check your own site." };
  }
  if (!(await take(`scan:anon:${who.anonKey}:${hourKey(now)}`, ANON_SCANS_PER_HOUR, hourStart))) {
    return { ok: false, reason: "visitor", message: `Free website checks are limited to ${ANON_SCANS_PER_HOUR} an hour. Try again later, or create a free account.` };
  }
  return { ok: true };
}

/** Free-plan refinements with MAIRO's AI: a few an hour per visitor, and a daily ceiling across everyone, since each one costs a model call. */
export const ANON_REFINES_PER_HOUR = 8;
export const REFINES_PER_DAY_ALL = 400;
export async function takeRefineQuota(anonKey: string): Promise<Quota> {
  const now = new Date();
  const hourStart = new Date(`${hourKey(now)}:00:00.000Z`);
  const dayStart = new Date(`${dayKey(now)}T00:00:00.000Z`);
  if (!(await take(`refine:all:${dayKey(now)}`, REFINES_PER_DAY_ALL, dayStart))) {
    return { ok: false, reason: "budget", message: "Free refinements have reached today's limit. Create your free account to keep refining your plan." };
  }
  if (!(await take(`refine:anon:${anonKey}:${hourKey(now)}`, ANON_REFINES_PER_HOUR, hourStart))) {
    return { ok: false, reason: "visitor", message: `That's ${ANON_REFINES_PER_HOUR} refinements this hour. Create your free account to keep going, or try again later.` };
  }
  return { ok: true };
}

/** Free AI ad plans: each one is a model call, so a few an hour per visitor and a daily ceiling across everyone. */
export const ANON_PLANS_PER_HOUR = 6;
export const PLANS_PER_DAY_ALL = 300;
export async function takePlanQuota(anonKey: string): Promise<Quota> {
  const now = new Date();
  const hourStart = new Date(`${hourKey(now)}:00:00.000Z`);
  const dayStart = new Date(`${dayKey(now)}T00:00:00.000Z`);
  if (!(await take(`plan:all:${dayKey(now)}`, PLANS_PER_DAY_ALL, dayStart))) {
    return { ok: false, reason: "budget", message: "MAIRO's AI has written today's limit of free plans, so this one uses MAIRO's ad templates. Try again tomorrow, or create your free account." };
  }
  if (!(await take(`plan:anon:${anonKey}:${hourKey(now)}`, ANON_PLANS_PER_HOUR, hourStart))) {
    return { ok: false, reason: "visitor", message: `That's ${ANON_PLANS_PER_HOUR} AI-written plans this hour, so this one uses MAIRO's ad templates. Try again later, or create your free account.` };
  }
  return { ok: true };
}

/** Saving or sharing a free plan: generous, but enough to stop the table being filled by a script. */
export const ANON_SAVES_PER_HOUR = 20;
export async function takeSaveQuota(anonKey: string): Promise<Quota> {
  const now = new Date();
  const hourStart = new Date(`${hourKey(now)}:00:00.000Z`);
  if (!(await take(`save:anon:${anonKey}:${hourKey(now)}`, ANON_SAVES_PER_HOUR, hourStart))) {
    return { ok: false, reason: "visitor", message: `That's ${ANON_SAVES_PER_HOUR} saved plans this hour. Try again later, or create your free account.` };
  }
  return { ok: true };
}

/** A recent public reading of the same address, reused instead of fetching again. */
export async function cachedPublicScan(url: string): Promise<ScanResult | null> {
  const row = await db.websiteScan.findFirst({
    // "tool" only: a reading that checked someone's ad text ("tool-ad") carries
    // that text in its findings and is never handed to anyone else.
    where: { organizationId: null, source: "tool", url, status: { in: ["OK", "PARTIAL"] }, createdAt: { gte: new Date(Date.now() - PUBLIC_CACHE_HOURS * 3600e3) } },
    orderBy: { createdAt: "desc" },
    select: { resultJson: true },
  });
  return row ? parse(row.resultJson) : null;
}

function parse(json: string): ScanResult | null {
  try {
    const r = JSON.parse(json) as ScanResult;
    return r && r.version === 1 ? r : null;
  } catch {
    return null;
  }
}

/** Trims what's stored: quotes and lists are already capped; this caps the whole record. */
function serialise(r: ScanResult): string {
  let json = JSON.stringify(r);
  if (json.length > MAX_JSON) json = JSON.stringify({ ...r, linkChecks: r.linkChecks.slice(0, 4), apps: r.apps.slice(0, 12), pages: r.pages.map((p) => ({ ...p, headings: p.headings.slice(0, 3), ctas: p.ctas.slice(0, 4) })) });
  return json;
}

export async function saveScan(input: { result: ScanResult; source: "onboarding" | "report" | "recheck" | "tool" | "tool-ad"; organizationId?: string | null; anonKey?: string | null }): Promise<string> {
  const r = input.result;
  const row = await db.websiteScan.create({
    data: {
      organizationId: input.organizationId ?? null,
      source: input.source,
      url: r.requestedUrl,
      finalUrl: r.finalUrl,
      status: r.status,
      error: r.error,
      resultJson: serialise(r),
      pagesRead: r.pages.length,
      anonKey: input.anonKey ?? null,
      durationMs: r.durationMs,
    },
    select: { id: true },
  });
  if (input.organizationId && (r.status === "OK" || r.status === "PARTIAL")) await syncFindings(input.organizationId, row.id, r.audit.findings);
  return row.id;
}

/**
 * Keeps the owner's decisions in step with the latest reading: a new issue
 * opens; an issue still seen keeps whatever the owner decided; an issue a
 * later reading no longer sees is marked gone — "fixed, confirmed by a
 * recheck" — rather than silently disappearing.
 */
async function syncFindings(organizationId: string, scanId: string, findings: Finding[]) {
  const now = new Date();
  const seen = findings.filter((f) => f.status === "issue");
  const evaluated = new Set(findings.filter((f) => f.status !== "not checked").map((f) => familyOf(f.rule)));
  for (const f of seen) {
    await db.websiteFinding.upsert({
      where: { organizationId_key: { organizationId, key: f.key } },
      create: { organizationId, key: f.key, url: f.evidenceUrl ?? "", lastSeenScanId: scanId, lastSeenAt: now },
      update: { lastSeenScanId: scanId, lastSeenAt: now, goneAt: null },
    });
  }
  const seenKeys = new Set(seen.map((f) => f.key));
  const known = await db.websiteFinding.findMany({ where: { organizationId, goneAt: null }, select: { id: true, key: true } });
  // Gone only when the new reading answered the same question — a check that
  // didn't run (time ran out, page unreachable) says nothing either way.
  const gone = known.filter((k) => !seenKeys.has(k.key) && evaluated.has(familyOf(k.key.split(":")[0])));
  if (gone.length) await db.websiteFinding.updateMany({ where: { organizationId, id: { in: gone.map((g) => g.id) } }, data: { goneAt: now } });
}

export type FindingDecision = { key: string; status: "OPEN" | "RESOLVED" | "DISMISSED"; resolvedAt: Date | null; goneAt: Date | null; lastSeenAt: Date | null };

export async function latestOrgScan(organizationId: string): Promise<{ id: string; createdAt: Date; result: ScanResult } | null> {
  const row = await db.websiteScan.findFirst({ where: { organizationId }, orderBy: { createdAt: "desc" }, select: { id: true, createdAt: true, resultJson: true } });
  const result = row ? parse(row.resultJson) : null;
  return row && result ? { id: row.id, createdAt: row.createdAt, result } : null;
}

export async function findingDecisions(organizationId: string): Promise<Map<string, FindingDecision>> {
  const rows = await db.websiteFinding.findMany({ where: { organizationId }, select: { key: true, status: true, resolvedAt: true, goneAt: true, lastSeenAt: true } });
  return new Map(rows.map((r) => [r.key, { ...r, status: r.status as FindingDecision["status"] }]));
}

/** The owner marks a finding resolved, dismisses it, or reopens it. Scoped to their business. */
export async function setFindingStatus(organizationId: string, key: string, status: "OPEN" | "RESOLVED" | "DISMISSED", userId: string | null): Promise<boolean> {
  const res = await db.websiteFinding.updateMany({
    where: { organizationId, key },
    data: { status, resolvedAt: status === "OPEN" ? null : new Date(), resolvedById: status === "OPEN" ? null : userId },
  });
  return res.count === 1;
}
