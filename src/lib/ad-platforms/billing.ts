import type { AdPlatform } from "@/generated/prisma/enums";

// Where the customer's ad money actually comes from, and how to get them to it.
//
// The one rule this whole module exists to respect: MAIRO never takes custody
// of ad spend. The customer pays Meta, and later TikTok, directly from a card
// on their own advertising account. That is what the Terms promise, it is what
// keeps MAIRO from being a money transmitter, and nothing here moves a penny.
//
// What it does instead is the part that was missing. A business owner who has
// never advertised does not know that connecting an ad account and putting a
// card on it are two different things — so they connect, create a campaign,
// watch nothing happen, and have no way to find out why. This reads the
// account's real funding state from the network and hands them a link straight
// into the right page, already logged in, because they authorized us from that
// same browser session.

export type FundingState =
  /** A payment method is attached and the account can spend. */
  | "funded"
  /** Connected and healthy, but there is no way to charge it. */
  | "no_payment_method"
  /** Prepaid balance that has run out. */
  | "out_of_credit"
  /** The network has disabled the account — usually billing or policy. */
  | "account_disabled"
  /** We could not read it. Never guessed at. */
  | "unknown";

export type BillingStatus = {
  platform: AdPlatform;
  state: FundingState;
  /** e.g. "Visa ·1234", from the network. Null when there is none. */
  paymentMethod: string | null;
  /** ISO code the account bills in. Money below is in its minor units. */
  currency: string | null;
  /** Prepaid balance, for accounts that work that way. */
  balanceCents: number | null;
  /** Lifetime spend on the account, as the network reports it. */
  amountSpentCents: number | null;
  /** The customer's own cap, if they set one on the network. */
  spendCapCents: number | null;
  /** True for prepaid accounts, where "add funds" replaces "add a card". */
  prepay: boolean;
  /** Safe to show. Set whenever state is not "funded". */
  message: string | null;
  /** Deep link to the page that fixes it. */
  actionUrl: string | null;
  /** What the button should say. */
  actionLabel: string | null;
};

export const UNKNOWN_BILLING = (platform: AdPlatform): BillingStatus => ({
  platform,
  state: "unknown",
  paymentMethod: null,
  currency: null,
  balanceCents: null,
  amountSpentCents: null,
  spendCapCents: null,
  prepay: false,
  message: null,
  actionUrl: null,
  actionLabel: null,
});

/**
 * Meta ad account ids arrive as "act_123456"; every billing URL wants the bare
 * number. Getting this wrong produces a page that loads and shows the wrong
 * account, which is worse than an error.
 */
export function bareAccountId(id: string): string {
  return id.replace(/^act_/, "");
}

/**
 * Where to send someone to put a card on their Meta ad account.
 *
 * These are Meta's own surfaces and Meta moves them about, so both links are
 * built from the same account id and there is a plain Ads Manager fallback in
 * the UI. The customer is already signed in — they authorized MAIRO from this
 * browser — so following one lands them on their own account rather than a
 * login wall.
 */
export function metaPaymentSettingsUrl(adAccountId: string): string {
  return `https://business.facebook.com/billing_hub/payment_settings?asset_id=${bareAccountId(adAccountId)}`;
}

export function metaBillingHubUrl(adAccountId: string): string {
  return `https://business.facebook.com/billing_hub/accounts?asset_id=${bareAccountId(adAccountId)}`;
}

export function metaAdsManagerUrl(adAccountId: string): string {
  return `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${bareAccountId(adAccountId)}`;
}

/** TikTok bills the advertiser account the same way; this is its equivalent. */
export function tiktokBillingUrl(advertiserId: string): string {
  return `https://ads.tiktok.com/i18n/account/payment?aadvid=${advertiserId}`;
}

export function billingUrlFor(platform: AdPlatform, accountId: string): string | null {
  if (platform === "META") return metaPaymentSettingsUrl(accountId);
  if (platform === "TIKTOK") return tiktokBillingUrl(accountId);
  return null;
}

/**
 * Meta's account_status, in words.
 *
 * Only 1 can spend. The rest are the reasons a campaign silently never
 * delivers, and every one of them is worth saying out loud rather than
 * leaving the customer to discover it from an empty dashboard.
 */
export function metaAccountStatusMessage(status: number | null): string | null {
  switch (status) {
    case 1:
      return null; // ACTIVE
    case 2:
      return "Meta has disabled this ad account. That is usually an unpaid balance or a policy decision — Meta's billing page will say which.";
    case 3:
      return "This ad account is unsettled: Meta is waiting on a payment before it will run anything else.";
    case 7:
      return "This ad account is pending review by Meta. Campaigns cannot deliver until that clears.";
    case 8:
      return "This ad account has hit its spending limit. Raise it on Meta and campaigns will resume.";
    case 9:
      return "This ad account is in a grace period after a failed payment. Update the card to keep campaigns running.";
    case 100:
      return "Meta has closed this ad account.";
    default:
      return status === null
        ? null
        : "Meta reports this ad account cannot currently run ads. Its billing page will say why.";
  }
}
