import type { LeadStatus } from "@/generated/prisma/enums";
import type { PlatformMetrics } from "@/lib/ad-platforms/types";
import { resultsFor } from "@/lib/protection/rules";
import { STAGE } from "@/lib/leads/outcomes";
import type { CoachInput, CoachLead, Funnel, Period, StepChange } from "./types";

// The customer acquisition journey, step by step:
//   spend → impressions → clicks → leads → contacted → good leads →
//   appointments → estimates → customers → revenue
// from Meta's figures for the ads and the business's own marks for
// everything after the form. Each number keeps its source: Meta's lead count
// and MAIRO's stored leads are never added together (that would count one
// person twice), and a value the business expects is never revenue.
//
// Pure; pinned by scripts/check-coach.ts.

const DAY = 86_400_000;
const HOUR = 3_600_000;

/** A lead counts toward a stage rate only once it has had time to get there. */
export const MATURE_DAYS = { qualified: 3, appointment: 7, customer: 14 } as const;
/** The smallest samples a rate is worth comparing on. */
export const MIN = { clicks: 100, judged: 8, qualified: 5, appointments: 5, contacted: 5, impressions: 3000, spendCents: 5_000 } as const;

export const inPeriod = (d: Date, p: Period) => d >= p.since && d.getTime() < p.until.getTime() + DAY;
const at = (s: LeadStatus, stage: LeadStatus) => STAGE[s] >= STAGE[stage];
export const per = (cents: number | null, count: number | null): number | null => (cents !== null && cents > 0 && count !== null && count > 0 ? Math.round(cents / count) : null);
export const share = (part: number, whole: number): number | null => (whole > 0 ? part / whole : null);

