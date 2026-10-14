import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { canManage, isRole, ROLE_LABEL, type Role } from "./roles";
import { audit } from "./audit";

// A business's team: who's in it with which role, the invitations waiting,
// and the changes to it. Every function takes the business and the person
// acting, checks what that person's role allows, and records the change.
//
// Invitations are links with a random token; only its hash is kept. A link
// works once, for the address it was sent to, for seven days. MAIRO doesn't
// send the email — the owner copies the link and sends it themselves.

export const INVITE_DAYS = 7;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const normEmail = (e: string) => e.trim().toLowerCase();

type Fail = { ok: false; error: string };

async function roleOf(organizationId: string, userId: string): Promise<Role | null> {
  const m = await db.organizationMember.findUnique({ where: { organizationId_userId: { organizationId, userId } }, select: { role: true } });
  return m?.role ?? null;
}

export async function listTeam(organizationId: string) {
  const [members, invites, log] = await Promise.all([
    db.organizationMember.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" }, select: { id: true, role: true, createdAt: true, user: { select: { id: true, name: true, email: true } } } }),
    db.teamInvite.findMany({ where: { organizationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, select: { id: true, email: true, role: true, expiresAt: true, createdAt: true } }),
    db.auditLog.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 40, select: { id: true, action: true, target: true, detail: true, createdAt: true, actorUserId: true } }),
  ]);
  const names = new Map(members.map((m) => [m.user.id, m.user.name || m.user.email]));
  return {
    members: members.map((m) => ({ id: m.id, userId: m.user.id, name: m.user.name, email: m.user.email, role: m.role, since: m.createdAt })),
    invites,
    log: log.map((l) => ({ ...l, actor: l.actorUserId ? names.get(l.actorUserId) ?? "A former member" : "MAIRO" })),
  };
}

