import type { NotificationKind, NotificationSeverity } from "@/generated/prisma/enums";
import type { SmsKind } from "@/lib/sms/send";

// What each kind of notification is, and which switch governs it.
//
// Deliberately a small, closed list. A notification centre earns its place by
// being worth opening, and the fastest way to make one worthless is to let
// every event in the product write to it — after which people stop looking,
// including at the one that says their ad account disconnected.
//
// So the bar is: would a business owner want to be interrupted by this, and
// can MAIRO say something specific about it from real figures? Anything that
// fails either test belongs in the activity log, not here.

export type KindInfo = {
  kind: NotificationKind;
  /** The group heading in the centre. */
  label: string;
  severity: NotificationSeverity;
  /**
   * Which text preference covers it, when the business asked to be texted.
   *
   * Null means "never a text, however loud it is in the app" — a monthly
   * report is worth a card and is not worth a phone buzzing.
   */
  sms: SmsKind | null;
};

export const KINDS: Record<NotificationKind, KindInfo> = {
  CAMPAIGN_LIVE: {
    kind: "CAMPAIGN_LIVE",
    label: "Campaign live",
    severity: "INFO",
    sms: "campaign-live",
  },
  NEEDS_ATTENTION: {
    kind: "NEEDS_ATTENTION",
    label: "Needs attention",
    severity: "WARNING",
    sms: "needs-attention",
  },
  BUDGET_OPPORTUNITY: {
    kind: "BUDGET_OPPORTUNITY",
    label: "Opportunity",
    severity: "OPPORTUNITY",
    sms: "budget-change",
  },
  CREATIVE_FATIGUE: {
    kind: "CREATIVE_FATIGUE",
    label: "Creative fatigue",
    severity: "WARNING",
    sms: "needs-attention",
  },
  CREATIVES_READY: {
    kind: "CREATIVES_READY",
    label: "New creatives",
    severity: "INFO",
    sms: null,
  },
  MONTHLY_REPORT: {
    kind: "MONTHLY_REPORT",
    label: "Monthly report",
    severity: "INFO",
    sms: null,
  },
  // The one report worth a text: short, weekly, and only for businesses that
  // switched weekly texts on.
  WEEKLY_REPORT: {
    kind: "WEEKLY_REPORT",
    label: "Weekly report",
    severity: "INFO",
    sms: "weekly-summary",
  },
  PAYMENT_ISSUE: {
    kind: "PAYMENT_ISSUE",
    label: "Payment",
    severity: "WARNING",
    sms: null,
  },
  ACCOUNT_DISCONNECTED: {
    kind: "ACCOUNT_DISCONNECTED",
    label: "Account disconnected",
    severity: "WARNING",
    sms: "needs-attention",
  },
  MAIRO_ACTED: {
    kind: "MAIRO_ACTED",
    label: "MAIRO made a change",
    severity: "INFO",
    sms: "budget-change",
  },
  COACH_ALERT: {
    kind: "COACH_ALERT",
    label: "Performance Coach",
    severity: "WARNING",
    sms: null,
  },
  // Cancelling MAIRO doesn't stop Meta spending. Worth a text when campaigns
  // are still running, because that's the money that keeps moving.
  SUBSCRIPTION_CHANGE: {
    kind: "SUBSCRIPTION_CHANGE",
    label: "Subscription",
    severity: "WARNING",
    sms: "needs-attention",
  },

};

export function kindInfo(kind: NotificationKind): KindInfo {
  return KINDS[kind];
}

/** Colour vocabulary, matching the rest of the product's badges. */
export function severityTone(severity: NotificationSeverity): "green" | "yellow" | "blue" {
  if (severity === "WARNING") return "yellow";
  if (severity === "OPPORTUNITY") return "green";
  return "blue";
}

/**
 * Which notifications a business may switch off. Problems that stop ads
 * (needs attention, tired ads, payment, a lost connection), a campaign going
 * live, and anything MAIRO did on its own are always sent — those are the
 * ones a business must never miss. Opportunities and report announcements
 * are optional; the reports themselves are still written either way.
 */
export function optionalGroup(kind: NotificationKind): "opportunities" | "reports" | "coach" | null {
  if (kind === "BUDGET_OPPORTUNITY" || kind === "CREATIVES_READY") return "opportunities";
  if (kind === "WEEKLY_REPORT" || kind === "MONTHLY_REPORT") return "reports";
  if (kind === "COACH_ALERT") return "coach";
  return null;
}