function sum(ms: (PlatformMetrics | null)[], key: "spendCents" | "impressions" | "reach" | "clicks" | "purchases" | "revenueCents"): number | null {
  const vals = ms.map((m) => m?.[key]).filter((v): v is number => typeof v === "number");
  return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Leads judged by the business: good or later, not a fit, or spam. */
export const isJudged = (l: CoachLead) => at(l.status, "QUALIFIED") || l.status === "LOST" || l.status === "SPAM";

export function leadsIn(input: CoachInput, which: "current" | "previous", campaignId?: string | null): CoachLead[] {
  const p = input[which];
  return input.leads.filter((l) => inPeriod(l.createdAt, p) && (!campaignId || l.mairoCampaignId === campaignId));
}

/** Hours from enquiry to the first contact the business logged. */
export const responseHours = (l: CoachLead) => (l.firstContactedAt ? Math.max(0, (l.firstContactedAt.getTime() - l.createdAt.getTime()) / HOUR) : null);

export function funnelFor(input: CoachInput, which: "current" | "previous", campaignId?: string | null): Funnel {
  const camps = campaignId ? input.campaigns.filter((c) => c.mairoCampaignId === campaignId) : input.campaigns;
  const ms = camps.map((c) => c[which]);
  const spendCents = sum(ms, "spendCents");
  const leadCamps = camps.filter((c) => c.objective === "LEADS");
  const metaLeadVals = leadCamps.map((c) => resultsFor("LEADS", c[which])).filter((v): v is number => typeof v === "number");
  const metaLeads = metaLeadVals.length ? metaLeadVals.reduce((a, b) => a + b, 0) : null;
  const salesCamps = camps.filter((c) => c.objective === "SALES");
  const metaPurchases = salesCamps.length ? sum(salesCamps.map((c) => c[which]), "purchases") : null;
  const metaRevenueCents = salesCamps.length ? sum(salesCamps.map((c) => c[which]), "revenueCents") : null;

  const ls = leadsIn(input, which, campaignId);
  const spam = ls.filter((l) => l.status === "SPAM").length;
  const real = ls.length - spam;
  const count = (stage: LeadStatus) => ls.filter((l) => at(l.status, stage)).length;
  const won = ls.filter((l) => l.status === "WON");
  const valued = won.filter((l) => (l.valueCents ?? 0) > 0);
  const verifiedRevenueCents = valued.length ? valued.reduce((a, l) => a + l.valueCents!, 0) : null;
  const open = ls.filter((l) => l.status === "ESTIMATE_SENT" && (l.estimatedValueCents ?? 0) > 0);
  const responses = ls.map(responseHours).filter((h): h is number => h !== null);

  const leadSource: Funnel["leadSource"] = real > 0 ? "recorded" : metaLeads ? "meta" : "none";
  const leadsForCost = leadSource === "recorded" ? real : leadSource === "meta" ? metaLeads : null;
  const qualified = count("QUALIFIED");
  const customers = won.length;

  return {
    spendCents,
    impressions: sum(ms, "impressions"),
    reach: sum(ms, "reach"),
    clicks: sum(ms, "clicks"),
    metaLeads,
    metaPurchases,
    metaRevenueCents,
    leads: real,
    spam,
    judged: ls.filter(isJudged).length,
    unmarked: ls.filter((l) => l.status === "NEW").length,
    contacted: ls.filter((l) => at(l.status, "CONTACTED") || l.firstContactedAt).length,
    qualified,
    appointments: count("BOOKED"),
    estimates: count("ESTIMATE_SENT"),
    customers,
    lost: ls.filter((l) => l.status === "LOST").length,
    verifiedRevenueCents,
    estimatedValueCents: open.length ? open.reduce((a, l) => a + l.estimatedValueCents!, 0) : null,
    costPerLeadCents: per(spendCents, leadsForCost),
    costPerQualifiedCents: per(spendCents, qualified),
    cacCents: per(spendCents, customers),
    roasVerified: verifiedRevenueCents && spendCents ? verifiedRevenueCents / spendCents : null,
    roasReported: metaRevenueCents && spendCents ? metaRevenueCents / spendCents : null,
    medianResponseHours: median(responses),
    responseSample: responses.length,
    waitingForContact: ls.filter((l) => l.status === "NEW" && !l.firstContactedAt && input.now.getTime() - l.createdAt.getTime() >= 24 * HOUR).length,
    leadSource,
  };
}

const mature = (ls: CoachLead[], now: Date, days: number) => ls.filter((l) => now.getTime() - l.createdAt.getTime() >= days * DAY);

/** A stage rate, on leads old enough to have reached it, or null below the sample. */
export function stageRate(input: CoachInput, which: "current" | "previous", step: "click-lead" | "lead-qualified" | "qualified-appointment" | "appointment-customer", campaignId?: string | null): { rate: number; sample: number } | null {
  const f = funnelFor(input, which, campaignId);
  const ls = leadsIn(input, which, campaignId);
  switch (step) {
    case "click-lead": {
      const leads = f.leadSource === "recorded" ? f.leads : f.metaLeads;
      if (!f.clicks || f.clicks < MIN.clicks || leads === null) return null;
      return { rate: leads / f.clicks, sample: f.clicks };
    }
    case "lead-qualified": {
      const judged = mature(ls, input.now, MATURE_DAYS.qualified).filter(isJudged);
      if (judged.length < MIN.judged) return null;
      return { rate: judged.filter((l) => at(l.status, "QUALIFIED")).length / judged.length, sample: judged.length };
    }
    case "qualified-appointment": {
      const good = mature(ls, input.now, MATURE_DAYS.appointment).filter((l) => at(l.status, "QUALIFIED"));
      if (good.length < MIN.qualified) return null;
      return { rate: good.filter((l) => at(l.status, "BOOKED")).length / good.length, sample: good.length };
    }
    case "appointment-customer": {
      const booked = mature(ls, input.now, MATURE_DAYS.customer).filter((l) => at(l.status, "BOOKED"));
      if (booked.length < MIN.appointments) return null;
      return { rate: booked.filter((l) => l.status === "WON").length / booked.length, sample: booked.length };
    }
  }
}

const STEP_LABEL = {
  "click-lead": "Clicks that became leads",
  "lead-qualified": "Leads that were good ones",
  "qualified-appointment": "Good leads that booked",
  "appointment-customer": "Bookings that became customers",
} as const;

export function stepChanges(input: CoachInput): StepChange[] {
  return (Object.keys(STEP_LABEL) as (keyof typeof STEP_LABEL)[]).flatMap((step) => {
    const cur = stageRate(input, "current", step);
    if (!cur) return [];
    const prev = stageRate(input, "previous", step);
    return [{ step, label: STEP_LABEL[step], current: cur.rate, previous: prev?.rate ?? null, change: prev && prev.rate > 0 ? (cur.rate - prev.rate) / prev.rate : null }];
  });
}

/**
 * Where people drop out, in a sentence — only when the numbers are enough to
 * say it, and saying plainly when the drop is after the lead, where changing
 * the ads may not be what helps.
 */
export function whereItDrops(input: CoachInput): string | null {
  const clickLead = stageRate(input, "current", "click-lead");
  if (clickLead && clickLead.rate === 0) return "People are clicking your ads, but nobody has filled in the form or bought yet. The drop is between the click and the enquiry.";
  const quality = stageRate(input, "current", "lead-qualified");
  if (quality && quality.rate < 0.35) return "Leads are coming in, but most of the ones you've marked weren't right for you. The drop is in lead quality.";
  const booking = stageRate(input, "current", "qualified-appointment");
  if (booking && booking.rate < 0.3) return "Good leads are coming in, but few are booking. That happens after someone becomes a lead, so changing the ads may not be what helps most.";
  const closing = stageRate(input, "current", "appointment-customer");
  if (closing && closing.rate === 0) return "Appointments are being booked, but none has become a customer yet. That's after the ad — the follow-up and the offer matter most there.";
  return null;
}
