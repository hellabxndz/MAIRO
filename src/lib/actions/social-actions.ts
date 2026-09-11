"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { can } from "@/lib/entitlements";
import { absoluteUrl } from "@/lib/site";
import { CAPTION_MAX, POSTS_PER_DAY, postsInLastDay, publishToInstagram } from "@/lib/instagram/publish";

// Publishing to the customer's own profiles, from a creative they approved.
//
// The plan gate is checked here rather than only on the page. A locked card
// somebody can walk around by calling the action is decoration, and this one
// writes on a customer's public profile under their own name — the most
// consequential thing MAIRO does that isn't spending money.
//
// Everything published comes from a creative the customer approved. There is
// no free-text "post anything" box, and that is a deliberate limit rather than
// a missing feature: the approval step is what makes MAIRO posting on someone's
// behalf defensible, and a box that posts arbitrary text to a business's
// Instagram is a different product with different risks.

const publishSchema = z.object({
  imageId: z.string().min(1, "Pick a picture to post."),
  caption: z
    .string()
    .trim()
    .min(1, "The post needs a caption.")
    .max(CAPTION_MAX, `Instagram's caption limit is ${CAPTION_MAX} characters.`),
});

export type SocialActionState =
  | { error?: string; posted?: boolean; permalink?: string | null; message?: string }
  | undefined;

export async function postToInstagramAction(
  _prev: SocialActionState,
  formData: FormData
): Promise<SocialActionState> {
  const session = await auth();
  if (!session?.user?.organizationId) return { error: "Not authenticated" };
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  if (!(await can(organizationId, "social_posting"))) {
    return {
      error: "MAIRO posting to your profiles comes with Pro. Choose it in Settings and it opens up straight away.",
    };
  }

  const parsed = publishSchema.safeParse({
    imageId: formData.get("imageId"),
    caption: formData.get("caption"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the post." };
  }

  // Instagram's own ceiling, checked before the picture is sent. An account
  // that has hit it gets a refusal from Meta that reads like a permissions
  // problem, which is a miserable thing to debug from the outside.
  const today = await postsInLastDay(organizationId);
  if (today >= POSTS_PER_DAY) {
    return {
      error: `Instagram allows ${POSTS_PER_DAY} posts a day per account and you've used them. Try again tomorrow.`,
    };
  }

  // The picture has to be one of this organization's own approved finals —
  // scoped in the query, so an id from another account reads as missing.
  const image = await db.creativeImage.findFirst({
    where: {
      id: parsed.data.imageId,
      isFinal: true,
      creativeRequest: {
        organizationId,
        status: { in: ["APPROVED", "DELIVERED"] },
      },
    },
    select: { id: true, creativeRequestId: true },
  });
  if (!image) {
    return { error: "That picture isn't one of your approved creatives." };
  }

  const result = await publishToInstagram({
    organizationId,
    caption: parsed.data.caption,
    // Instagram fetches this itself, so it has to be absolute and public.
    imageUrl: absoluteUrl(`/api/creatives/${image.id}/raw`),
    creativeRequestId: image.creativeRequestId,
  });

  revalidatePath("/dashboard/social");

  if (!result.ok) return { error: result.error.message };

  return {
    posted: true,
    permalink: result.data.permalink,
    message: result.data.message,
  };
}
