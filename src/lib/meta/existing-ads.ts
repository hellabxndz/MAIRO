import { metaGraphRequest } from "@/lib/meta/client";
import { loadMetaConnection } from "@/lib/meta/connection";

// Ads the business already has in its own Meta ad account, offered to run
// again in a new campaign.
//
// Running one again means a new ad, in the new ad set, pointing at the same
// creative — Meta lets one creative serve many ads. The original ad is left
// exactly as it was: nothing here edits, pauses or deletes anything that
// already exists in the account.

export type AccountAd = {
  id: string;
  name: string;
  status: string;
  thumbnailUrl: string | null;
  headline: string | null;
  body: string | null;
  createdAt: string | null;
};

export type AdsResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Ads that could still run: not deleted, archived or rejected. */
const REUSABLE = ["ACTIVE", "PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED"];

export async function listAccountAds(organizationId: string, limit = 30): Promise<AdsResult<AccountAd[]>> {
  const connection = await loadMetaConnection(organizationId);
  if (!connection) return { ok: false, error: "Connect your Meta ad account first." };

  try {
    const res = await metaGraphRequest<{
      data?: {
        id: string;
        name?: string;
        effective_status?: string;
        created_time?: string;
        creative?: { id?: string; thumbnail_url?: string; title?: string; body?: string };
      }[];
    }>(`/${connection.metaAdAccountId}/ads`, {
      accessToken: connection.accessToken,
      params: {
        fields: "id,name,effective_status,created_time,creative{id,thumbnail_url,title,body}",
        filtering: JSON.stringify([{ field: "effective_status", operator: "IN", value: REUSABLE }]),
        limit,
      },
    });
    return {
      ok: true,
      data: (res.data ?? [])
        .filter((a) => a.creative?.id)
        .map((a) => ({
          id: a.id,
          name: a.name ?? "Untitled ad",
          status: a.effective_status ?? "UNKNOWN",
          thumbnailUrl: a.creative?.thumbnail_url ?? null,
          headline: a.creative?.title ?? null,
          body: a.creative?.body ?? null,
          createdAt: a.created_time ?? null,
        })),
    };
  } catch (error) {
    console.error("Listing Meta ads failed:", error);
    return { ok: false, error: "MAIRO couldn't read the ads in your Meta account just now. Try again in a moment." };
  }
}

/**
 * The creative behind an ad — only if the ad is in this business's own ad
 * account. An id from anywhere else is refused rather than run.
 */
export async function creativeOfAccountAd(
  adAccountId: string,
  accessToken: string,
  adId: string
): Promise<AdsResult<string>> {
  if (!/^\d{5,25}$/.test(adId)) return { ok: false, error: "That isn't a Meta ad id." };
  try {
    const res = await metaGraphRequest<{ account_id?: string; creative?: { id?: string } }>(`/${adId}`, {
      accessToken,
      params: { fields: "account_id,creative{id}" },
    });
    const account = adAccountId.replace(/^act_/, "");
    if (res.account_id !== account) return { ok: false, error: "That ad isn't in your connected ad account." };
    if (!res.creative?.id) return { ok: false, error: "Meta didn't return the creative for that ad." };
    return { ok: true, data: res.creative.id };
  } catch (error) {
    console.error("Reading a Meta ad's creative failed:", error);
    return { ok: false, error: "MAIRO couldn't read the ad you picked from your Meta account. It may have been deleted." };
  }
}
