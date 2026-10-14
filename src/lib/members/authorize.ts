import { cache } from "react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrg } from "@/lib/active-org";
import { can, refusal, type Permission, type Role } from "./roles";

// The server-side check behind every change a role might not be allowed to
// make: changing budgets, approving launches, managing the team,
// disconnecting advertising accounts, billing, and the rest of the matrix in
// roles.ts. The role is read from the database for the business this request
// acts in — never from the browser, never from the session alone.

export type Member = { userId: string; organizationId: string; role: Role; actingAsClient: boolean };

/** The signed-in person's role in the business this request acts in, or null. Cached per request. */
export const currentMember = cache(async (): Promise<Member | null> => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const org = await activeOrg();
  if (!org) return null;
  // A freelancer working inside a client business runs it, as before teams existed.
  if (org.actingAsClient) return { userId, organizationId: org.id, role: "OWNER", actingAsClient: true };
  const m = await db.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: org.id, userId } }, select: { role: true } });
  return m ? { userId, organizationId: org.id, role: m.role, actingAsClient: false } : null;
});

/** Null when this person may do it here; otherwise the sentence to show them. */
export async function deniedFor(permission: Permission): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.id) return "Not signed in.";
  const m = await currentMember();
  if (!m) return refusal(null, permission);
  return can(m.role, permission) ? null : refusal(m.role, permission);
}

/**
 * This person's role in a named business — for requests that carry their own
 * business, like an assistant thread — or null if they have none there now.
 * A freelancer's client business counts as theirs to run, as in activeOrg.
 */
export async function roleIn(userId: string, organizationId: string): Promise<Role | null> {
  const m = await db.organizationMember.findUnique({ where: { organizationId_userId: { organizationId, userId } }, select: { role: true } });
  if (m) return m.role;
  const u = await db.user.findUnique({ where: { id: userId }, select: { role: true, organizationId: true } });
  if (u?.role !== "FREELANCER" || !u.organizationId) return null;
  const client = await db.organization.findFirst({ where: { id: organizationId, parentId: u.organizationId }, select: { id: true } });
  return client ? "OWNER" : null;
}

export { audit } from "./audit";
