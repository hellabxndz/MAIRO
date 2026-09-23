import { z } from "zod";
import { db } from "@/lib/db";
import type { AdDestination } from "@/generated/prisma/enums";
import { reviewAdImage, reviewCreative } from "@/lib/ai/review";
import { checkCopy, ctaLabel, fitCta, maxTestAds } from "@/lib/campaigns/ad-copy";
import { isOwnUpload } from "@/lib/campaigns/media-rules";
import type { CampaignAdInput } from "@/lib/campaigns/launch";

// The ads the Create wizard asks for, checked on the server before anything is
// built: every reference belongs to this business, the test fits the budget,
// and the words pass the same checks the wizard showed — plus the same AI
// safety review every other ad in MAIRO goes through. Nothing the browser sent
// is trusted just because the wizard would never send it.

const adSchema = z.object({
  kind: z.enum(["IMAGE", "VIDEO", "EXISTING_AD"]),
  studioAssetId: z.string().max(64).nullish(),
  /** A picture the customer uploaded themselves. */
  imageUrl: z.string().max(2000).nullish(),
  videoUrl: z.string().max(2000).nullish(),
  videoPosterUrl: z.string().max(2000).nullish(),
  sourceAdId: z.string().regex(/^\d{5,25}$/).nullish(),
  sourceAdName: z.string().max(200).nullish(),
  headline: z.string().max(300).nullish(),
  primaryText: z.string().max(1200).nullish(),
  cta: z.string().max(40).nullish(),
});

/** Up to five of their own pictures, or three versions of the words. */
const adsSchema = z.array(adSchema).min(1).max(5);

export type WizardAd = z.infer<typeof adSchema>;

