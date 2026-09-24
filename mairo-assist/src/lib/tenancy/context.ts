import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser, type SessionUser } from "@/lib/auth/session";
import { entitledPlan, PLANS, type Feature, type Plan } from "@/lib/billing/plans";
import { createClient } from "@/lib/supabase/server";
import { isRole, parseGrants, permissionsFor, type Permission, type Role } from "./permissions";

export const ACTIVE_BUSINESS_COOKIE = "ma_business";

export type BusinessSummary = {
  id: string;
  name: string;
  slug: string;
  status: string;
};

export type Membership = {
  business: BusinessSummary;
  role: Role;
  grants: Permission[];
};

export type BusinessContext = {
  user: SessionUser;
  business: BusinessSummary;
  role: Role;
  permissions: Set<Permission>;
  memberships: Membership[];
  /** Plan whose features apply right now (see billingEnforced). */
  plan: Plan | null;
  /** False until real billing is switched on; features are then not gated. */
  billingEnforced: boolean;
};

export class PermissionError extends Error {
  constructor(public readonly permission: Permission | Feature) {
    super("You don't have permission to do that.");
  }
}

/** All businesses the signed-in user belongs to (read through RLS). */
export const listMemberships = cache(async (): Promise<Membership[]> => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_members")
    .select("role, permissions, business:businesses!inner(id, name, slug, status)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Could not load memberships: ${error.message}`);

  return (data ?? []).flatMap((row) => {
    const business = (Array.isArray(row.business) ? row.business[0] : row.business) as BusinessSummary | undefined;
    if (!business || !isRole(row.role)) return [];
    return [{ business, role: row.role, grants: parseGrants(row.role, row.permissions) }];
  });
});

export function billingIsEnforced() {
  return process.env.BILLING_ENFORCED === "true";
}

/**
 * The business the user is working in. Resolved from the active-business
 * cookie, but ONLY if the user is actually a member — the cookie is a
 * preference, never an authorization.
 */
export const getBusinessContext = cache(async (): Promise<BusinessContext | null> => {
  const user = await requireUser();
  const memberships = await listMemberships();
  if (memberships.length === 0) return null;

  const cookieStore = await cookies();
  const preferred = cookieStore.get(ACTIVE_BUSINESS_COOKIE)?.value;
  let active = memberships.find((m) => m.business.id === preferred);

  if (!active) {
    const supabase = await createClient();
    const { data: profile } = await supabase.from("users").select("last_business_id").eq("id", user.id).maybeSingle();
    active = memberships.find((m) => m.business.id === profile?.last_business_id) ?? memberships[0];
  }

  const supabase = await createClient();
  const { data: planRows } = await supabase.rpc("business_plan", { p_business_id: active.business.id });
  const sub = Array.isArray(planRows) ? planRows[0] : null;
  const enforced = billingIsEnforced();

  return {
    user,
    business: active.business,
    role: active.role,
    permissions: permissionsFor(active.role, active.grants),
    memberships,
    // Until billing is live, every business gets Pro features so nothing
    // is locked behind a checkout that does not exist yet.
    plan: enforced ? entitledPlan(sub) : PLANS.pro,
    billingEnforced: enforced,
  };
});

/** For pages: signed-in user with a business, or redirect to onboarding. */
export async function requireBusiness(permission?: Permission): Promise<BusinessContext> {
  const ctx = await getBusinessContext();
  if (!ctx) redirect("/onboarding");
  if (permission && !ctx.permissions.has(permission)) redirect("/dashboard?denied=1");
  return ctx;
}

/** For Server Actions and route handlers: throws instead of redirecting. */
export async function authorize(permission: Permission): Promise<BusinessContext> {
  const ctx = await getBusinessContext();
  if (!ctx || !ctx.permissions.has(permission)) throw new PermissionError(permission);
  return ctx;
}

export function hasPlanFeature(ctx: BusinessContext, feature: Feature) {
  return ctx.plan?.features.includes(feature) ?? false;
}
