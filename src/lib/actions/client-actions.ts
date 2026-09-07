"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ACTIVE_CLIENT_COOKIE } from "@/lib/active-org";
import { limitsFor } from "@/lib/plans";

// The client businesses inside a freelancer's workspace: adding one, switching
// into one, removing one.
//
// Everything here re-checks that the caller is a freelancer AND that the
// organization in question is one of theirs. None of it trusts an id that came
// from the browser.

export type ClientActionState = { error?: string } | undefined;

const newClientSchema = z.object({
  name: z.string().min(1, "Give the business a name").max(120, "That name is too long"),
  industry: z.string().max(80).optional(),
  website: z.string().max(200).optional(),
});

/** The freelancer's own workspace, or null if the caller isn't one. */
async function workspaceId(): Promise<string | null> {
  const session = await auth();
  if (session?.user?.role !== "FREELANCER") return null;
  return session.user.organizationId ?? null;
}

export async function addClientAction(
  _prevState: ClientActionState,
  formData: FormData
): Promise<ClientActionState> {
  const workspace = await workspaceId();
  if (!workspace) return { error: "Not authenticated" };

  const parsed = newClientSchema.safeParse({
    name: formData.get("name"),
    industry: formData.get("industry") || undefined,
    website: formData.get("website") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check your answers." };
  }

  const [workspaceOrg, count] = await Promise.all([
    db.organization.findUnique({
      where: { id: workspace },
      select: { subscriptionTier: true },
    }),
    db.organization.count({ where: { parentId: workspace } }),
  ]);
  if (!workspaceOrg) return { error: "Not authenticated" };

  // The client limit is the thing freelancer plans are sold on, so it is
  // enforced here rather than only shown in the interface.
  const allowed = limitsFor(workspaceOrg.subscriptionTier).clients ?? 0;
  if (count >= allowed) {
    return {
      error:
        allowed === 0
          ? "Choose a plan before adding client businesses."
          : `Your plan covers ${allowed} client ${allowed === 1 ? "business" : "businesses"}. Upgrade to add more.`,
    };
  }

  const client = await db.organization.create({
    data: {
      name: parsed.data.name,
      industry: parsed.data.industry,
      website: parsed.data.website,
      parentId: workspace,
    },
  });

  // Drop straight into the client that was just created: the next thing anyone
  // wants to do is set it up, and that all happens inside it.
  (await cookies()).set(ACTIVE_CLIENT_COOKIE, client.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  revalidatePath("/clients");
  redirect("/onboarding");
}

/** Switches which client the freelancer is working inside. */
export async function switchClientAction(clientId: string): Promise<void> {
  const workspace = await workspaceId();
  if (!workspace) redirect("/sign-in");

  const store = await cookies();

  // An empty id means "back to the workspace".
  if (!clientId) {
    store.delete(ACTIVE_CLIENT_COOKIE);
    revalidatePath("/", "layout");
    redirect("/clients");
  }

  // Only one of theirs. active-org.ts checks this again on every request, but
  // refusing to write a bad cookie in the first place keeps the failure
  // visible here rather than silently falling back later.
  const client = await db.organization.findFirst({
    where: { id: clientId, parentId: workspace },
    select: { id: true },
  });
  if (!client) redirect("/clients");

  store.set(ACTIVE_CLIENT_COOKIE, client.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

/**
 * Removes a client business and everything belonging to it.
 *
 * Every relation from Organization cascades, so this takes the campaigns,
 * creatives, plans, intake and stored Meta token with it. That is the intended
 * behaviour — a freelancer who has stopped working with someone should not
 * still be holding their ad account token.
 */
export async function removeClientAction(clientId: string): Promise<void> {
  const workspace = await workspaceId();
  if (!workspace) redirect("/sign-in");

  const client = await db.organization.findFirst({
    where: { id: clientId, parentId: workspace },
    select: { id: true },
  });
  if (!client) redirect("/clients");

  await db.organization.delete({ where: { id: client.id } });

  const store = await cookies();
  if (store.get(ACTIVE_CLIENT_COOKIE)?.value === client.id) {
    store.delete(ACTIVE_CLIENT_COOKIE);
  }
  revalidatePath("/clients");
  redirect("/clients");
}
