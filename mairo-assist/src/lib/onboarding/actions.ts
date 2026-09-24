"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { recordAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/session";
import { ACTIVE_BUSINESS_COOKIE, authorize, PermissionError } from "@/lib/tenancy/context";
import { createClient } from "@/lib/supabase/server";
import { parseAiConfig } from "@/lib/validation/ai-employee";
import { aiNameSchema, businessInfoSchema, goalsSchema, policiesSchema, sellsSchema } from "@/lib/validation/business";
import { fieldErrors, str, type FormState } from "@/lib/validation/form";
import { advance, COMPLETED_STEP } from "./steps";

const DENIED: FormState = { message: "Only owners and admins can set up the business." };

async function saveProgress(businessId: string, finished: number) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("business_settings")
    .select("onboarding_step")
    .eq("business_id", businessId)
    .single();
  const next = advance(data?.onboarding_step ?? 1, finished);
  const { error } = await supabase
    .from("business_settings")
    .update({
      onboarding_step: next,
      ...(next === COMPLETED_STEP ? { onboarding_completed_at: new Date().toISOString() } : {}),
    })
    .eq("business_id", businessId);
  if (error) throw new Error(`Could not save progress: ${error.message}`);
  return next;
}

function goTo(step: number): never {
  redirect(step >= COMPLETED_STEP ? "/dashboard?welcome=1" : `/onboarding?step=${step}`);
}

async function managerContext() {
  try {
    return await authorize("business.update");
  } catch (e) {
    if (e instanceof PermissionError) return null;
    throw e;
  }
}

/** Step 1 — create the business (first run) or update its details. */
export async function saveBusinessInfo(_prev: FormState, form: FormData): Promise<FormState> {
  await requireUser("/onboarding");
  const raw = {
    name: str(form, "name"),
    websiteUrl: str(form, "websiteUrl"),
    industry: str(form, "industry"),
    description: str(form, "description"),
  };
  const parsed = businessInfoSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: raw };

  const supabase = await createClient();
  const businessId = str(form, "businessId");
  if (businessId) {
    const existing = await managerContext();
    if (!existing || existing.business.id !== businessId) return { ...DENIED, values: raw };
    const { error } = await supabase
      .from("businesses")
      .update({
        name: parsed.data.name,
        website_url: parsed.data.websiteUrl ?? null,
        industry: parsed.data.industry,
        description: parsed.data.description || null,
      })
      .eq("id", existing.business.id);
    if (error) return { message: "We couldn't save that. Please try again.", values: raw };
    goTo(await saveProgress(existing.business.id, 1));
  }

  const { data: createdId, error } = await supabase.rpc("create_business", {
    p_name: parsed.data.name,
    p_website_url: parsed.data.websiteUrl ?? null,
    p_industry: parsed.data.industry,
    p_description: parsed.data.description || null,
  });
  if (error || typeof createdId !== "string") {
    return {
      message: error?.message.includes("limit") ? "You've reached the limit of businesses per account." : "We couldn't create your business. Please try again.",
      values: raw,
    };
  }
  (await cookies()).set(ACTIVE_BUSINESS_COOKIE, createdId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  goTo(2);
}

export async function saveSells(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await managerContext();
  if (!ctx) return DENIED;
  const parsed = sellsSchema.safeParse({ sells: form.getAll("sells") });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("businesses").update({ sells: parsed.data.sells }).eq("id", ctx.business.id);
  if (error) return { message: "We couldn't save that. Please try again." };
  goTo(await saveProgress(ctx.business.id, 2));
}

export async function saveGoals(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await managerContext();
  if (!ctx) return DENIED;
  const parsed = goalsSchema.safeParse({ goals: form.getAll("goals") });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("businesses").update({ ai_goals: parsed.data.goals }).eq("id", ctx.business.id);
  if (error) return { message: "We couldn't save that. Please try again." };
  goTo(await saveProgress(ctx.business.id, 3));
}

