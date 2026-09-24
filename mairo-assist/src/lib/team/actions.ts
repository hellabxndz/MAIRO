"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/session";
import { appUrl } from "@/lib/env";
import { randomToken, sha256Hex } from "@/lib/security/tokens";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_BUSINESS_COOKIE, authorize, hasPlanFeature, PermissionError, type BusinessContext } from "@/lib/tenancy/context";
import { ADMIN_GRANTABLE, canAssignRole, isRole, type Permission } from "@/lib/tenancy/permissions";
import { emailSchema } from "@/lib/validation/auth";
import { fieldErrors, str, type FormState } from "@/lib/validation/form";

const INVITE_TTL_DAYS = 7;

async function owner(): Promise<BusinessContext | null> {
  try {
    return await authorize("team.manage");
  } catch (e) {
    if (e instanceof PermissionError) return null;
    throw e;
  }
}

const inviteSchema = z.object({ email: emailSchema, role: z.enum(["admin", "support_agent"]) });

export async function inviteMember(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await owner();
  if (!ctx) return { message: "Only owners can invite team members." };
  const raw = { email: str(form, "email"), role: str(form, "role") };
  const parsed = inviteSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: raw };

  const supabase = await createClient();
  const [{ count: memberCount }, { count: pendingCount }, { data: existing }] = await Promise.all([
    supabase.from("business_members").select("id", { count: "exact", head: true }).eq("business_id", ctx.business.id),
    supabase
      .from("business_invitations")
      .select("id", { count: "exact", head: true })
      .eq("business_id", ctx.business.id)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString()),
    supabase
      .from("business_members")
      .select("id, user:users!inner(email)")
      .eq("business_id", ctx.business.id)
      .eq("user.email", parsed.data.email)
      .maybeSingle(),
  ]);
  if (existing) return { message: "That person is already on your team.", values: raw };

  if (ctx.billingEnforced) {
    if (!hasPlanFeature(ctx, "team_access")) return { message: "Team access is included from the Pro plan.", values: raw };
    const seats = ctx.plan?.limits.seats ?? 1;
    if ((memberCount ?? 0) + (pendingCount ?? 0) >= seats) {
      return { message: `Your plan includes ${seats} seats. Remove a member or upgrade to invite more.`, values: raw };
    }
  }

  // Replace any earlier pending invite for this email.
  await supabase
    .from("business_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("business_id", ctx.business.id)
    .eq("email", parsed.data.email)
    .is("accepted_at", null)
    .is("revoked_at", null);

  const token = randomToken();
  const { data: invite, error } = await supabase
    .from("business_invitations")
    .insert({
      business_id: ctx.business.id,
      email: parsed.data.email,
      role: parsed.data.role,
      token_hash: sha256Hex(token),
      invited_by: ctx.user.id,
      expires_at: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000).toISOString(),
    })
    .select("id")
    .single();
  if (error || !invite) return { message: "We couldn't create the invitation. Please try again.", values: raw };

  await recordAudit({
    businessId: ctx.business.id,
    actorUserId: ctx.user.id,
    action: "team.invited",
    targetType: "invitation",
    targetId: invite.id,
    metadata: { role: parsed.data.role },
  });
  revalidatePath("/dashboard/team");
  return {
    ok: true,
    message: `Invitation created for ${parsed.data.email}. Share this link with them — it works once and expires in ${INVITE_TTL_DAYS} days.`,
    values: { inviteUrl: `${appUrl()}/invite/${token}` },
  };
}

export async function revokeInvitation(invitationId: string): Promise<void> {
  const ctx = await owner();
  if (!ctx) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from("business_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", invitationId)
    .eq("business_id", ctx.business.id)
    .is("accepted_at", null);
  if (!error) {
    await recordAudit({ businessId: ctx.business.id, actorUserId: ctx.user.id, action: "team.invitation_revoked", targetType: "invitation", targetId: invitationId });
  }
  revalidatePath("/dashboard/team");
}

export type TeamActionResult = { ok: boolean; message: string };

