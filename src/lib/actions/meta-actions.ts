"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { startExploring } from "@/lib/explore-mode";
import { loadMetaConnection } from "@/lib/meta/connection";
import { fetchPages } from "@/lib/meta/oauth";
import { activeOrganizationId } from "@/lib/active-org";

export async function disconnectMetaAction() {
  const session = await auth();
  if (!session?.user?.organizationId) throw new Error("Not authenticated");

  const organizationId =
    (await activeOrganizationId()) ?? session.user.organizationId;

  await db.metaAdAccount.deleteMany({
    where: { organizationId: organizationId },
  });

  revalidatePath("/dashboard/meta");
  revalidatePath("/dashboard");
}

/**
 * The Pages this connection can post ads as.
 *
 * Read live from Meta rather than stored, because the set changes outside
 * MAIRO: a Page gets added, a role gets revoked, a business hands one over.
 * A cached list would offer a Page the token can no longer use, and the
 * failure would arrive as a Graph error at launch time instead of here.
 */
export async function listMetaPagesAction(): Promise<
  { ok: true; pages: { id: string; name: string }[] } | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user?.organizationId) return { ok: false, error: "Not signed in." };

  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const connection = await loadMetaConnection(organizationId);
  if (!connection) return { ok: false, error: "Connect a Meta account first." };

  try {
    const pages = await fetchPages(connection.accessToken);
    return { ok: true, pages: pages.map((p) => ({ id: p.id, name: p.name })) };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? `Meta wouldn't list your Pages: ${error.message}`
          : "Meta wouldn't list your Pages.",
    };
  }
}

/**
 * Chooses which Page ads go out as.
 *
 * The id is checked against what Meta says this token can reach rather than
 * trusted from the form. A page id is not a secret and the field is a plain
 * string in a request anyone signed in can shape, so without this a customer
 * could point their ads at a Page they do not manage — Meta would refuse it,
 * but only at launch, long after the mistake stopped being visible.
 */
export async function selectMetaPageAction(
  pageId: string
): Promise<{ error: string } | undefined> {
  const session = await auth();
  if (!session?.user?.organizationId) return { error: "Not signed in." };

  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const connection = await loadMetaConnection(organizationId);
  if (!connection) return { error: "Connect a Meta account first." };

  let pages: Awaited<ReturnType<typeof fetchPages>>;
  try {
    pages = await fetchPages(connection.accessToken);
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? `Meta wouldn't confirm your Pages: ${error.message}`
          : "Meta wouldn't confirm your Pages.",
    };
  }

  const chosen = pages.find((p) => p.id === pageId);
  if (!chosen) {
    return { error: "That Page isn't one this Meta login manages." };
  }

  await db.metaAdAccount.update({
    where: { organizationId },
    data: { pageId: chosen.id, pageName: chosen.name },
  });

  revalidatePath("/dashboard/meta");
  revalidatePath("/dashboard/campaigns");
}

// Lets a signed-in client look around the dashboard before connecting Meta.
// See src/lib/explore-mode.ts for why this exists and why it is a cookie.
export async function exploreWithoutMetaAction() {
  await startExploring();
  redirect("/dashboard");
}
