"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";
import { authorize, PermissionError, type BusinessContext } from "@/lib/tenancy/context";
import { emailSchema } from "@/lib/validation/auth";
import { businessInfoSchema } from "@/lib/validation/business";
import { fieldErrors, str, type FormState } from "@/lib/validation/form";

async function manager(): Promise<BusinessContext | null> {
  try {
    return await authorize("business.update");
  } catch (e) {
    if (e instanceof PermissionError) return null;
    throw e;
  }
}

export async function saveBusinessProfile(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await manager();
  if (!ctx) return { message: "Only owners and admins can change business settings." };
  const raw = { name: str(form, "name"), websiteUrl: str(form, "websiteUrl"), industry: str(form, "industry"), description: str(form, "description") };
  const parsed = businessInfoSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: raw };
  const supabase = await createClient();
  const { error } = await supabase
    .from("businesses")
    .update({
      name: parsed.data.name,
      website_url: parsed.data.websiteUrl ?? null,
      industry: parsed.data.industry,
      description: parsed.data.description || null,
    })
    .eq("id", ctx.business.id);
  if (error) return { message: "We couldn't save your changes.", values: raw };
  await recordAudit({ businessId: ctx.business.id, actorUserId: ctx.user.id, action: "business.updated", targetType: "business", targetId: ctx.business.id });
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "Business details saved." };
}

const optionalEmail = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(emailSchema.nullable());

const supportSchema = z.object({
  supportEmail: optionalEmail,
  escalationEmail: optionalEmail,
  timezone: z.string().refine((tz) => Intl.supportedValuesOf("timeZone").includes(tz) || tz === "UTC", "Choose a valid time zone"),
  retentionDays: z.coerce.number().int().min(30, "At least 30 days").max(3650, "At most 10 years"),
});

export async function saveSupportSettings(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await manager();
  if (!ctx) return { message: "Only owners and admins can change business settings." };
  const raw = {
    supportEmail: str(form, "supportEmail"),
    escalationEmail: str(form, "escalationEmail"),
    timezone: str(form, "timezone"),
    retentionDays: str(form, "retentionDays"),
  };
  const parsed = supportSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: raw };
  const supabase = await createClient();
  const { error } = await supabase
    .from("business_settings")
    .update({
      support_email: parsed.data.supportEmail,
      escalation_email: parsed.data.escalationEmail,
      timezone: parsed.data.timezone,
      conversation_retention_days: parsed.data.retentionDays,
    })
    .eq("business_id", ctx.business.id);
  if (error) return { message: "We couldn't save your changes.", values: raw };
  await recordAudit({
    businessId: ctx.business.id,
    actorUserId: ctx.user.id,
    action: "business.support_settings_updated",
    targetType: "business",
    targetId: ctx.business.id,
    metadata: { retention_days: parsed.data.retentionDays },
  });
  revalidatePath("/dashboard/settings");
  return { ok: true, message: "Support settings saved." };
}