export async function changeMemberRole(memberId: string, role: string): Promise<TeamActionResult> {
  const ctx = await owner();
  if (!ctx) return { ok: false, message: "Only owners can change roles." };
  if (!isRole(role) || !canAssignRole(ctx.role, role)) return { ok: false, message: "That role isn't available." };

  const supabase = await createClient();
  const { data: member } = await supabase
    .from("business_members")
    .select("id, role, user_id")
    .eq("id", memberId)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!member) return { ok: false, message: "Member not found." };
  if (member.role === role) return { ok: true, message: "No change." };

  const { error } = await supabase
    .from("business_members")
    .update({ role, permissions: {} })
    .eq("id", memberId)
    .eq("business_id", ctx.business.id);
  if (error) {
    return { ok: false, message: error.message.includes("at least one owner") ? "A business must keep at least one owner." : "We couldn't change that role." };
  }
  await recordAudit({
    businessId: ctx.business.id,
    actorUserId: ctx.user.id,
    action: "team.role_changed",
    targetType: "member",
    targetId: memberId,
    metadata: { from: member.role, to: role },
  });
  revalidatePath("/dashboard/team");
  return { ok: true, message: "Role updated." };
}

export async function setAdminGrant(memberId: string, permission: string, enabled: boolean): Promise<TeamActionResult> {
  const ctx = await owner();
  if (!ctx) return { ok: false, message: "Only owners can change permissions." };
  if (!ADMIN_GRANTABLE.includes(permission as Permission)) return { ok: false, message: "That permission can't be granted." };

  const supabase = await createClient();
  const { data: member } = await supabase
    .from("business_members")
    .select("id, role, permissions")
    .eq("id", memberId)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!member || member.role !== "admin") return { ok: false, message: "Extra permissions apply to admins only." };

  const next = { ...(member.permissions as Record<string, unknown>), [permission]: enabled };
  const { error } = await supabase.from("business_members").update({ permissions: next }).eq("id", memberId).eq("business_id", ctx.business.id);
  if (error) return { ok: false, message: "We couldn't save that." };
  await recordAudit({
    businessId: ctx.business.id,
    actorUserId: ctx.user.id,
    action: enabled ? "team.permission_granted" : "team.permission_revoked",
    targetType: "member",
    targetId: memberId,
    metadata: { permission },
  });
  revalidatePath("/dashboard/team");
  return { ok: true, message: "Permissions updated." };
}

export async function removeMember(memberId: string): Promise<TeamActionResult> {
  const ctx = await owner();
  if (!ctx) return { ok: false, message: "Only owners can remove members." };
  const supabase = await createClient();
  const { data: member } = await supabase
    .from("business_members")
    .select("id, role, user_id")
    .eq("id", memberId)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!member) return { ok: false, message: "Member not found." };
  if (member.user_id === ctx.user.id) return { ok: false, message: "Use “Leave business” to remove yourself." };

  const { error } = await supabase.from("business_members").delete().eq("id", memberId).eq("business_id", ctx.business.id);
  if (error) {
    return { ok: false, message: error.message.includes("at least one owner") ? "A business must keep at least one owner." : "We couldn't remove that member." };
  }
  await recordAudit({
    businessId: ctx.business.id,
    actorUserId: ctx.user.id,
    action: "team.member_removed",
    targetType: "member",
    targetId: memberId,
    metadata: { role: member.role },
  });
  revalidatePath("/dashboard/team");
  return { ok: true, message: "Member removed. Their access ended immediately." };
}

/** Accept an invitation link (the database checks the token and the email). */
export async function acceptInvitation(token: string): Promise<{ message: string } | void> {
  await requireUser(`/invite/${encodeURIComponent(token)}`);
  if (typeof token !== "string" || token.length < 20 || token.length > 200) return { message: "This invitation link isn't valid." };
  const supabase = await createClient();
  const { data: businessId, error } = await supabase.rpc("accept_business_invitation", { p_token: token });
  if (error || typeof businessId !== "string") {
    const msg = error?.message ?? "";
    return {
      message: msg.includes("different email")
        ? "This invitation was sent to a different email address. Sign in with that email to accept it."
        : "This invitation is invalid, was already used, or has expired. Ask the owner for a new one.",
    };
  }
  (await cookies()).set(ACTIVE_BUSINESS_COOKIE, businessId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  redirect("/dashboard");
}

/** Leave the active business. The last owner can't leave (the database refuses). */
export async function leaveBusiness(): Promise<TeamActionResult> {
  const user = await requireUser();
  let ctx: BusinessContext;
  try {
    ctx = await authorize("business.view");
  } catch {
    return { ok: false, message: "You're not a member of this business." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("business_members").delete().eq("business_id", ctx.business.id).eq("user_id", user.id);
  if (error) {
    return { ok: false, message: error.message.includes("at least one owner") ? "You're the only owner. Make someone else an owner first." : "We couldn't remove you." };
  }
  await recordAudit({ businessId: ctx.business.id, actorUserId: user.id, action: "team.member_left", targetType: "member" });
  (await cookies()).delete(ACTIVE_BUSINESS_COOKIE);
  redirect("/dashboard");
}
