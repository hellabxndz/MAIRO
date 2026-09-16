"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { listPagePosts, listProductCatalogs } from "@/lib/meta/sales-sources";
import type { PagePost, ProductCatalog } from "@/lib/campaigns/sales-source";

// What a shop's ads should be made of, asked once the subscription is paid.
//
// Everything here returns its refusals rather than throwing them. A thrown
// error in a server action reaches production as "a server error occurred",
// which would turn "Meta hasn't approved this yet" into nonsense — and these
// are the two features most likely to be refused by Meta rather than by MAIRO.

async function currentOrganization() {
  const session = await auth();
  if (!session?.user?.organizationId) return null;
  return (await activeOrganizationId()) ?? session.user.organizationId;
}

/** The Page's own posts, for the picker. */
export async function loadPagePostsAction(): Promise<
  { ok: true; posts: PagePost[] } | { ok: false; error: string }
> {
  const organizationId = await currentOrganization();
  if (!organizationId) return { ok: false, error: "Not signed in." };

  const result = await listPagePosts(organizationId);
  return result.ok ? { ok: true, posts: result.data } : { ok: false, error: result.error };
}

/** The catalogues this business owns on Meta. */
export async function loadCatalogsAction(): Promise<
  { ok: true; catalogs: ProductCatalog[] } | { ok: false; error: string }
> {
  const organizationId = await currentOrganization();
  if (!organizationId) return { ok: false, error: "Not signed in." };

  const result = await listProductCatalogs(organizationId);
  return result.ok ? { ok: true, catalogs: result.data } : { ok: false, error: result.error };
}

/**
 * Records how this business wants its sales ads built.
 *
 * Refuses a choice that cannot produce an ad, rather than storing it and
 * failing at launch: "run one of my posts" with no post picked is a campaign
 * that gets as far as the ad and stops, days later, with a message about a
 * creative the customer thought they had already chosen.
 */
export async function saveSalesSourceAction(input: {
  source: "MAIRO_CREATES" | "EXISTING_POST" | "CATALOG";
  postId?: string | null;
  catalogId?: string | null;
}): Promise<{ error?: string }> {
  const organizationId = await currentOrganization();
  if (!organizationId) return { error: "Not signed in." };

  if (input.source === "EXISTING_POST" && !input.postId) {
    return { error: "Pick which post you want to run as your ad." };
  }
  if (input.source === "CATALOG" && !input.catalogId) {
    return { error: "Pick which catalogue you want to sell from." };
  }

  await db.organization.update({
    where: { id: organizationId },
    data: {
      salesAdSource: input.source,
      // Cleared when it stops applying. A post id left behind by somebody who
      // switched back to MAIRO writing the ads would sit in the database
      // looking like a current choice.
      boostPostId: input.source === "EXISTING_POST" ? input.postId : null,
      productCatalogId: input.source === "CATALOG" ? input.catalogId : null,
    },
  });

  revalidatePath("/dashboard/sales-setup");
  revalidatePath("/dashboard");
  return {};
}
