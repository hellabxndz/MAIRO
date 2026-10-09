import { db } from "@/lib/db";
import { recordActivity } from "@/lib/activity/log";
import { loadMetaConnection } from "@/lib/meta/connection";
import { fetchAdAccounts } from "@/lib/meta/oauth";
import { accountStatusLabel, switchRefusal, type ManagedCampaigns } from "@/lib/meta/account-choice";

/**
 * MAIRO campaigns that exist in Meta and haven't been removed — the ones that
 * tie the business to the ad account they were built in.
 */
export async function managedMetaCampaigns(organizationId: string): Promise<ManagedCampaigns> {
  const rows = await db.mairoCampaign.findMany({
    where: {
      organizationId,
      status: { not: "ARCHIVED" },
      platformCampaigns: { some: { platform: "META", externalCampaignId: { not: null } } },
    },
    select: { name: true },
    orderBy: { createdAt: "asc" },
  });
  return { count: rows.length, names: rows.map((r) => r.name) };
}

export type AdAccountChoice = { id: string; name: string; status: number; label: string };

/** The ad accounts this Meta login can reach, as Meta reports them now. */
export async function listAdAccounts(accessToken: string): Promise<AdAccountChoice[]> {
  const accounts = await fetchAdAccounts(accessToken);
  return accounts.map((a) => ({ id: a.id, name: a.name || a.id, status: a.account_status, label: accountStatusLabel(a.account_status) }));
}

/**
 * Points MAIRO at a different ad account of the same Meta login.
 *
 * The id is checked against what Meta says this token can reach rather than
 * trusted from the request, and the switch waits while MAIRO still manages
 * campaigns in the current account (see account-choice.ts). What MAIRO had
 * learned about the old account's capabilities is dropped so it's read again
 * for the new one, and the change is written to the activity log.
 */
export async function switchMetaAdAccount(input: { organizationId: string; adAccountId: string; actorUserId: string | null }): Promise<{ ok: true; changed: boolean } | { ok: false; error: string }> {
  const connection = await loadMetaConnection(input.organizationId);
  if (!connection) return { ok: false, error: "Connect a Meta account first." };

  let accounts: Awaited<ReturnType<typeof fetchAdAccounts>>;
  try {
    accounts = await fetchAdAccounts(connection.accessToken);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? `Meta wouldn't confirm your ad accounts: ${error.message}` : "Meta wouldn't confirm your ad accounts." };
  }
  const chosen = accounts.find((a) => a.id === input.adAccountId);
  if (!chosen) return { ok: false, error: "That ad account isn't one this Meta login can manage." };
  if (chosen.id === connection.metaAdAccountId) return { ok: true, changed: false };

  const refusal = switchRefusal({ current: connection.metaAdAccountId, next: chosen.id, managed: await managedMetaCampaigns(input.organizationId) });
  if (refusal) return { ok: false, error: refusal };

  await db.$transaction([
    db.metaAdAccount.update({ where: { organizationId: input.organizationId }, data: { metaAdAccountId: chosen.id } }),
    db.platformAccountCapability.deleteMany({ where: { organizationId: input.organizationId, platform: "META" } }),
  ]);
  await recordActivity({
    organizationId: input.organizationId,
    action: "switch-ad-account",
    summary: `Switched the Meta ad account to ${chosen.name || chosen.id}`,
    reason: "Chosen on the Meta connection screen.",
    before: connection.metaAdAccountId,
    after: chosen.id,
    automatic: false,
    actorUserId: input.actorUserId,
  }).catch((error) => console.error("Couldn't record the ad account switch:", error));
  return { ok: true, changed: true };
}
