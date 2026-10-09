"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import type { FeedbackEasier, FeedbackKind } from "@/generated/prisma/enums";
import { PULSE_LATER_COOKIE } from "@/lib/success/journey";

// What a business tells MAIRO about MAIRO. Goes to the MAIRO team (AIOS →
// Customers) and nowhere else. Nothing here changes a campaign.

const KINDS: FeedbackKind[] = ["PULSE", "PROBLEM", "IDEA", "CONFUSING", "CANCELLATION"];
const EASIER: FeedbackEasier[] = ["YES", "SOMEWHAT", "NO"];
const MAX_PER_DAY = 30;

async function scope() {
  const session = await auth();
  if (!session?.user?.organizationId) return null;
  return { organizationId: (await activeOrganizationId()) ?? session.user.organizationId, userId: session.user.id ?? null };
}

export async function sendFeedbackAction(input: {
  kind: FeedbackKind;
  easier?: FeedbackEasier | null;
  text?: string | null;
  page?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const ctx = await scope();
  if (!ctx) return { ok: false, error: "Not signed in." };
  if (!KINDS.includes(input.kind)) return { ok: false, error: "Pick what kind of feedback this is." };
  const easier = input.easier && EASIER.includes(input.easier) ? input.easier : null;
  const text = input.text?.trim().slice(0, 4000) || null;
  if (input.kind === "PULSE" && !easier) return { ok: false, error: "Pick an answer." };
  if (input.kind !== "PULSE" && input.kind !== "CANCELLATION" && !text) return { ok: false, error: "Tell MAIRO a little about it." };

  // A runaway client can't flood the team's inbox.
  const today = await db.customerFeedback.count({
    where: { organizationId: ctx.organizationId, createdAt: { gte: new Date(Date.now() - 86_400_000) } },
  });
  if (today >= MAX_PER_DAY) return { ok: false, error: "That's a lot of feedback for one day — the MAIRO team will be in touch." };

  await db.customerFeedback.create({
    data: {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      kind: input.kind,
      easier,
      text,
      page: input.page?.slice(0, 200) ?? null,
      // A pulse with no comment needs nothing doing; everything else waits for the team.
      status: input.kind === "PULSE" && !text ? "RESOLVED" : "OPEN",
    },
  });
  revalidatePath("/dashboard");
  return { ok: true };
}

/** "Ask me later" on the pulse question: a week's quiet, on this device. */
export async function pulseLaterAction(): Promise<void> {
  (await cookies()).set(PULSE_LATER_COOKIE, "1", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 7 * 86_400 });
  revalidatePath("/dashboard");
}

/**
 * Permission to share this business's results in an anonymized case study.
 * Off unless they say yes; withdrawing it is one click and takes effect at once.
 */
export async function setCaseStudyConsentAction(consent: boolean): Promise<{ ok: boolean; error?: string }> {
  const ctx = await scope();
  if (!ctx) return { ok: false, error: "Not signed in." };
  await db.organization.update({ where: { id: ctx.organizationId }, data: { caseStudyConsentAt: consent ? new Date() : null } });
  revalidatePath("/dashboard/account");
  return { ok: true };
}
