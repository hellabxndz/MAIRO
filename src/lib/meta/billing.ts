import { metaGraphRequest } from "@/lib/meta/client";
import { loadMetaConnection } from "@/lib/meta/connection";
import {
  metaAccountStatusMessage,
  metaPaymentSettingsUrl,
  UNKNOWN_BILLING,
  type BillingStatus,
} from "@/lib/ad-platforms/billing";

// Reading whether the customer's Meta ad account can actually pay for anything.
//
// This is one Graph call and it answers the question the dashboard could not
// answer before: a campaign that has been created, looks fine, and delivers
// nothing is almost always an account with no card on it. Meta knows; nobody
// was asking.
//
// Everything here is read-only and it never throws. Same contract as the rest
// of the reporting code: a slow or unhappy Meta must not take the page down,
// and a figure MAIRO could not read comes back null rather than zero.

type FundingSourceDetails = {
  id?: string;
  type?: number;
  display_string?: string;
};

type AdAccountBillingFields = {
  account_status?: number;
  disable_reason?: number;
  currency?: string;
  balance?: string;
  amount_spent?: string;
  spend_cap?: string;
  is_prepay_account?: boolean;
  funding_source_details?: FundingSourceDetails;
};

/** Meta returns money as a string of minor units. */
function minorUnits(value: string | undefined): number | null {
  if (value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export async function fetchMetaBillingStatus(
  organizationId: string
): Promise<BillingStatus> {
  const connection = await loadMetaConnection(organizationId);
  if (!connection || connection.status !== "CONNECTED") {
    return UNKNOWN_BILLING("META");
  }

  const accountId = connection.metaAdAccountId;
  const actionUrl = metaPaymentSettingsUrl(accountId);

  let row: AdAccountBillingFields;
  try {
    row = await metaGraphRequest<AdAccountBillingFields>(`/${accountId}`, {
      accessToken: connection.accessToken,
      params: {
        fields:
          "account_status,disable_reason,currency,balance,amount_spent,spend_cap,is_prepay_account,funding_source_details",
      },
    });
  } catch {
    // Unreadable is its own answer, and a different one from "no card". Saying
    // nothing is better than telling somebody their billing is broken because
    // Meta timed out.
    return { ...UNKNOWN_BILLING("META"), actionUrl, actionLabel: "Open Meta billing" };
  }

  const status = row.account_status ?? null;
  const funding = row.funding_source_details;
  // display_string is what Meta shows the user — "Visa ·1234", a PayPal
  // address, "Ad credit". Its absence is the signal that nothing is attached;
  // a funding source with an id but no display string is still a funding
  // source, so both are checked.
  const paymentMethod = funding?.display_string ?? null;
  const hasFunding = Boolean(funding?.id || paymentMethod);

  const prepay = row.is_prepay_account ?? false;
  const balanceCents = minorUnits(row.balance);

  const base: BillingStatus = {
    platform: "META",
    state: "funded",
    paymentMethod,
    currency: row.currency ?? null,
    balanceCents,
    amountSpentCents: minorUnits(row.amount_spent),
    spendCapCents: minorUnits(row.spend_cap),
    prepay,
    message: null,
    actionUrl,
    actionLabel: prepay ? "Add funds on Meta" : "Manage payment on Meta",
  };

  // Order matters: a disabled account is the loudest problem and should not be
  // reported as merely unfunded.
  const statusMessage = metaAccountStatusMessage(status);
  if (statusMessage) {
    return {
      ...base,
      state: "account_disabled",
      message: statusMessage,
      actionLabel: "Fix this on Meta",
    };
  }

  if (!hasFunding) {
    return {
      ...base,
      state: "no_payment_method",
      message:
        "There is no payment method on this Meta ad account yet, so Meta cannot run your ads. " +
        "Adding a card takes a minute and MAIRO never sees it — you pay Meta directly.",
      actionLabel: "Add a payment method on Meta",
    };
  }

  if (prepay && balanceCents !== null && balanceCents <= 0) {
    return {
      ...base,
      state: "out_of_credit",
      message:
        "This is a prepaid Meta ad account and its balance has run out. Ads stop until it is topped up.",
      actionLabel: "Add funds on Meta",
    };
  }

  return base;
}

/**
 * What the customer has actually spent on ads this calendar month.
 *
 * Deliberately not derived from the campaign budgets: a daily budget is what
 * they authorized, not what Meta charged. This asks Meta what it actually
 * billed, which is the number that matches their card statement — and that is
 * the only number worth putting next to the word "spend".
 */
export async function fetchMonthToDateSpendCents(
  organizationId: string
): Promise<number | null> {
  const connection = await loadMetaConnection(organizationId);
  if (!connection || connection.status !== "CONNECTED") return null;

  const now = new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  try {
    const res = await metaGraphRequest<{ data: { spend?: string }[] }>(
      `/${connection.metaAdAccountId}/insights`,
      {
        accessToken: connection.accessToken,
        params: {
          fields: "spend",
          time_range: JSON.stringify({
            since: since.toISOString().slice(0, 10),
            until: now.toISOString().slice(0, 10),
          }),
        },
      }
    );
    const spend = res.data[0]?.spend;
    if (spend === undefined) return null;
    const n = Number(spend);
    // Insights reports whole currency units, unlike the account node's minor
    // units. Mixing those two up is a hundredfold error in the number a
    // customer reads as "what I have spent this month".
    return Number.isFinite(n) ? Math.round(n * 100) : null;
  } catch {
    return null;
  }
}
