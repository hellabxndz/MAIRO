import { db } from "@/lib/db";
import { metaGraphRequest } from "@/lib/meta/client";

// Capability discovery: not every Meta account has the same features. Country,
// account, permissions, rollout stage and beta access all matter, so MAIRO
// checks the business's own ad account rather than assuming, and never shows
// a feature as available without it.

export async function discoverAccount(organizationId: string): Promise<{ ok: boolean; error?: string }> {
  const account = await db.metaAdAccount.findUnique({ where: { organizationId }, select: { metaAdAccountId: true, accessToken: true, status: true } });
  if (!account || account.status !== "CONNECTED") return { ok: false, error: "No connected Meta ad account." };
  try {
    const [info, perms] = await Promise.all([
      metaGraphRequest<{ account_status?: number; currency?: string; business_country_code?: string; capabilities?: string[] }>(`/${account.metaAdAccountId}`, {
        accessToken: account.accessToken,
        params: { fields: "account_status,currency,business_country_code,capabilities" },
      }),
      metaGraphRequest<{ data?: { permission: string; status: string }[] }>("/me/permissions", { accessToken: account.accessToken }),
    ]);
    const data = {
      adAccountId: account.metaAdAccountId,
      country: info.business_country_code ?? null,
      currency: info.currency ?? null,
      accountStatus: info.account_status ?? null,
      capabilities: Array.isArray(info.capabilities) ? info.capabilities.slice(0, 200) : [],
      permissions: (perms.data ?? []).filter((p) => p.status === "granted").map((p) => p.permission),
      checkedAt: new Date(),
      error: null,
    };
    await db.platformAccountCapability.upsert({ where: { platform_organizationId: { platform: "META", organizationId } }, create: { platform: "META", organizationId, ...data }, update: data });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Unknown error";
    await db.platformAccountCapability.upsert({ where: { platform_organizationId: { platform: "META", organizationId } }, create: { platform: "META", organizationId, error: message }, update: { error: message, checkedAt: new Date() } });
    return { ok: false, error: message };
  }
}

export type Eligibility = { eligible: boolean; reasons: string[] };

/** Whether this account can use a feature, from what Meta told MAIRO about it. Pure. */
export function eligibility(
  feature: { availability: string; permissions: string[]; regionRestrictions: string[]; deprecated: boolean },
  account: { country: string | null; permissions: string[]; capabilities: string[]; accountStatus: number | null } | null,
): Eligibility {
  const reasons: string[] = [];
  if (feature.deprecated) reasons.push("Meta is retiring it.");
  if (!account) return { eligible: false, reasons: [...reasons, "MAIRO hasn't checked this ad account yet."] };
  if (account.accountStatus !== null && account.accountStatus !== 1) reasons.push("The ad account isn't active.");
  const missing = feature.permissions.filter((p) => !account.permissions.includes(p));
  if (missing.length) reasons.push(`Missing permission: ${missing.join(", ")}.`);
  if (feature.regionRestrictions.length && (!account.country || !feature.regionRestrictions.includes(account.country))) reasons.push(`Only available in ${feature.regionRestrictions.join(", ")}.`);
  if (["BETA", "ALPHA", "LIMITED", "UNKNOWN"].includes(feature.availability)) reasons.push(feature.availability === "UNKNOWN" ? "Its availability hasn't been verified." : `It's in ${feature.availability.toLowerCase()} rollout; MAIRO can't confirm this account has it.`);
  return { eligible: reasons.length === 0, reasons };
}

/** Refreshes a few accounts whose capability check is oldest. */
export async function discoverySweep(limit = 5, now = new Date()): Promise<number> {
  const accounts = await db.metaAdAccount.findMany({ where: { status: "CONNECTED" }, select: { organizationId: true }, take: 200 });
  const checked = await db.platformAccountCapability.findMany({ where: { platform: "META", organizationId: { in: accounts.map((a) => a.organizationId) } }, select: { organizationId: true, checkedAt: true } });
  const at = new Map(checked.map((c) => [c.organizationId, c.checkedAt.getTime()]));
  const due = accounts
    .filter((a) => now.getTime() - (at.get(a.organizationId) ?? 0) > 7 * 86_400_000)
    .sort((a, b) => (at.get(a.organizationId) ?? 0) - (at.get(b.organizationId) ?? 0))
    .slice(0, limit);
  let done = 0;
  for (const a of due) if ((await discoverAccount(a.organizationId)).ok) done++;
  return done;
}
