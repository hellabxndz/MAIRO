import "server-only";
import { cookies } from "next/headers";
import { isPlanKey, type PlanKey } from "./plans";

/**
 * The plan someone picked before they had a business (on the pricing page or
 * the plan step). It's only a preference: a paid plan is never granted from
 * it, it just decides whether to offer checkout once the business exists.
 */
export const PLAN_INTENT_COOKIE = "ma_plan";

export async function readPlanIntent(): Promise<PlanKey | null> {
  const v = (await cookies()).get(PLAN_INTENT_COOKIE)?.value;
  return isPlanKey(v) && v !== "enterprise" ? v : null;
}

export async function setPlanIntent(plan: PlanKey) {
  (await cookies()).set(PLAN_INTENT_COOKIE, plan, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
}

export async function clearPlanIntent() {
  (await cookies()).delete(PLAN_INTENT_COOKIE);
}
