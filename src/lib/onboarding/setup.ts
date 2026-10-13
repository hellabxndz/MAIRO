import { z } from "zod";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { normalizeUrl } from "@/lib/campaigns/destination";
import { urlProblem } from "@/lib/net/safe-fetch";
import { socialProfileFrom } from "@/lib/website/detect";
import { readWebsiteForPlan } from "@/lib/strategy/store";
import { loadBrain } from "@/lib/business/brain";
import { parseDraft, type OnboardingDraft } from "./draft";
import { recommendGoal, type SetupGoal } from "./goal";
import { UNSURE, businessTypeFrom } from "./business-types";

// --- The setup screens, saved as they go ---------------------------------------------
//
// Screen 1 (your business) and screen 3 (your goal) save a draft on the
// organization, so leaving halfway, or coming back on another device, starts
// where they stopped. Screen 2 is MAIRO reading the website — a real request,
// with the result kept so it isn't asked twice.

async function writeDraft(organizationId: string, change: (d: OnboardingDraft) => OnboardingDraft): Promise<OnboardingDraft> {
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { onboardingDraft: true } });
  const next = change(parseDraft(org?.onboardingDraft));
  await db.organization.update({ where: { id: organizationId }, data: { onboardingDraft: next as Prisma.InputJsonValue } });
  return next;
}

export const businessSchema = z.object({
  website: z.string().trim().max(300).optional(),
  industry: z.string().trim().max(120).optional(),
  offering: z.string().trim().max(200).optional(),
  customerLocation: z.string().trim().max(120).optional(),
  businessType: z.string().trim().max(40).optional(),
  reach: z.string().trim().max(60).optional(),
});

/** Screen 1: what the business is. Saved before MAIRO reads anything. */
export async function saveBusinessStep(organizationId: string, input: z.input<typeof businessSchema>): Promise<{ ok: true; website: string | null } | { ok: false; error: string }> {
  const parsed = businessSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Some answers are too long — shorten them a little." };
  const d = parsed.data;
  if (!d.offering && !d.industry) return { ok: false, error: "Tell MAIRO what your business does — a few words is enough." };
  const website = d.website ? normalizeUrl(d.website) : null;
  if (d.website && !website) return { ok: false, error: "That doesn't look like a web address. Something like yourbusiness.com — or leave it empty." };
  // A social profile isn't a website MAIRO can read: those networks only allow
  // it through their own approved access. Said here, with what to do instead.
  const social = website ? socialProfileFrom(website) : null;
  if (social) return { ok: false, error: `That's your ${social.network} page. MAIRO can't read ${social.network} profiles — add your website if you have one, or leave it empty and tell MAIRO about your business here. You can add your photos later.` };
  // Refused here, before it's saved, rather than failing quietly when MAIRO tries to read it.
  if (website && urlProblem(website)) return { ok: false, error: "MAIRO can only read public websites — something like yourbusiness.com. Leave it empty if your site isn't public yet." };
  try {
    const before = await db.organization.findUnique({ where: { id: organizationId }, select: { website: true } });
    await db.organization.update({ where: { id: organizationId }, data: { website, ...(d.industry ? { industry: d.industry } : {}) } });
    // A business type the owner chose decides which results they're measured
    // by (leads or sales) and the tracking they're offered. "Not sure" leaves
    // MAIRO guessing from what they do, and says so.
    const type = businessTypeFrom(d.businessType);
    if (type) {
      await db.trackingProfile.upsert({
        where: { organizationId },
        create: { organizationId, nicheId: type.id, nicheConfirmed: type.id !== "general" },
        update: { nicheId: type.id, nicheConfirmed: type.id !== "general" },
      });
    }
    await writeDraft(organizationId, (draft) => ({
      ...draft,
      screen: website ? "learn" : "goal",
      business: { website: website ?? undefined, industry: d.industry, offering: d.offering, customerLocation: d.customerLocation, businessType: type?.id ?? (d.businessType === UNSURE ? UNSURE : undefined), reach: d.reach, savedAt: new Date().toISOString() },
      // A different website means reading it again.
      learn: before?.website === website ? draft.learn : undefined,
    }));
    return { ok: true, website };
  } catch (error) {
    console.error("Saving the business step failed:", error);
    return { ok: false, error: "MAIRO couldn't save just now. Your answers are still on this page — try again in a moment." };
  }
}

/**
 * One thing MAIRO read on the website, with where it came from. `field` is
 * the Business Brain field, so the owner can correct or remove it right here;
 * a list (products, offers) is corrected in Business Brain itself.
 */
