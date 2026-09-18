"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { assistantNameOf, DEFAULT_ASSISTANT_NAME } from "@/lib/ai/agents";
import { SMS_CONSENT_TEXT } from "@/lib/sms/consent";
import {
  maskPhone,
  normalizePhone,
  sendVerificationCode,
  verificationCode,
} from "@/lib/sms/send";

// Naming the assistant, and getting permission to text somebody.
//
// The naming half is small. The texting half is the part to be careful with,
// because it is the one place this product can reach a person who is not
// sitting in front of it — and the rules around that are not a matter of
// taste. A number has to be proved to belong to whoever typed it, the consent
// has to be recorded in the words they actually agreed to, and stopping has to
// be one action that works immediately.
//
// Every refusal here is RETURNED, not thrown. Server action errors are
// stripped in production, so a thrown refusal reaches the customer as
// "An error occurred" — which, for a step about their phone number, reads as
// the product being broken rather than as them needing to do something.

export type AssistantActionState = { error?: string; saved?: string } | undefined;

const nameSchema = z.object({
  assistantName: z
    .string()
    .trim()
    .min(1, "Give your assistant a name")
    .max(24, "That name is a bit long — 24 characters or fewer"),
});

async function currentOrgId(): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.organizationId) return null;
  return (await activeOrganizationId()) ?? session.user.organizationId;
}

/** Rename the assistant. */
export async function renameAssistantAction(
  _prev: AssistantActionState,
  formData: FormData,
): Promise<AssistantActionState> {
  const organizationId = await currentOrgId();
  if (!organizationId) return { error: "Not signed in" };

  const parsed = nameSchema.safeParse({ assistantName: formData.get("assistantName") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "That name will not work" };
  }

  const name = assistantNameOf(parsed.data.assistantName);
  await db.organization.update({ where: { id: organizationId }, data: { assistantName: name } });

  revalidatePath("/dashboard", "layout");
  return { saved: `Your assistant is now called ${name}.` };
}

/** Back to Alex. */
export async function resetAssistantNameAction(): Promise<void> {
  const organizationId = await currentOrgId();
  if (!organizationId) return;
  await db.organization.update({
    where: { id: organizationId },
    data: { assistantName: DEFAULT_ASSISTANT_NAME },
  });
  revalidatePath("/dashboard", "layout");
}

/**
 * Step one of turning texts on: take the number, record the consent, send a code.
 *
 * The consent is recorded here rather than after verification because the
 * verification text is itself a text message — sending one to somebody who has
 * not agreed to be texted is the thing the consent exists to prevent.
 */
export async function startPhoneVerificationAction(
  _prev: AssistantActionState,
  formData: FormData,
): Promise<AssistantActionState> {
  const organizationId = await currentOrgId();
  if (!organizationId) return { error: "Not signed in" };

  const raw = String(formData.get("phone") ?? "");
  const phone = normalizePhone(raw);
  if (!phone) {
    return {
      error:
        "That does not look like a phone number. Include the country code, like +1 555 123 4567.",
    };
  }

  if (formData.get("consent") !== "on") {
    return { error: "Tick the box to agree before we text you." };
  }

  const code = verificationCode();
  const expires = new Date(Date.now() + 10 * 60 * 1000);

  // The send comes before the write. If the provider will not take it, there
  // is no point storing a pending verification the customer can never finish —
  // they would be left looking at "enter the code" with no code coming.
  const result = await sendVerificationCode(phone, code);
  if (!result.sent) {
    return { error: `We could not send the code: ${result.reason}.` };
  }

  await db.smsPreference.upsert({
    where: { organizationId },
    create: {
      organizationId,
      phone,
      verifyCode: code,
      verifyExpiresAt: expires,
      consentAt: new Date(),
      consentText: SMS_CONSENT_TEXT,
    },
    update: {
      phone,
      verifyCode: code,
      verifyExpiresAt: expires,
      // A new number is a new agreement, and coming back after opting out is
      // opting back in — both need the record to say so as of today.
      verifiedAt: null,
      optedOutAt: null,
      consentAt: new Date(),
      consentText: SMS_CONSENT_TEXT,
    },
  });

  revalidatePath("/dashboard/settings");
  return { saved: `Code sent to ${maskPhone(phone)}.` };
}

/** Step two: the code they were texted. */
export async function confirmPhoneAction(
  _prev: AssistantActionState,
  formData: FormData,
): Promise<AssistantActionState> {
  const organizationId = await currentOrgId();
  if (!organizationId) return { error: "Not signed in" };

  const code = String(formData.get("code") ?? "").replace(/[^\d]/g, "");
  const pref = await db.smsPreference.findUnique({ where: { organizationId } });

  if (!pref?.verifyCode || !pref.verifyExpiresAt) {
    return { error: "There is no code waiting. Send a new one." };
  }
  if (pref.verifyExpiresAt.getTime() < Date.now()) {
    return { error: "That code has expired. Send a new one." };
  }
  if (code !== pref.verifyCode) {
    return { error: "That code does not match. Check the text and try again." };
  }

  await db.smsPreference.update({
    where: { organizationId },
    data: { verifiedAt: new Date(), verifyCode: null, verifyExpiresAt: null, optedOutAt: null },
  });

  revalidatePath("/dashboard/settings");
  return { saved: "Texts are on. You can change what we send you below." };
}

const prefsSchema = z.object({
  onCampaignLive: z.boolean(),
  onNeedsAttention: z.boolean(),
  onWeeklySummary: z.boolean(),
  onBudgetChange: z.boolean(),
});

/** Which kinds of update are worth a text. */
export async function updateSmsPreferencesAction(
  _prev: AssistantActionState,
  formData: FormData,
): Promise<AssistantActionState> {
  const organizationId = await currentOrgId();
  if (!organizationId) return { error: "Not signed in" };

  const pref = await db.smsPreference.findUnique({ where: { organizationId } });
  if (!pref?.verifiedAt) return { error: "Verify your number first." };

  const parsed = prefsSchema.parse({
    onCampaignLive: formData.get("onCampaignLive") === "on",
    onNeedsAttention: formData.get("onNeedsAttention") === "on",
    onWeeklySummary: formData.get("onWeeklySummary") === "on",
    onBudgetChange: formData.get("onBudgetChange") === "on",
  });

  await db.smsPreference.update({ where: { organizationId }, data: parsed });

  revalidatePath("/dashboard/settings");
  return { saved: "Saved." };
}

/**
 * Stop.
 *
 * Marks the opt-out and clears the number in the same write. Keeping a number
 * nobody wants texted is a number that can be texted by mistake, and the
 * opt-out record is what matters afterwards, not the digits.
 */
export async function stopSmsAction(): Promise<void> {
  const organizationId = await currentOrgId();
  if (!organizationId) return;

  const pref = await db.smsPreference.findUnique({ where: { organizationId } });
  if (!pref) return;

  await db.smsPreference.update({
    where: { organizationId },
    data: {
      optedOutAt: new Date(),
      verifiedAt: null,
      verifyCode: null,
      verifyExpiresAt: null,
      phone: "",
    },
  });

  revalidatePath("/dashboard/settings");
}
