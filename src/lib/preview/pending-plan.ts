import { cookies } from "next/headers";
import { claimPlan, readSharedPlan } from "@/lib/preview/saved-plan-store";
import type { SavedPlan } from "@/lib/preview/saved-plan";

// The free plan a signed-out visitor saved, remembered in their own browser
// so it can follow them into the account they create — by email or Google —
// or sign in to. Only the browser that saved a plan can claim it this way: a
// shared link lets people read a plan, never take it into their business.

const COOKIE = "mairo_free_plan";
const TOKEN = /^[A-Za-z0-9_-]{16,40}$/;

/** Route handlers and server actions only (they can set cookies). */
export async function rememberPendingPlan(shareToken: string): Promise<void> {
  if (!TOKEN.test(shareToken)) return;
  (await cookies()).set(COOKIE, shareToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // As long as an unclaimed plan is kept.
    maxAge: 30 * 86_400,
  });
}

/** The plan waiting in this browser, for the sign-up page to mention. Read-only, so pages can call it. */
export async function pendingPlan(): Promise<SavedPlan | null> {
  const token = (await cookies()).get(COOKIE)?.value ?? "";
  if (!TOKEN.test(token)) return null;
  return (await readSharedPlan(token))?.plan ?? null;
}

/**
 * Gives the plan waiting in this browser to the business, opens setup with
 * its answers, and forgets it. Never throws: a plan that can't be claimed
 * must not stop a sign-up. Route handlers, server actions and the auth
 * callbacks only — never a page render, which can't change cookies.
 */
export async function claimPendingPlan(organizationId: string): Promise<boolean> {
  try {
    const jar = await cookies();
    const token = jar.get(COOKIE)?.value ?? "";
    if (!TOKEN.test(token)) return false;
    const claimed = await claimPlan(token, organizationId);
    jar.delete(COOKIE);
    return claimed;
  } catch (error) {
    console.error("Claiming a saved free plan failed:", error instanceof Error ? error.name : "unknown");
    return false;
  }
}
