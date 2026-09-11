"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { activeOrganizationId } from "@/lib/active-org";
import { can } from "@/lib/entitlements";
import { requestManagedSetup } from "@/lib/tiktok/managed-setup";
import { publishToTikTok } from "@/lib/tiktok/publish";
import { disconnectCreator } from "@/lib/tiktok/creator-connection";
import { db } from "@/lib/db";

// The customer-facing actions for the two TikTok features that aren't ads.
//
// Both check the entitlement here rather than trusting the UI. Starter does
// not include either of these, and a hidden card is a presentation choice, not
// a permission — the check that matters is the one on the server, next to the
// work.

export type TikTokActionState = { error?: string; success?: string } | undefined;

export async function requestTikTokSetupAction(
  _prev: TikTokActionState,
  formData: FormData
): Promise<TikTokActionState> {
  const session = await auth();
  if (!session?.user?.organizationId) return { error: "Not authenticated" };

  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  if (!(await can(organizationId, "tiktok_account_setup"))) {
    return {
      error:
        "Having MAIRO set your TikTok up for you is part of Growth. Starter covers Meta advertising.",
    };
  }

  const text = (key: string) => {
    const raw = formData.get(key);
    return typeof raw === "string" ? raw : "";
  };

  const result = await requestManagedSetup({
    organizationId,
    platform: "TIKTOK",
    displayName: text("displayName"),
    contactEmail: text("contactEmail"),
    contactPhone: text("contactPhone"),
    preferredHandle: text("preferredHandle"),
    alternateHandles: text("alternateHandles"),
    category: text("category"),
    bio: text("bio"),
    websiteUrl: text("websiteUrl"),
    customerNotes: text("customerNotes"),
  });

  if (!result.ok) return { error: result.error };

  revalidatePath("/dashboard/integrations");
  return { success: "We've got it. MAIRO will start on your TikTok and email you." };
}

export async function disconnectTikTokPostingAction(): Promise<TikTokActionState> {
  const session = await auth();
  if (!session?.user?.organizationId) return { error: "Not authenticated" };

  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  await disconnectCreator(organizationId);

  revalidatePath("/dashboard/integrations");
  return { success: "MAIRO can no longer post to your TikTok." };
}

export type PostResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

/**
 * Posts a video MAIRO produced to the customer's TikTok.
 *
 * Takes a URL rather than an upload because that is what actually exists: the
 * video is already somewhere MAIRO can read it. Only http(s) is accepted — a
 * data URL would mean carrying the whole file through a server action, and a
 * file:// or internal address would make this a request-forgery hole pointed
 * at MAIRO's own network.
 */
export async function postToTikTokAction(input: {
  videoUrl: string;
  caption: string;
  creativeRequestId?: string | null;
  privacyLevel?: string | null;
}): Promise<PostResult> {
  const session = await auth();
  if (!session?.user?.organizationId) return { ok: false, error: "Not authenticated" };

  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  if (!(await can(organizationId, "social_posting"))) {
    return {
      ok: false,
      error: "MAIRO posting to TikTok for you is part of Growth. Starter covers Meta advertising.",
    };
  }

  let url: URL;
  try {
    url = new URL(input.videoUrl);
  } catch {
    return { ok: false, error: "That doesn't look like a video link." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, error: "The video has to be a normal web link." };
  }

  // A creative id from elsewhere would let one organization attach its post to
  // another's creative, so it is only accepted if this organization owns it.
  let creativeRequestId: string | null = null;
  if (input.creativeRequestId) {
    const owned = await db.creativeRequest.findFirst({
      where: { id: input.creativeRequestId, organizationId },
      select: { id: true },
    });
    if (!owned) return { ok: false, error: "That creative doesn't belong to this account." };
    creativeRequestId = owned.id;
  }

  const result = await publishToTikTok({
    organizationId,
    caption: input.caption,
    videoUrl: input.videoUrl,
    privacyLevel: input.privacyLevel ?? undefined,
    creativeRequestId,
  });

  revalidatePath("/dashboard/integrations");

  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, message: result.data.message };
}