/** A new invitation. Returns the token once, to put in the link; it isn't stored. */
export async function createInvite(organizationId: string, actorUserId: string, emailRaw: string, role: string): Promise<{ ok: true; token: string; expiresAt: Date } | Fail> {
  const actor = await roleOf(organizationId, actorUserId);
  if (!isRole(role)) return { ok: false, error: "Choose a role." };
  if (!canManage(actor, role)) return { ok: false, error: actor === "ADMIN" ? "Only an owner can invite another owner." : "Only owners and administrators can invite people." };
  const email = normEmail(emailRaw);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return { ok: false, error: "Enter their email address." };
  const already = await db.organizationMember.findFirst({ where: { organizationId, user: { email: { equals: email, mode: "insensitive" } } }, select: { id: true } });
  if (already) return { ok: false, error: "They're already on the team." };
  // One open invitation per address: a new one replaces the old.
  await db.teamInvite.updateMany({ where: { organizationId, email, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000);
  await db.teamInvite.create({ data: { organizationId, email, role, tokenHash: hash(token), invitedById: actorUserId, expiresAt } });
  await audit(organizationId, actorUserId, "Invited someone", email, `As ${ROLE_LABEL[role]}`);
  return { ok: true, token, expiresAt };
}

export async function revokeInvite(organizationId: string, actorUserId: string, inviteId: string): Promise<{ ok: true } | Fail> {
  const actor = await roleOf(organizationId, actorUserId);
  const invite = await db.teamInvite.findFirst({ where: { id: inviteId, organizationId, acceptedAt: null, revokedAt: null } });
  if (!invite) return { ok: false, error: "That invitation isn't open any more." };
  if (!canManage(actor, invite.role)) return { ok: false, error: "Only owners and administrators can withdraw invitations." };
  await db.teamInvite.update({ where: { id: invite.id }, data: { revokedAt: new Date() } });
  await audit(organizationId, actorUserId, "Withdrew an invitation", invite.email);
  return { ok: true };
}

/** What an invitation link is for, without accepting it. */
export async function inviteFor(token: string) {
  if (!token || token.length > 100) return null;
  const invite = await db.teamInvite.findUnique({ where: { tokenHash: hash(token) }, select: { id: true, email: true, role: true, expiresAt: true, acceptedAt: true, revokedAt: true, organization: { select: { id: true, name: true } } } });
  if (!invite) return null;
  const state = invite.acceptedAt ? "used" : invite.revokedAt ? "withdrawn" : invite.expiresAt < new Date() ? "expired" : "open";
  return { ...invite, state } as const;
}

/**
 * Joins the business with the invited role. Only the person the invitation
 * was for, signed in with that address; once.
 */
export async function acceptInvite(token: string, userId: string, userEmail: string): Promise<{ ok: true; organizationId: string } | Fail> {
  const invite = await inviteFor(token);
  if (!invite || invite.state !== "open") return { ok: false, error: invite?.state === "expired" ? "This invitation has expired. Ask for a new one." : "This invitation can't be used any more." };
  if (normEmail(userEmail) !== invite.email) return { ok: false, error: `This invitation is for ${invite.email}. Sign in with that address to accept it.` };
  const claimed = await db.teamInvite.updateMany({ where: { id: invite.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, data: { acceptedAt: new Date(), acceptedById: userId } });
  if (claimed.count === 0) return { ok: false, error: "This invitation can't be used any more." };
  const existing = await roleOf(invite.organization.id, userId);
  if (!existing) await db.organizationMember.create({ data: { organizationId: invite.organization.id, userId, role: invite.role } });
  await audit(invite.organization.id, userId, "Joined the team", userEmail, `As ${ROLE_LABEL[existing ?? invite.role]}`);
  return { ok: true, organizationId: invite.organization.id };
}

const owners = (organizationId: string) => db.organizationMember.count({ where: { organizationId, role: "OWNER" } });

export async function changeRole(organizationId: string, actorUserId: string, memberId: string, roleRaw: string): Promise<{ ok: true } | Fail> {
  const actor = await roleOf(organizationId, actorUserId);
  const member = await db.organizationMember.findFirst({ where: { id: memberId, organizationId }, select: { id: true, role: true, userId: true, user: { select: { email: true } } } });
  if (!member) return { ok: false, error: "They're not on this team." };
  if (!isRole(roleRaw)) return { ok: false, error: "Choose a role." };
  if (!canManage(actor, member.role) || !canManage(actor, roleRaw)) return { ok: false, error: "Only an owner can change an owner, or make someone an owner." };
  if (member.role === "OWNER" && roleRaw !== "OWNER" && (await owners(organizationId)) <= 1) return { ok: false, error: "A business needs at least one owner. Make someone else an owner first." };
  if (member.role === roleRaw) return { ok: true };
  await db.organizationMember.update({ where: { id: member.id }, data: { role: roleRaw } });
  await audit(organizationId, actorUserId, "Changed a role", member.user.email, `${ROLE_LABEL[member.role]} → ${ROLE_LABEL[roleRaw]}`);
  return { ok: true };
}

/** Removes someone from the team, or lets someone leave. Their access ends on their next request. */
export async function removeMember(organizationId: string, actorUserId: string, memberId: string): Promise<{ ok: true } | Fail> {
  const actor = await roleOf(organizationId, actorUserId);
  const member = await db.organizationMember.findFirst({ where: { id: memberId, organizationId }, select: { id: true, role: true, userId: true, user: { select: { email: true, organizationId: true } } } });
  if (!member) return { ok: false, error: "They're not on this team." };
  const self = member.userId === actorUserId;
  if (!self && !canManage(actor, member.role)) return { ok: false, error: "Only owners and administrators can remove people, and only an owner can remove an owner." };
  if (member.role === "OWNER" && (await owners(organizationId)) <= 1) return { ok: false, error: "A business needs at least one owner. Make someone else an owner first." };
  await db.$transaction(async (tx) => {
    await tx.organizationMember.delete({ where: { id: member.id } });
    // Their own business is now whichever one they still belong to.
    if (member.user.organizationId === organizationId) {
      const next = await tx.organizationMember.findFirst({ where: { userId: member.userId }, orderBy: { createdAt: "asc" }, select: { organizationId: true } });
      await tx.user.update({ where: { id: member.userId }, data: { organizationId: next?.organizationId ?? null } });
    }
  });
  await audit(organizationId, actorUserId, self ? "Left the team" : "Removed someone", member.user.email);
  return { ok: true };
}
