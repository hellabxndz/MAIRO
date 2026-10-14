import { cache } from "react";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

// Which business a signed-in person is acting in, decided from their
// memberships on every request — never from what was true when they signed
// in. A person removed from a business loses it on their next request; a
// person in several businesses switches between them with a cookie that
// only counts when they really are a member of the business it names.
//
// Used by the session callback (lib/auth.ts), so every page and action that
// reads session.user.organizationId gets the checked answer.

export const WORKSPACE_COOKIE = "mairo_workspace";

/** The chosen workspace from the cookie, or null outside a request. */
export async function chosenWorkspace(): Promise<string | null> {
  try {
    return (await cookies()).get(WORKSPACE_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * The business to act in: the chosen one if this person is a member of it,
 * else their own, else the first they belong to. Null when they belong to
 * none. Cached per request.
 */
export const resolveWorkspace = cache(async (userId: string, home: string | null, chosen: string | null): Promise<string | null> => {
  const rows = await db.organizationMember.findMany({ where: { userId }, select: { organizationId: true }, orderBy: { createdAt: "asc" } });
  const ids = rows.map((r) => r.organizationId);
  if (chosen && ids.includes(chosen)) return chosen;
  if (home && ids.includes(home)) return home;
  // A login made by the code before teams (during a deploy) has its own
  // business and no membership. Removal can't produce this — it moves the
  // home business too — so a business with nobody on its team is theirs.
  if (home && ids.length === 0 && (await db.organizationMember.count({ where: { organizationId: home } })) === 0) {
    await db.organizationMember.create({ data: { organizationId: home, userId, role: "OWNER" } }).catch(() => null);
    return home;
  }
  return ids[0] ?? null;
});

/** Every business this person belongs to, with their role, for the switcher. */
export async function workspacesOf(userId: string) {
  const rows = await db.organizationMember.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { role: true, organization: { select: { id: true, name: true } } } });
  return rows.map((r) => ({ id: r.organization.id, name: r.organization.name, role: r.role }));
}
