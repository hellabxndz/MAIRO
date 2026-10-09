import type { LeadStatus } from "@/generated/prisma/enums";
import { LEAD_OUTCOMES, STAGE } from "./outcomes";

// The business's own record of each lead: what the stages are called in its
// trade, why a lead was lost, and where follow-up stands.
//
// Everything here is what the business entered or chose. Response time is
// measured only from a contact the business logged — marking a lead "good"
// three days later says nothing about when they rang, so it is never read as
// a contact. Pure; pinned by scripts/check-coach.ts.

/** Why a lead didn't go anywhere. Kept short so the reasons can be counted. */
export const LOST_REASONS = [
  { key: "outside-area", label: "Outside our service area" },
  { key: "wrong-service", label: "Wanted something we don't offer" },
  { key: "price", label: "Price or budget" },
  { key: "not-ready", label: "Not ready yet" },
  { key: "no-response", label: "Never got back to us" },
  { key: "competitor", label: "Went with someone else" },
  { key: "other", label: "Something else" },
] as const;
export type LostReason = (typeof LOST_REASONS)[number]["key"];
export const isLostReason = (v: unknown): v is LostReason => LOST_REASONS.some((r) => r.key === v);
export const lostReasonLabel = (key: string | null) => LOST_REASONS.find((r) => r.key === key)?.label ?? null;

/** The stages a business can rename. NEW is always "New". */
export const RENAMEABLE: LeadStatus[] = ["CONTACTED", "QUALIFIED", "BOOKED", "ESTIMATE_SENT", "WON", "LOST", "SPAM"];

const DEFAULT_LABELS = Object.fromEntries(LEAD_OUTCOMES.map((o) => [o.status, o.label])) as Record<LeadStatus, string>;

/** Names the trade already uses, by what the business does. Only suggestions. */
const PRESETS: { test: RegExp; name: string; labels: Partial<Record<LeadStatus, string>> }[] = [
  { test: /roof|plumb|hvac|heating|cooling|contract|remodel|renovat|landscap|lawn|clean|pest|solar|paint|electric|garage|gutter|window|floor|fenc|concrete|pool|handyman|construction|moving/i, name: "Home services", labels: { BOOKED: "Inspection booked", ESTIMATE_SENT: "Estimate sent", WON: "Job won" } },
  { test: /spa|salon|dental|dentist|clinic|medical|chiro|derm|aesthetic|beauty|physio|therapy|wellness|fitness|gym|trainer/i, name: "Health and beauty", labels: { BOOKED: "Consultation booked", ESTIMATE_SENT: "Treatment plan sent", WON: "Became a client" } },
  { test: /real estate|realtor|realty|mortgage|property|broker/i, name: "Real estate", labels: { BOOKED: "Showing booked", ESTIMATE_SENT: "Offer made", WON: "Closed" } },
  { test: /auto|car |cars|detailing|dealership|mechanic|tire|vehicle/i, name: "Automotive", labels: { BOOKED: "Appointment booked", ESTIMATE_SENT: "Quote sent", WON: "Sold" } },
  { test: /law|attorney|legal|accountant|accounting|insurance|financial|advisor|consult/i, name: "Professional services", labels: { BOOKED: "Consultation booked", ESTIMATE_SENT: "Proposal sent", WON: "Signed" } },
];

export function presetFor(industry: string | null | undefined): { name: string; labels: Partial<Record<LeadStatus, string>> } | null {
  if (!industry) return null;
  const p = PRESETS.find((x) => x.test.test(` ${industry} `));
  return p ? { name: p.name, labels: p.labels } : null;
}

/** The business's saved names, cleaned: known stages only, trimmed, never empty. */
export function parseStageLabels(raw: string | null | undefined): Partial<Record<LeadStatus, string>> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return cleanStageLabels(parsed);
  } catch {
    return {};
  }
}

export function cleanStageLabels(input: Record<string, unknown>): Partial<Record<LeadStatus, string>> {
  const out: Partial<Record<LeadStatus, string>> = {};
  for (const stage of RENAMEABLE) {
    const v = input[stage];
    if (typeof v !== "string") continue;
    const label = v.replace(/\s+/g, " ").trim().slice(0, 40);
    if (label) out[stage] = label;
  }
  return out;
}

/** What each stage is called for this business: its own names, then its trade's, then MAIRO's. */
export function stageLabels(industry: string | null | undefined, raw: string | null | undefined): Record<LeadStatus, string> {
  return { ...DEFAULT_LABELS, ...(presetFor(industry)?.labels ?? {}), ...parseStageLabels(raw), NEW: "New" };
}

export type FollowUp =
  | { state: "closed" }
  | { state: "not-contacted"; hours: number }
  | { state: "due"; since: Date }
  | { state: "scheduled"; at: Date }
  | { state: "fine" };

/** A lead not contacted after this long is said to be waiting. */
export const WAITING_AFTER_HOURS = 24;

/** Where follow-up stands for one lead, from what the business recorded. */
export function followUpOf(
  lead: { status: LeadStatus; createdAt: Date; firstContactedAt: Date | null; nextFollowUpAt: Date | null },
  now: Date,
): FollowUp {
  if (lead.status === "WON" || lead.status === "LOST" || lead.status === "SPAM") return { state: "closed" };
  if (lead.nextFollowUpAt) return lead.nextFollowUpAt <= now ? { state: "due", since: lead.nextFollowUpAt } : { state: "scheduled", at: lead.nextFollowUpAt };
  const hours = (now.getTime() - lead.createdAt.getTime()) / 3_600_000;
  // Only a lead nobody has touched: a lead marked good or booked has plainly
  // been dealt with, even if the contact itself wasn't logged.
  if (lead.status === "NEW" && !lead.firstContactedAt && hours >= WAITING_AFTER_HOURS) return { state: "not-contacted", hours: Math.floor(hours) };
  return { state: "fine" };
}

/** Whether a status is at or past a stage. */
export const reached = (status: LeadStatus, stage: LeadStatus) => STAGE[status] >= STAGE[stage];