export type LearnedItem = { field: string; label: string; value: string; editable: boolean };
export type Learned = LearnedItem[];
/** What the plan needs that the website didn't show. */
export type Unknown = { field: string; label: string; ask: string };
export type LearnResult = { ok: true; read: boolean; learned: Learned; unknown: Unknown[]; pagesRead: string[]; note: string | null; suggestion: { goal: SetupGoal; why: string } };

/** Fields the owner may correct on the setup screen — plain text only. */
export const CORRECTABLE = ["overview", "serviceArea", "targetCustomer", "primaryCta"] as const;

/** Screen 2: MAIRO reads the website, and says what it found — only what it found. */
export async function learnBusiness(organizationId: string): Promise<LearnResult> {
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { website: true, industry: true, onboardingDraft: true } });
  const draft = parseDraft(org?.onboardingDraft);
  let read = false;
  let note: string | null = null;
  if (org?.website) {
    try {
      const r = await readWebsiteForPlan(organizationId);
      read = r.read;
      note = r.read ? null : (r.note ?? "MAIRO couldn't read your website, so your plan's website advice will be general.");
    } catch (error) {
      console.error("Reading the website during setup failed:", error);
      note = "MAIRO couldn't read your website just now, so your plan's website advice will be general. You can carry on.";
    }
    await writeDraft(organizationId, (d) => ({ ...d, screen: "goal", learn: { at: new Date().toISOString(), ok: read, note } }));
  }
  const brain = read ? await loadBrain(organizationId) : null;
  const p = brain?.profile;
  const learned: Learned = p
    ? [
        { field: "overview", label: "What you do", value: p.overview, editable: true },
        { field: "products", label: "Products and services", value: p.products.slice(0, 5).map((x) => x.name).join(", "), editable: false },
        { field: "serviceArea", label: "Where", value: [p.location, p.serviceArea].filter(Boolean).join(" · "), editable: true },
        { field: "targetCustomer", label: "Who it's for", value: p.targetCustomer, editable: true },
        { field: "offers", label: "Offers on your site", value: p.offers.slice(0, 3).join("; "), editable: false },
        { field: "primaryCta", label: "Your website's main button", value: p.primaryCta, editable: true },
      ].filter((x) => x.value && x.value.trim())
    : [];
  // What a plan needs and the website didn't say — asked on the next screen,
  // never filled in by guessing.
  const unknown: Unknown[] = read && p
    ? [
        ...(!p.offers.length ? [{ field: "offers", label: "A current offer", ask: "Add one on the next screen if you really run one — or leave it, and your ads won't promise one." }] : []),
        ...(!p.location && !p.serviceArea ? [{ field: "serviceArea", label: "Where you work", ask: "Tell MAIRO on the first screen, or correct it here." }] : []),
        ...(!p.targetCustomer ? [{ field: "targetCustomer", label: "Who your best customers are", ask: "Optional — MAIRO works it out from your goal if you leave it." }] : []),
      ]
    : [];
  return {
    ok: true,
    read,
    learned,
    unknown,
    pagesRead: brain?.analysis?.pagesRead ?? (brain?.analyzedUrl ? [brain.analyzedUrl] : []),
    note,
    suggestion: recommendGoal({ industry: org?.industry ?? draft.business?.industry, primaryCta: p?.primaryCta, offering: draft.business?.offering ?? p?.overview, presence: p?.presence }),
  };
}

export const goalDraftSchema = z.object({
  primaryGoal: z.string().max(40).optional(),
  monthlyBudget: z.coerce.number().min(0).max(1_000_000).optional(),
  destinationType: z.string().max(40).optional(),
  messageChannel: z.string().max(40).optional(),
  phone: z.string().max(40).optional(),
  currentOffer: z.string().max(200).optional(),
  targetAudience: z.string().max(1000).optional(),
  brandVoice: z.string().max(1000).optional(),
  competitors: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
  budgetSuggested: z.boolean().optional(),
});

/** Screen 3, saved as they go (and by "Save and finish later"). */
export async function saveGoalDraft(organizationId: string, input: z.input<typeof goalDraftSchema>): Promise<{ ok: boolean }> {
  const parsed = goalDraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  try {
    await writeDraft(organizationId, (d) => ({ ...d, screen: "goal", goal: parsed.data }));
    return { ok: true };
  } catch (error) {
    console.error("Saving the goal draft failed:", error);
    return { ok: false };
  }
}
