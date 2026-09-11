import { metaGraphRequest } from "@/lib/meta/client";
import { META_CTA_TYPES } from "@/lib/meta/creative-copy";

// Turning a picture and some copy into an ad that can actually run.
//
// This is the gap that made every campaign MAIRO created an empty shell. A
// campaign holds a budget and an objective; an ad set holds targeting; but
// nothing delivers until there is an *ad*, and an ad needs a creative, and a
// creative needs an image that already lives in the customer's ad account.
// There is no "here is a URL, fetch it" form — the bytes have to be uploaded
// and referenced by the hash Meta gives back.
//
// So it is three calls in a fixed order, each depending on the last:
//
//   /adimages    the picture → an image hash
//   /adcreatives the hash + the copy + the Page → a creative id
//   /ads         the creative id + the ad set → an ad
//
// Everything is created PAUSED. A customer's money does not start moving
// because a launch succeeded; it moves when they press the button that says
// so.

/** Meta's cap on an uploaded ad image. */
const MAX_IMAGE_BYTES = 30 * 1024 * 1024;

export type UploadedImage = { hash: string; url: string | null };

/**
 * Uploads one picture to the ad account's image library.
 *
 * The data URL prefix has to go: Meta wants raw base64 in `bytes`, and sending
 * the whole `data:image/png;base64,...` string is accepted as a file that then
 * fails to render, which shows up much later as an ad with a blank image.
 */
export async function uploadAdImage(
  adAccountId: string,
  accessToken: string,
  dataUrl: string,
  filename = "mairo-creative"
): Promise<UploadedImage> {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(dataUrl.trim());
  if (!match) throw new Error("That picture isn't in a format MAIRO can send to Meta.");

  const base64 = match[2].replace(/\s/g, "");
  // Base64 is 4 characters per 3 bytes; close enough to catch an oversized
  // file before spending the upload.
  const approxBytes = Math.floor((base64.length * 3) / 4);
  if (approxBytes > MAX_IMAGE_BYTES) {
    throw new Error("That picture is larger than Meta accepts for an ad.");
  }

  const res = await metaGraphRequest<{
    images?: Record<string, { hash?: string; url?: string }>;
  }>(`/${adAccountId}/adimages`, {
    method: "POST",
    accessToken,
    params: { bytes: base64, name: filename },
  });

  // Meta keys the response by a filename it chooses, not the one sent, so the
  // first entry is the only reliable way to find the hash.
  const first = Object.values(res.images ?? {})[0];
  if (!first?.hash) throw new Error("Meta accepted the picture but returned no image hash.");

  return { hash: first.hash, url: first.url ?? null };
}

export type AdCreativeInput = {
  adAccountId: string;
  accessToken: string;
  name: string;
  /** The Facebook Page the ad is published by. Meta requires one. */
  pageId: string;
  imageHash: string;
  /** Where the ad sends people. Must be a real, reachable URL. */
  link: string;
  /** The text above the ad. */
  message: string;
  /** The bold line under the image. */
  headline: string;
  callToAction: string | null;
};

/**
 * Builds the creative: the thing the person actually sees.
 *
 * `object_story_spec` is the shape Meta wants for a link ad, and the Page id
 * inside it is not optional — an ad is always published *by* a Page, even when
 * it only ever appears as an ad. A customer who connected an ad account but
 * never picked a Page cannot have one made, which is checked before this is
 * called rather than discovered here.
 */
export async function createAdCreative(input: AdCreativeInput): Promise<{ id: string }> {
  const cta =
    input.callToAction && META_CTA_TYPES.has(input.callToAction)
      ? input.callToAction
      : "LEARN_MORE";

  return metaGraphRequest<{ id: string }>(`/${input.adAccountId}/adcreatives`, {
    method: "POST",
    accessToken: input.accessToken,
    params: {
      name: input.name,
      object_story_spec: JSON.stringify({
        page_id: input.pageId,
        link_data: {
          image_hash: input.imageHash,
          link: input.link,
          message: input.message,
          name: input.headline,
          call_to_action: {
            type: cta,
            // The button needs its own destination even when it matches the
            // link; omitting it makes the button inert on some placements.
            value: { link: input.link },
          },
        },
      }),
      // Meta's automatic variations — cropping the image, reordering the text —
      // are off. The customer approved a specific picture and a specific line,
      // and MAIRO showing them one ad while Meta runs a different one would
      // make the approval meaningless.
      degrees_of_freedom_spec: JSON.stringify({
        creative_features_spec: {
          standard_enhancements: { enroll_status: "OPT_OUT" },
        },
      }),
    },
  });
}

/** Attaches a creative to an ad set. Paused, always. */
export async function createMetaAd(input: {
  adAccountId: string;
  accessToken: string;
  name: string;
  adSetId: string;
  creativeId: string;
}): Promise<{ id: string }> {
  return metaGraphRequest<{ id: string }>(`/${input.adAccountId}/ads`, {
    method: "POST",
    accessToken: input.accessToken,
    params: {
      name: input.name,
      adset_id: input.adSetId,
      creative: JSON.stringify({ creative_id: input.creativeId }),
      status: "PAUSED",
    },
  });
}

/**
 * Meta's conversion event names, from the standard event a niche optimizes for.
 *
 * Meta uses SCREAMING_SNAKE here and TitleCase in the pixel — the same
 * conversion is "Purchase" to the pixel and "PURCHASE" to an ad set's
 * promoted_object. Sending the pixel's spelling is rejected with an error
 * about an invalid enum and no hint about which one.
 */
export function metaCustomEventType(metaEvent: string): string {
  const map: Record<string, string> = {
    Purchase: "PURCHASE",
    Lead: "LEAD",
    CompleteRegistration: "COMPLETE_REGISTRATION",
    Contact: "CONTACT",
    Schedule: "SCHEDULE",
    StartTrial: "START_TRIAL",
    Subscribe: "SUBSCRIBE",
    SubmitApplication: "SUBMIT_APPLICATION",
    AddToCart: "ADD_TO_CART",
    InitiateCheckout: "INITIATED_CHECKOUT",
    ViewContent: "VIEW_CONTENT",
    FindLocation: "FIND_LOCATION",
    Search: "SEARCH",
    Donate: "DONATE",
  };
  return map[metaEvent] ?? "OTHER";
}
