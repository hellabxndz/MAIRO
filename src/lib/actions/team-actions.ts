"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { auth, signIn } from "@/lib/auth";
import { absoluteUrl } from "@/lib/site";
import { PASSWORD_MAX, passwordProblem } from "@/lib/auth-rules/password";
import { currentMember, deniedFor } from "@/lib/members/authorize";
import { acceptInvite, changeRole, createInvite, inviteFor, removeMember, revokeInvite, seatProblem } from "@/lib/members/store";
import { WORKSPACE_COOKIE } from "@/lib/members/workspace";
import { audit } from "@/lib/members/audit";
import { ROLE_LABEL } from "@/lib/members/roles";

// The team: invitations, roles, removing people, and switching between the
// businesses someone belongs to. Each action checks the role on the server
// (deniedFor, then the store checks it again against the person's own row);
// a button the page hides is a convenience, not the check.

type Result = { ok: true; message?: string } | { ok: false; error: string };
export type InviteResult = { ok: true; link: string; email: string; expires: string } | { ok: false; error: string } | undefined;

const TEAM = "/dashboard/settings/team";

/** Who's acting and where, or why they can't manage the team here. */
async function manager(): Promise<{ userId: string; organizationId: string } | { error: string }> {
  const denied = await deniedFor("team.manage");
  if (denied) return { error: denied };
  const m = await currentMember();
  if (!m) return { error: "Not signed in." };
  if (m.actingAsClient) return { error: "A client business you run from your workspace doesn't have its own team." };
  return { userId: m.userId, organizationId: m.organizationId };
}

export async function inviteMemberAction(_prev: InviteResult, formData: FormData): Promise<InviteResult> {
  const who = await manager();
  if ("error" in who) return { ok: false, error: who.error };
  const r = await createInvite(who.organizationId, who.userId, String(formData.get("email") ?? ""), String(formData.get("role") ?? ""));
  if (!r.ok) return r;
  revalidatePath(TEAM);
  // The link is shown once, to the person who made it. MAIRO doesn't email it.
  return { ok: true, link: absoluteUrl(`/invite/${r.token}`), email: String(formData.get("email") ?? "").trim().toLowerCase(), expires: r.expiresAt.toLocaleDateString("en-US", { month: "long", day: "numeric" }) };
}

export async function revokeInviteAction(inviteId: string): Promise<Result> {
  const who = await manager();
  if ("error" in who) return { ok: false, error: who.error };
  const r = await revokeInvite(who.organizationId, who.userId, String(inviteId));
  if (r.ok) revalidatePath(TEAM);
  return r;
}

export async function changeRoleAction(memberId: string, role: string): Promise<Result> {
  const who = await manager();
  if ("error" in who) return { ok: false, error: who.error };
  const r = await changeRole(who.organizationId, who.userId, String(memberId), String(role));
  if (r.ok) revalidatePath(TEAM);
  return r.ok ? { ok: true, message: "Role changed." } : r;
}

export async function removeMemberAction(memberId: string): Promise<Result> {
  const who = await manager();
  if ("error" in who) return { ok: false, error: who.error };
  const r = await removeMember(who.organizationId, who.userId, String(memberId));
  if (r.ok) revalidatePath(TEAM);
  return r.ok ? { ok: true, message: "Removed. Their access ended straight away." } : r;
}

/** Leaving a team is anyone's to do, whatever their role — but not the last owner's. */
export async function leaveTeamAction(): Promise<Result> {
  const m = await currentMember();
  if (!m || m.actingAsClient) return { ok: false, error: "Not signed in." };
  const row = await db.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: m.organizationId, userId: m.userId } }, select: { id: true } });
  if (!row) return { ok: false, error: "You're not on this team." };
  const r = await removeMember(m.organizationId, m.userId, row.id);
  if (!r.ok) return r;
  (await cookies()).delete(WORKSPACE_COOKIE);
  return { ok: true, message: "You've left the team." };
}

/** Switches the business this person is acting in. Only one they belong to; the cookie is checked again on every request. */
export async function switchWorkspaceAction(organizationId: string): Promise<Result> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Not signed in." };
  const row = await db.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: String(organizationId), userId } }, select: { id: true } });
  if (!row) return { ok: false, error: "You're not on that business's team." };
  (await cookies()).set(WORKSPACE_COOKIE, String(organizationId), { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 180 });
  return { ok: true };
}

/** Accepts an invitation as the person signed in now — only with the address it was sent to. */
export async function acceptInviteAction(token: string): Promise<Result> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId || !session.user.email) return { ok: false, error: "Sign in first." };
  if (session.user.role === "OWNER") return { ok: false, error: "A MAIRO staff login can't join a customer's team." };
  const r = await acceptInvite(String(token), userId, session.user.email);
  if (!r.ok) return r;
  (await cookies()).set(WORKSPACE_COOKIE, r.organizationId, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 180 });
  return { ok: true };
}

const joinSchema = z.object({
  name: z.string({ error: "Enter your name." }).trim().min(1, "Enter your name.").max(120, "Keep it under 120 characters."),
  password: z.string({ error: "Choose a password." }).max(PASSWORD_MAX),
});

export type JoinState = { error?: string; field?: string; name?: string } | undefined;

/**
 * A new login made from an invitation: it joins the inviting business with
 * the invited role, and doesn't create a business of its own. The address is
 * the one the invitation was for — it isn't typed, so it can't be changed.
 */
export async function joinWithInviteAction(token: string, _prev: JoinState, formData: FormData): Promise<JoinState> {
  const parsed = joinSchema.safeParse({ name: formData.get("name"), password: formData.get("password") });
  const name = String(formData.get("name") ?? "");
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue?.message ?? "Check the form and try again.", field: typeof issue?.path[0] === "string" ? issue.path[0] : undefined, name };
  }
  const invite = await inviteFor(String(token));
  if (!invite || invite.state !== "open") return { error: invite?.state === "expired" ? "This invitation has expired. Ask for a new one." : "This invitation can't be used any more." };
  if (await seatProblem(invite.organization.id, false)) return { error: `${invite.organization.name}'s plan doesn't include more team members right now. Ask them to check their plan.` };
  const weak = passwordProblem(parsed.data.password, invite.email);
  if (weak) return { error: weak, field: "password", name };
  const taken = await db.user.findFirst({ where: { email: { equals: invite.email, mode: "insensitive" } }, select: { id: true } });
  if (taken) return { error: `There's already a MAIRO login for ${invite.email}. Sign in with it to accept the invitation.` };

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const joined = await db.$transaction(async (tx) => {
    // Claimed first, so the same link can't make two logins.
    const claimed = await tx.teamInvite.updateMany({ where: { id: invite.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, data: { acceptedAt: new Date() } });
    if (claimed.count === 0) return null;
    const user = await tx.user.create({ data: { email: invite.email, name: parsed.data.name, passwordHash, role: "CLIENT", organizationId: invite.organization.id } });
    await tx.organizationMember.create({ data: { organizationId: invite.organization.id, userId: user.id, role: invite.role } });
    await tx.teamInvite.update({ where: { id: invite.id }, data: { acceptedById: user.id } });
    return user;
  });
  if (!joined) return { error: "This invitation can't be used any more." };
  await audit(invite.organization.id, joined.id, "Joined the team", invite.email, `As ${ROLE_LABEL[invite.role]}`);

  try {
    await signIn("credentials", { email: invite.email, password: parsed.data.password, redirectTo: "/dashboard" });
  } catch (error) {
    if (error instanceof AuthError) return { error: "Your login was created, but signing you in didn't work. Sign in with the same email and password." };
    throw error;
  }
  return undefined;
}
