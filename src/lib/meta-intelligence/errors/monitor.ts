import { db } from "@/lib/db";
import { raiseAlert } from "../alerts";
import { accountKey, endpointPattern, errorSignature, isSpike, requestType } from "./rules";

// Centralized Meta error monitoring. Every Graph error MAIRO receives is
// grouped by (code, subcode, endpoint, method) with how often, since when and
// across how many accounts (hashed keys — never a token). An unfamiliar error
// suddenly hitting several accounts is flagged as a possible Meta API
// behaviour change and opened as an update to investigate against the docs.

export async function recordMetaError(input: { status: number; body: unknown; path: string; method: string; apiVersion: string; accessToken?: string | null; now?: Date }): Promise<void> {
  const now = input.now ?? new Date();
  const err = (input.body && typeof input.body === "object" && "error" in input.body ? (input.body as { error?: { code?: number; error_subcode?: number; message?: string } }).error : undefined) ?? {};
  const endpoint = endpointPattern(input.path);
  const code = typeof err.code === "number" ? err.code : null;
  const subcode = typeof err.error_subcode === "number" ? err.error_subcode : null;
  const signature = errorSignature({ code, subcode, endpoint, method: input.method });
  const key = accountKey(input.accessToken);
  const existing = await db.platformApiError.findUnique({ where: { signature } });
  const row = existing
    ? await db.platformApiError.update({
        where: { signature },
        data: { count: { increment: 1 }, lastAt: now, apiVersion: input.apiVersion, ...(existing.accountKeys.includes(key) || existing.accountKeys.length >= 50 ? {} : { accountKeys: { push: key } }) },
      })
    : await db.platformApiError.create({
        data: { platform: "META", signature, code, subcode, message: (err.message ?? `HTTP ${input.status}`).slice(0, 1000), endpoint, method: input.method, apiVersion: input.apiVersion, requestType: requestType(input.path, input.method), accountKeys: [key], firstAt: now, lastAt: now },
      });
  if (isSpike(row, now)) await flagSpike(row.id, now);
}

async function flagSpike(id: string, now: Date): Promise<void> {
  const row = await db.platformApiError.update({ where: { id }, data: { flagged: true, flaggedAt: now } });
  const accounts = new Set(row.accountKeys).size;
  const update = await db.platformUpdate.upsert({
    where: { dedupeKey: `error-spike:${row.signature}` },
    create: {
      platform: "META",
      dedupeKey: `error-spike:${row.signature}`,
      title: `Possible Meta API behavior change: ${row.requestType} failing (code ${row.code ?? "?"}${row.subcode ? `/${row.subcode}` : ""})`,
      excerpt: `${row.message}\n\nEndpoint: ${row.method} ${row.endpoint} (${row.apiVersion}). Seen ${row.count}× across ${accounts} accounts since ${row.firstAt.toISOString()}.`,
      changeType: "ERROR_SPIKE",
      areas: [row.requestType.startsWith("create") ? "campaign-creation" : row.requestType === "publishing" ? "publishing" : row.requestType === "auth" ? "permissions" : "api-version"],
      urgency: "HIGH",
      risk: "UNKNOWN",
      compatibility: "NOT_APPLICABLE",
    },
    update: {},
  });
  await db.platformApiError.update({ where: { id }, data: { updateId: update.id } });
  await raiseAlert({ key: `error-spike:${row.signature}`, severity: "HIGH", title: "Possible Meta API behavior change", body: `An error MAIRO hadn't seen before is hitting ${accounts} accounts: "${row.message.slice(0, 200)}" on ${row.method} ${row.endpoint}. Check it against Meta's current documentation.`, href: `/aios/meta-intelligence/updates/${update.id}` });
}

/** The daily backstop: flag any spike the per-error check missed. */
export async function errorSweep(now = new Date()): Promise<number> {
  const recent = await db.platformApiError.findMany({ where: { platform: "META", flagged: false, firstAt: { gte: new Date(now.getTime() - 48 * 3600_000) } } });
  let flagged = 0;
  for (const r of recent) if (isSpike(r, now)) {
    await flagSpike(r.id, now);
    flagged++;
  }
  return flagged;
}