export async function saveAiName(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await managerContext();
  if (!ctx) return DENIED;
  const choice = str(form, "choice");
  const raw = choice === "custom" ? str(form, "customName") : choice;
  const parsed = aiNameSchema.safeParse({ name: raw });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: { choice, customName: str(form, "customName") } };

  const supabase = await createClient();
  const { data: existing } = await supabase.from("ai_employees").select("id").eq("business_id", ctx.business.id).maybeSingle();
  const { error } = existing
    ? await supabase.from("ai_employees").update({ name: parsed.data.name }).eq("id", existing.id)
    : await supabase
        .from("ai_employees")
        .insert({ business_id: ctx.business.id, name: parsed.data.name, draft_config: parseAiConfig({}) });
  if (error) return { message: "We couldn't save that. Please try again." };
  if (!existing) {
    await recordAudit({ businessId: ctx.business.id, actorUserId: ctx.user.id, action: "ai_employee.created", targetType: "ai_employee" });
  }
  goTo(await saveProgress(ctx.business.id, 4));
}

/** Step 5 — skipping Shopify is allowed; the dashboard explains what needs it. */
export async function skipShopify(): Promise<void> {
  const ctx = await managerContext();
  if (!ctx) redirect("/dashboard");
  const supabase = await createClient();
  await supabase.from("business_settings").update({ shopify_step_skipped: true }).eq("business_id", ctx.business.id);
  goTo(await saveProgress(ctx.business.id, 5));
}

const POLICY_DOCS = [
  { field: "shipping", category: "shipping_policy", title: "Shipping policy" },
  { field: "returns", category: "return_policy", title: "Return policy" },
  { field: "refunds", category: "refund_policy", title: "Refund policy" },
] as const;

/** Step 6 — policies go into the knowledge base; instructions into the AI draft. */
export async function savePolicies(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await managerContext();
  if (!ctx) return DENIED;
  const raw = {
    shipping: str(form, "shipping"),
    returns: str(form, "returns"),
    refunds: str(form, "refunds"),
    instructions: str(form, "instructions"),
  };
  const parsed = policiesSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: raw };

  const supabase = await createClient();
  for (const doc of POLICY_DOCS) {
    const content = parsed.data[doc.field];
    const { data: existing } = await supabase
      .from("knowledge_documents")
      .select("id")
      .eq("business_id", ctx.business.id)
      .eq("category", doc.category)
      .eq("source_type", "manual")
      .eq("title", doc.title)
      .maybeSingle();
    if (existing) {
      const { error } = content
        ? await supabase.from("knowledge_documents").update({ content }).eq("id", existing.id)
        : await supabase.from("knowledge_documents").delete().eq("id", existing.id);
      if (error) return { message: "We couldn't save your policies. Please try again.", values: raw };
    } else if (content) {
      const { error } = await supabase.from("knowledge_documents").insert({
        business_id: ctx.business.id,
        title: doc.title,
        category: doc.category,
        source_type: "manual",
        content,
        created_by: ctx.user.id,
      });
      if (error) return { message: "We couldn't save your policies. Please try again.", values: raw };
    }
  }

  const { data: employee } = await supabase
    .from("ai_employees")
    .select("id, draft_config")
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (employee) {
    const config = parseAiConfig(employee.draft_config);
    config.instructions = parsed.data.instructions;
    const { error } = await supabase.from("ai_employees").update({ draft_config: config }).eq("id", employee.id);
    if (error) return { message: "We couldn't save your instructions. Please try again.", values: raw };
  }
  goTo(await saveProgress(ctx.business.id, 6));
}

/** Steps 7 and 8 have no form data: record progress and move on. */
export async function continueFrom(step: 7 | 8): Promise<void> {
  const ctx = await managerContext();
  if (!ctx) redirect("/dashboard");
  if (step === 8) {
    await recordAudit({ businessId: ctx.business.id, actorUserId: ctx.user.id, action: "onboarding.completed", targetType: "business", targetId: ctx.business.id });
  }
  goTo(await saveProgress(ctx.business.id, step));
}
