"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { normalizeUrl } from "@/lib/campaigns/destination";
import { listPagePosts } from "@/lib/meta/sales-sources";
import type { PagePost } from "@/lib/campaigns/sales-source";
import { readShop, saveProducts } from "@/lib/catalog/read-shop";

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

/**
 * Reads the business's own website and stores what it sells.
 *
 * The scan and the save are one action on purpose: a customer who watched MAIRO
 * find forty products and then had to press Save to keep them would reasonably
 * assume the finding was the saving, and lose them by navigating away.
 */
export async function scanShopAction(
  rawUrl: string
): Promise<
  | { ok: true; found: number; how: string; sample: { title: string; priceCents: number | null; currency: string; imageUrl: string | null }[] }
  | { ok: false; error: string }
> {
  const organizationId = await currentOrganization();
  if (!organizationId) return { ok: false, error: "Not signed in." };

  const result = await readShop(rawUrl);
  if (!result.ok) return { ok: false, error: result.error };

  await saveProducts(organizationId, result.products);

  // The website is worth keeping whatever else happens: an ad for a product
  // has to link somewhere, and this is the only place the shop's address is
  // asked for once somebody picked a destination that is not a website.
  const site = normalizeUrl(rawUrl);
  if (site) {
    await db.organization.update({ where: { id: organizationId }, data: { website: site } });
  }

  revalidatePath("/dashboard/sales-setup");
  return {
    ok: true,
    found: result.products.length,
    how: result.how,
    sample: result.products.slice(0, 6).map((p) => ({
      title: p.title,
      priceCents: p.priceCents,
      currency: p.currency,
      imageUrl: p.imageUrl,
    })),
  };
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
}): Promise<{ error?: string }> {
  const organizationId = await currentOrganization();
  if (!organizationId) return { error: "Not signed in." };

  if (input.source === "EXISTING_POST" && !input.postId) {
    return { error: "Pick which post you want to run as your ad." };
  }
  // A catalogue that found nothing cannot produce an ad, and storing the
  // choice anyway means discovering that at launch instead of here.
  if (input.source === "CATALOG") {
    const products = await db.product.count({ where: { organizationId } });
    if (products === 0) {
      return { error: "MAIRO hasn't found anything you sell yet. Add your shop's address and let it read the page first." };
    }
  }

  await db.organization.update({
    where: { id: organizationId },
    data: {
      salesAdSource: input.source,
      // Cleared when it stops applying. A post id left behind by somebody who
      // switched back to MAIRO writing the ads would sit in the database
      // looking like a current choice.
      boostPostId: input.source === "EXISTING_POST" ? input.postId : null,
    },
  });

  revalidatePath("/dashboard/sales-setup");
  revalidatePath("/dashboard");
  return {};
}
