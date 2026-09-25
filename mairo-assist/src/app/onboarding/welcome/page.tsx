import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { WelcomeExperience } from "@/components/onboarding/welcome-experience";
import { requireUser } from "@/lib/auth/session";
import { readPlanIntent } from "@/lib/billing/intent";
import { PLANS } from "@/lib/billing/plans";
import { welcomeSeen } from "@/lib/onboarding/actions";
import { createClient } from "@/lib/supabase/server";
import { getBusinessContext } from "@/lib/tenancy/context";

export const metadata: Metadata = { title: "Welcome to your new AI employee" };

/** First-run welcome, shown once between choosing a plan and setting up the business. */
export default async function WelcomePage() {
  await requireUser("/onboarding/welcome");
  if (await welcomeSeen()) redirect("/onboarding");
  const ctx = await getBusinessContext();

  // Use the AI employee's name if the business already chose one.
  let aiName: string | null = null;
  if (ctx) {
    const { data } = await (await createClient()).from("ai_employees").select("name").eq("business_id", ctx.business.id).maybeSingle();
    aiName = data?.name ?? null;
  }
  const intent = await readPlanIntent();
  return <WelcomeExperience aiName={aiName} pickedPlanName={intent && intent !== "free" ? PLANS[intent].name : null} />;
}
