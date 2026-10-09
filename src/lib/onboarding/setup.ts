import { z } from "zod";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { normalizeUrl } from "@/lib/campaigns/destination";
import { readWebsiteForPlan } from "@/lib/strategy/store";
import { loadBrain } from "@/lib/business/brain";
import { parseDraft, type OnboardingDraft } from "./draft";
import { recommendGoal, type SetupGoal } from "./goal";

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
});

/** Screen 1: what the business is. Saved before MAIRO reads anything. */
export async function saveBusinessStep(organizationId: string, input: z.input<typeof businessSchema>): Promise<{ ok: true; website: string | null } | { ok: false; error: string }> {
  const parsed = businessSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Some answers are too long — shorten them a little." };
  const d = parsed.data;
  if (!d.offering && !d.industry) return { ok: false, error: "Tell MAIRO what your business does — a few words is enough." };
  const website = d.website ? normalizeUrl(d.website) : null;
  if (d.website && !website) return { ok: false, error: "That doesn't look like a web address. Something like yourbusiness.com — or leave it empty." };
  try {
    const before = await db.organization.findUnique({ where: { id: organizationId }, select: { website: true } });
    await db.organization.update({ where: { id: organizationId }, data: { website, ...(d.industry ? { industry: d.industry } : {}) } });
    await writeDraft(organizationId, (draft) => ({
      ...draft,
      screen: website ? "learn" : "goal",
      business: { website: website ?? undefined, industry: d.industry, offering: d.offering, customerLocation: d.customerLocation, savedAt: new Date().toISOString() },
      // A different website means reading it again.
      learn: before?.website === website ? draft.learn : undefined,
    }));
    return { ok: true, website };
  } catch (error) {
    console.error("Saving the business step failed:", error);
    return { ok: false, error: "MAIRO couldn't save just now. Your answers are still on this page — try again in a moment." };
  }
}

export type Learned = { label: string; value: string }[];
export type LearnResult = { ok: true; read: boolean; learned: Learned; note: string | null; suggestion: { goal: SetupGoal; why: string } };

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
        { label: "What you do", value: p.overview },
        { label: "Products and services", value: p.products.slice(0, 5).map((x) => x.name).join(", ") },
        { label: "Where", value: [p.location, p.serviceArea].filter(Boolean).join(" · ") },
        { label: "Who it's for", value: p.targetCustomer },
        { label: "Offers on your site", value: p.offers.slice(0, 3).join("; ") },
        { label: "Your website's main button", value: p.primaryCta },
      ].filter((x) => x.value && x.value.trim())
    : [];
  return {
    ok: true,
    read,
    learned,
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