export async function resolveCampaignAds(input: {
  organizationId: string;
  raw: string;
  destination: AdDestination;
  perDayCents: number;
  businessName: string;
  usesMeta: boolean;
  usesTikTok: boolean;
}): Promise<{ ok: true; ads: CampaignAdInput[] } | { ok: false; error: string }> {
  let parsed: WizardAd[];
  try {
    const result = adsSchema.safeParse(JSON.parse(input.raw));
    if (!result.success) return { ok: false, error: "The ad settings didn't come through. Go back to Your Advertisement and choose again." };
    parsed = result.data;
  } catch {
    return { ok: false, error: "The ad settings didn't come through. Go back to Your Advertisement and choose again." };
  }

  // The budget cap is for testing versions of the words on one creative.
  // Several different pictures are the customer's call — Meta favours the
  // best of them — so they aren't capped by budget.
  const ownPictures = new Set(parsed.filter((a) => a.imageUrl).map((a) => a.imageUrl)).size;
  const wordVersions = parsed.length - Math.max(0, ownPictures - 1);
  if (wordVersions > maxTestAds(input.perDayCents)) {
    return { ok: false, error: "That budget is too small to test this many versions fairly. Run fewer, or raise the budget." };
  }

  const ads: CampaignAdInput[] = [];
  const reviewed = new Set<string>();
  for (const ad of parsed) {
    if (ad.kind === "EXISTING_AD" && !input.usesMeta) {
      return { ok: false, error: "Existing ads run on Meta only." };
    }
    // TikTok runs video only; a picture or an existing Meta ad can't go there.
    if (input.usesTikTok && ad.kind !== "VIDEO") {
      return { ok: false, error: "TikTok ads have to be videos. Upload a video for this campaign, or make it a Meta-only campaign." };
    }

    if (ad.kind === "EXISTING_AD") {
      if (!ad.sourceAdId) return { ok: false, error: "Pick which of your ads to run again." };
      ads.push({ kind: "EXISTING_AD", sourceAdId: ad.sourceAdId, sourceAdName: ad.sourceAdName ?? null });
      continue;
    }

    const words = {
      headline: (ad.headline ?? "").trim(),
      primaryText: (ad.primaryText ?? "").trim(),
      cta: fitCta(ad.cta ?? "LEARN_MORE", input.destination),
    };
    const problem = checkCopy(words, input.destination).find((f) => f.level === "problem");
    if (problem) return { ok: false, error: problem.text };

    if (ad.kind === "IMAGE" && ad.imageUrl) {
      // Their own picture: it must be this business's upload, and it gets the
      // same picture safety review every other ad does. No credits involved.
      if (!isOwnUpload(ad.imageUrl, input.organizationId)) {
        return { ok: false, error: "That picture upload can't be used. Upload it again in Your Advertisement." };
      }
      if (!reviewed.has(ad.imageUrl)) {
        const verdict = await reviewPicture(ad.imageUrl, input.businessName);
        if (!verdict.ok) return { ok: false, error: verdict.error };
        reviewed.add(ad.imageUrl);
      }
      ads.push({ kind: "IMAGE", imageUrl: ad.imageUrl, ...copyFields(words) });
    } else if (ad.kind === "IMAGE") {
      const asset = ad.studioAssetId
        ? await db.creativeStudioAsset.findFirst({
            where: { id: ad.studioAssetId, organizationId: input.organizationId },
            select: { linkedCreativeRequestId: true },
          })
        : null;
      if (!asset?.linkedCreativeRequestId) {
        return { ok: false, error: "The picture for this ad isn't attached yet. Go back to Your Advertisement and use it in the campaign." };
      }
      ads.push({ kind: "IMAGE", creativeRequestId: asset.linkedCreativeRequestId, ...copyFields(words) });
    } else {
      if (!ad.videoUrl || !ad.videoPosterUrl || !isOwnUpload(ad.videoUrl, input.organizationId) || !isOwnUpload(ad.videoPosterUrl, input.organizationId)) {
        return { ok: false, error: "That video upload can't be used. Upload it again in Your Advertisement." };
      }
      ads.push({ kind: "VIDEO", videoUrl: ad.videoUrl, videoPosterUrl: ad.videoPosterUrl, ...copyFields(words) });
    }
  }

  // The words go through the same safety review as every other ad MAIRO runs.
  // Unreachable is not a pass: nothing runs unchecked.
  const written = ads.filter((a) => a.primaryText);
  if (written.length > 0) {
    try {
      const review = await reviewCreative({
        type: "COPY",
        brief: "Ad copy chosen and edited by the business in MAIRO's campaign builder.",
        businessName: input.businessName,
        concept: written
          .map((a, i) => `Version ${i + 1}\n**Headline:** ${a.headline}\n**Primary text:** ${a.primaryText}\n**Call to action:** ${ctaLabel(a.callToAction ?? "")}`)
          .join("\n\n"),
      });
      if (review.verdict === "BLOCK") {
        return { ok: false, error: review.reason || "The ad text didn't pass MAIRO's safety review. Change it and try again." };
      }
    } catch (error) {
      console.error("Copy safety review failed at launch:", error);
      return { ok: false, error: "MAIRO couldn't check the ad text just now, and nothing runs unchecked. Try again in a moment." };
    }
  }

  return { ok: true, ads };
}

function copyFields(words: { headline: string; primaryText: string; cta: string }) {
  return { headline: words.headline || null, primaryText: words.primaryText, callToAction: words.cta === "NO_BUTTON" ? null : words.cta };
}

/** The same picture safety review every ad picture in MAIRO gets. */
async function reviewPicture(url: string, businessName: string): Promise<{ ok: true } | { ok: false; error: string }> {
  let dataUrl: string;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(String(response.status));
    const type = response.headers.get("content-type")?.split(";")[0] || "image/jpeg";
    dataUrl = `data:${type};base64,${Buffer.from(await response.arrayBuffer()).toString("base64")}`;
  } catch {
    return { ok: false, error: "MAIRO couldn't read one of your pictures to check it. Upload it again and try once more." };
  }
  try {
    const review = await reviewAdImage({ imageDataUrl: dataUrl, brief: "The business's own ad picture, uploaded in MAIRO's campaign builder.", businessName });
    if (review.verdict === "BLOCK") {
      return { ok: false, error: review.reason || "One of your pictures didn't pass the safety check. Use a different one." };
    }
    return { ok: true };
  } catch (error) {
    console.error("Picture safety review failed at launch:", error);
    return { ok: false, error: "MAIRO couldn't check your pictures just now, and nothing runs unchecked. Try again in a moment." };
  }
}
