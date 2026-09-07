import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// Which organization the current request is acting on.
//
// Before freelancers this question had a one-word answer: the one on your
// session. A freelancer has several — their own workspace, plus a client
// business for each business they run ads for — so "your organization" stops
// being a property of the user and becomes a property of the request.
//
// Everything in the app is scoped by organizationId, so this is the single
// place that decides what a request is allowed to touch. It is worth being
// paranoid here: the selected client arrives in a cookie, which the browser
// controls, so it is checked against the database on every call rather than
// trusted. A freelancer editing that cookie to another freelancer's client id
// gets nothing.

const COOKIE = "mairo_client";

export type ActiveOrg = {
  id: string;
  /** True when a freelancer is working inside one of their clients. */
  actingAsClient: boolean;
};

/**
 * Resolves the organization for this request, or null if there isn't one.
 *
 * A business owner always gets their own organization — identical to the
 * behaviour before freelancers existed, which is what makes this safe to swap
 * in everywhere.
 */
export async function activeOrg(): Promise<ActiveOrg | null> {
  const session = await auth();
  const home = session?.user?.organizationId;
  if (!home) return null;

  // Only a freelancer can act on anything other than their own organization.
  if (session.user.role !== "FREELANCER") {
    return { id: home, actingAsClient: false };
  }

  const selected = (await cookies()).get(COOKIE)?.value;
  if (!selected || selected === home) return { id: home, actingAsClient: false };

  // The cookie is a claim, not a fact. It only counts if that organization
  // really is a client of this freelancer's workspace.
  const client = await db.organization.findFirst({
    where: { id: selected, parentId: home },
    select: { id: true },
  });
  if (!client) return { id: home, actingAsClient: false };

  return { id: client.id, actingAsClient: true };
}

/** The active organization's id, or null. The common case. */
export async function activeOrganizationId(): Promise<string | null> {
  return (await activeOrg())?.id ?? null;
}

/** The name of the cookie, for the action that sets it. */
export const ACTIVE_CLIENT_COOKIE = COOKIE;
