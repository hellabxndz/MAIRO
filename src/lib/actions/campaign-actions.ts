"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { planFor } from "@/lib/plans";
import {
  checkPlatformSelection,
  entitlementsFor,
  type EntitlementFlag,
} from "@/lib/entitlements";
import { activeOrganizationId } from "@/lib/active-org";
import type { AdDestination, MessageChannel } from "@/generated/prisma/enums";
import {
  recommendAllocation,
  splitBudget,
  validateAllocation,
} from "@/lib/budget/allocation";
import { createMairoCampaign } from "@/lib/campaigns/launch";
import { maybeGoLive } from "@/lib/campaigns/auto-launch";
import {
  END_PROBLEM_MESSAGE,
  instantFromLocal,
  SCHEDULE_PROBLEM_MESSAGE,
  validateEnd,
  validateStart,
} from "@/lib/campaigns/schedule";
import { getAdapter, platformName } from "@/lib/ad-platforms/registry";
import type { AdPlatform } from "@/generated/prisma/enums";
import {
  describeMissing,
  normalizePhone,
  normalizeUrl,
  resolveDestination,
} from "@/lib/campaigns/destination";
import { blankLeadForm, ensureLeadForm, leadFormUrl } from "@/lib/leads/forms";
import { pushFormToMeta } from "@/lib/leads/meta-form";
import { searchPlaces, type Place } from "@/lib/meta/places";
import { FACEBOOK_POST_ID, INSTAGRAM_MEDIA_ID } from "@/lib/campaigns/sales-source";
import { siteUrl } from "@/lib/site";

const PLATFORM_VALUES = ["META", "TIKTOK", "GOOGLE", "SNAPCHAT", "PINTEREST", "LINKEDIN"] as const;

const createCampaignSchema = z.object({
  name: z.string().min(1),
  objective: z.enum(["LEADS", "SALES", "AWARENESS", "TRAFFIC", "APP_PROMOTION"]),
  dailyBudget: z.coerce.number().min(1),
  platforms: z.array(z.enum(PLATFORM_VALUES)).min(1, "Pick at least one place to advertise."),
  /** Whole per cent per platform, in the same order as `platforms`. */
  percents: z.array(z.coerce.number().min(0).max(100)),
  tiktokGrowthMode: z.boolean().default(false),
  /**
   * When to start, as the wall-clock time the customer typed plus the zone
   * their browser is in. Both or neither — a time with no zone is not a time,
   * and reading it in the server's zone would put a launch hours out.
   */
  // nullish, not optional: an absent form field reads back as null rather
  // than undefined, and a schema that only accepts undefined rejects every
  // campaign created without a schedule — which is most of them.
  startLocal: z.string().trim().nullish(),
  startTimeZone: z.string().trim().max(64).nullish(),
  /**
   * What a click does, and the value it needs. Both nullish for the same
   * reason as the schedule: a form that omits the field sends null.
   */
  destinationType: z.enum(["WEBSITE", "PHONE_CALL", "LEAD_FORM", "DIRECT_MESSAGE"]).nullish(),
  destinationValue: z.string().trim().max(2000).nullish(),
  /** Who writes the lead form, when one is being made now. */
  formAuthor: z.enum(["MAIRO", "OWN"]).nullish(),
  /** Which inbox a message ad opens. */
  messageChannel: z.enum(["MESSENGER", "INSTAGRAM", "WHATSAPP"]).nullish(),
  /** Where the lead form lives: a page MAIRO hosts, or Meta's own. */
  leadFormDelivery: z.enum(["HOSTED_PAGE", "META_NATIVE"]).nullish(),
  // Who sees it. Everything here is re-checked by normalizeAudience, because a
  // form can be posted from a console and Meta refuses a bad age range at
  // launch with a message naming a field the customer never saw.
  geoKey: z.string().nullish(),
  geoLabel: z.string().nullish(),
  geoRadius: z.coerce.number().nullish(),
  ageMin: z.coerce.number().nullish(),
  ageMax: z.coerce.number().nullish(),
  genders: z.coerce.number().nullish(),
  /** When it stops, in the same zone as the start. Empty keeps it running. */
  endLocal: z.string().trim().nullish(),
  /** How the Meta ad is made. Absent follows the business-wide setting. */
  adSource: z.enum(["CREATIVE", "FACEBOOK_POST", "INSTAGRAM_POST"]).nullish(),
  boostPostId: z.string().trim().regex(FACEBOOK_POST_ID, "That Facebook post can't be used.").nullish(),
  boostInstagramMediaId: z
    .string()
    .trim()
    .regex(INSTAGRAM_MEDIA_ID, "That Instagram post can't be used.")
    .nullish(),
  /** Empty lets Meta choose where the ad shows. */
  placements: z.array(z.enum(["FACEBOOK_FEED", "INSTAGRAM_FEED", "STORIES", "REELS"])).default([]),
});

export type CampaignActionState =
  | {
      error?: string;
      /**
       * Set when the plan is what stopped this, rather than the input. The
       * form opens the upgrade modal on this instead of showing a red error —
       * a customer clicking TikTok on Starter is expressing intent to buy, not
       * making a mistake.
       */
      upgradeNeeded?: EntitlementFlag;
      /** Per-platform outcome after a launch that partly worked. */
      partial?: { platform: string; error: string }[];
    }
  | undefined;

/**
 * Creates one Mairo campaign, on however many networks the customer chose.
 *
 * The shape of this used to be "create a campaign on Meta". The change is not
 * that it loops: it is that the customer's campaign and the networks' campaigns
 * are now different things, and this creates the first and asks the adapters
 * for the second. What comes back can be a partial success, and that is a
 * normal outcome rather than an error — see src/lib/campaigns/launch.ts.
 */
export async function createCampaignAction(
  _prevState: CampaignActionState,
  formData: FormData
): Promise<CampaignActionState> {
  const session = await auth();
  if (!session?.user?.organizationId) return { error: "Not authenticated" };
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const parsed = createCampaignSchema.safeParse({
    name: formData.get("name"),
    objective: formData.get("objective"),
    dailyBudget: formData.get("dailyBudget"),
    platforms: formData.getAll("platforms"),
    percents: formData.getAll("percents"),
    tiktokGrowthMode: formData.get("tiktokGrowthMode") === "on",
    startLocal: formData.get("startLocal"),
    startTimeZone: formData.get("startTimeZone"),
    destinationType: formData.get("destinationType"),
    destinationValue: formData.get("destinationValue"),
    formAuthor: formData.get("formAuthor"),
    messageChannel: formData.get("messageChannel"),
    leadFormDelivery: formData.get("leadFormDelivery"),
    geoKey: formData.get("geoKey") || null,
    geoLabel: formData.get("geoLabel") || null,
    geoRadius: formData.get("geoRadius") || null,
    ageMin: formData.get("ageMin") || null,
    ageMax: formData.get("ageMax") || null,
    genders: formData.get("genders") || null,
    endLocal: formData.get("endLocal") || null,
    adSource: formData.get("adSource") || null,
    boostPostId: formData.get("boostPostId") || null,
    boostInstagramMediaId: formData.get("boostInstagramMediaId") || null,
    placements: formData.getAll("placements"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // Picking "run one of my posts" without picking which post is caught here,
  // not at launch, where it would leave a campaign on Meta with no ad.
  const { adSource } = parsed.data;
  const boostPostId = adSource === "FACEBOOK_POST" ? (parsed.data.boostPostId ?? null) : null;
  const boostInstagramMediaId =
    adSource === "INSTAGRAM_POST" ? (parsed.data.boostInstagramMediaId ?? null) : null;
  if (adSource === "FACEBOOK_POST" && !boostPostId) {
    return { error: "Pick which Facebook post to run, or choose another way to make the ad." };
  }
  if (adSource === "INSTAGRAM_POST" && !boostInstagramMediaId) {
    return { error: "Pick which Instagram post to run, or choose another way to make the ad." };
  }

  const { name, objective, dailyBudget, platforms, percents, tiktokGrowthMode } = parsed.data;
  const totalDailyBudgetCents = Math.round(dailyBudget * 100);

  // When they want it to begin. Empty means "as soon as Meta approves it",
  // which is the default and what most people pick.
  //
  // The conversion happens here rather than in the browser because the browser
  // is where a Date is easiest to get wrong — and a start time an hour out is
  // a day's budget spent overnight, with nothing on any screen to explain it.
  let startAt: Date | null = null;
  const startTimeZone = parsed.data.startTimeZone?.trim() || null;
  if (parsed.data.startLocal) {
    if (!startTimeZone) {
      return { error: "MAIRO couldn't tell what timezone that time is in. Try again." };
    }
    startAt = instantFromLocal(parsed.data.startLocal, startTimeZone);
    if (!startAt) {
      return { error: SCHEDULE_PROBLEM_MESSAGE.unreadable };
    }
    const problem = validateStart(startAt);
    if (problem) return { error: SCHEDULE_PROBLEM_MESSAGE[problem] };
  }

  let endAt: Date | null = null;
  if (parsed.data.endLocal) {
    if (!startTimeZone) {
      return { error: "MAIRO couldn't tell what timezone that end date is in. Try again." };
    }
    endAt = instantFromLocal(parsed.data.endLocal, startTimeZone);
    if (!endAt) return { error: END_PROBLEM_MESSAGE.unreadable };
    const problem = validateEnd(endAt, startAt);
    if (problem) return { error: END_PROBLEM_MESSAGE[problem] };
  }

  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: { subscriptionTier: true },
  });
  if (!organization) return { error: "Organization not found" };

  // What the plan allows, asked once and in one place.
  const entitlements = await entitlementsFor(organizationId);
  const permission = checkPlatformSelection(platforms as AdPlatform[], entitlements);
  if (!permission.allowed) {
    return { upgradeNeeded: permission.missing };
  }
  if (tiktokGrowthMode && !entitlements.tiktok_growth) {
    return { upgradeNeeded: "tiktok_growth" };
  }

  // An archived campaign has been retired, so it doesn't hold a slot.
  const plan = planFor(organization.subscriptionTier);
  const activeCount = await db.mairoCampaign.count({
    where: { organizationId, status: { not: "ARCHIVED" } },
  });
  if (activeCount >= entitlements.campaign_limit) {
    return {
      error: `The ${plan.name} plan runs ${entitlements.campaign_limit} campaign${
        entitlements.campaign_limit === 1 ? "" : "s"
      } at a time. Archive one to free up a slot, or upgrade for more.`,
    };
  }

  // The customer may have dragged the split, or left MAIRO's suggestion alone.
  // Either way it is re-derived here rather than trusted: percentages arriving
  // from a form are user input, and the money is computed from them server-side.
  const allocations =
    percents.length === platforms.length && percents.reduce((a, b) => a + b, 0) === 100
      ? splitBudget(
          totalDailyBudgetCents,
          platforms.map((p, i) => ({ platform: p as AdPlatform, percent: percents[i] }))
        )
      : recommendAllocation(platforms as AdPlatform[], objective, totalDailyBudgetCents);

  const problems = validateAllocation(allocations);
  if (problems.length > 0) {
    return { error: problems[0].message };
  }

  // Where the click goes. Checked before anything is created, because the
  // alternative is a campaign built on Meta that can never carry an ad — which
  // is precisely what used to happen to a business with no website on file.
  const destinationType = parsed.data.destinationType ?? "WEBSITE";
  const rawDestination = parsed.data.destinationValue?.trim() ?? "";

  let destinationUrl: string | null = null;
  let destinationPhone: string | null = null;

  // A conversation needs nothing from anybody: the Page is already chosen on
  // the Meta connection screen, and that is what the ad opens a thread with.
  if (destinationType === "DIRECT_MESSAGE") {
    // Nothing to validate and nothing to store.
  } else if (destinationType === "LEAD_FORM") {
    // Written here, at the moment somebody actually chooses it — not when they
    // open a page and look. A form is a public URL with this business's name
    // on it, and creating one for everybody who glanced at the option would
    // leave most of them with a page they never asked for.
    // Their choice of author, and it only matters the first time — after that
    // the business has a form and the campaign simply points at it.
    const form =
      parsed.data.formAuthor === "OWN"
        ? await blankLeadForm(organizationId)
        : await ensureLeadForm(organizationId);
    if (!form) {
      return { error: "MAIRO couldn't write your form just now. Try again in a moment." };
    }
    destinationUrl = leadFormUrl(form.slug, siteUrl());

    // Meta's own form is created now rather than at launch, so a permission
    // MAIRO does not have yet is refused here — where the customer is looking
    // at the choice — instead of leaving a campaign half-built on the network.
    if (parsed.data.leadFormDelivery === "META_NATIVE") {
      const pushed = await pushFormToMeta(form.id);
      if (!pushed.ok) return { error: pushed.error };
    }
  } else if (rawDestination.length > 0) {
    if (destinationType === "PHONE_CALL") {
      destinationPhone = normalizePhone(rawDestination);
      if (!destinationPhone) {
        return {
          error:
            "That doesn't look like a phone number MAIRO can dial. Include the area code — for example (555) 123-4567.",
        };
      }
    } else {
      destinationUrl = normalizeUrl(rawDestination);
      if (!destinationUrl) {
        return {
          error: "That doesn't look like a web address. Something like yourshop.com/offer.",
        };
      }
    }
  } else {
    // Nothing typed means "use whatever this business normally does", which
    // only works if the business has said. Caught here rather than at launch.
    const fallback = await db.organization.findUnique({
      where: { id: organizationId },
      select: { defaultDestination: true, website: true, phone: true },
    });
    const resolved = resolveDestination(
      { type: destinationType },
      {
        type: fallback?.defaultDestination ?? "WEBSITE",
        url: fallback?.website,
        phone: fallback?.phone,
      }
    );
    if (!resolved) return { error: describeMissing(destinationType) };
  }

  const outcome = await createMairoCampaign({
    organizationId,
    name,
    objective,
    totalDailyBudgetCents,
    allocations,
    tiktokGrowthMode,
    startAt,
    startTimeZone: startAt || endAt ? startTimeZone : null,
    endAt,
    adSource: adSource ?? null,
    boostPostId,
    boostInstagramMediaId,
    placements: parsed.data.placements,
    destination: {
      type: destinationType,
      url: destinationUrl,
      phone: destinationPhone,
      channel: parsed.data.messageChannel ?? "MESSENGER",
      delivery: parsed.data.leadFormDelivery ?? "HOSTED_PAGE",
    },
    audience: {
      geoKey: parsed.data.geoKey ?? null,
      geoLabel: parsed.data.geoLabel ?? null,
      geoRadius: parsed.data.geoRadius ?? null,
      ageMin: parsed.data.ageMin ?? undefined,
      ageMax: parsed.data.ageMax ?? undefined,
      genders: parsed.data.genders ?? undefined,
    },
  });

  revalidatePath("/dashboard/campaigns");
  revalidatePath("/dashboard");

  const failures = outcome.results.filter((r) => !r.launched);

  // Everything failed: the campaign is saved as a draft and the customer is
  // told why, in the network's own words.
  if (failures.length === outcome.results.length) {
    return {
      error:
        failures.length === 1
          ? failures[0].error ?? "Couldn't create the campaign."
          : "Couldn't reach any of the selected networks. The campaign is saved as a draft.",
      partial: failures.map((f) => ({
        platform: platformName(f.platform),
        error: f.error ?? "Unknown error",
      })),
    };
  }

  // Some worked. Not an error — the campaign exists and is running where it
  // could — but the customer needs to know which half didn't.
  if (failures.length > 0) {
    return {
      partial: failures.map((f) => ({
        platform: platformName(f.platform),
        error: f.error ?? "Unknown error",
      })),
    };
  }

  return undefined;
}

/**
 * MAIRO's suggested split, for the form to show before anything is created.
 *
 * Server-side so the weighting logic has one home rather than being duplicated
 * into the client for the preview and then again on the server for the real
 * thing — which is exactly how a preview ends up disagreeing with what gets
 * created.
 */
export async function suggestAllocationAction(input: {
  platforms: AdPlatform[];
  objective: "LEADS" | "SALES" | "AWARENESS" | "TRAFFIC" | "APP_PROMOTION";
  dailyBudget: number;
}): Promise<{ platform: AdPlatform; percent: number; dailyBudgetCents: number }[]> {
  const total = Math.round(input.dailyBudget * 100);
  return recommendAllocation(input.platforms, input.objective, total);
}

/**
 * Moves — or clears — a campaign's booked start.
 *
 * Only while it hasn't started. Once ads are delivering, "when does it start"
 * is no longer a question, and Meta refuses to move the start of something
 * already running anyway.
 *
 * The database is updated first and the networks after. That order is
 * deliberate: MAIRO's own gate is what actually holds a campaign paused, so
 * saving it first means the new time is honoured even if Meta is unreachable
 * this second. The network call is the belt to that pair of braces — it stops
 * delivery beginning early if MAIRO isn't running when the time arrives — and
 * a failure there is reported rather than rolled back.
 */
export async function rescheduleCampaignAction(
  mairoCampaignId: string,
  startLocal: string | null,
  startTimeZone: string | null
): Promise<{ error?: string; saved?: boolean; warning?: string }> {
  const session = await auth();
  if (!session?.user?.organizationId) return { error: "Not authenticated" };
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const campaign = await db.mairoCampaign.findFirst({
    // Scoped to the organization in the query rather than checked afterwards,
    // so a campaign id from another account reads as missing.
    where: { id: mairoCampaignId, organizationId },
    include: { platformCampaigns: true },
  });
  if (!campaign) return { error: "Campaign not found" };

  if (campaign.status === "ACTIVE") {
    return {
      error:
        "This campaign is already running, so its start time can't be moved. Pause it instead if you want it to stop.",
    };
  }

  let startAt: Date | null = null;
  if (startLocal) {
    if (!startTimeZone) {
      return { error: "MAIRO couldn't tell what timezone that time is in. Try again." };
    }
    startAt = instantFromLocal(startLocal, startTimeZone);
    if (!startAt) return { error: SCHEDULE_PROBLEM_MESSAGE.unreadable };
    const problem = validateStart(startAt);
    if (problem) return { error: SCHEDULE_PROBLEM_MESSAGE[problem] };
  }

  // A booked end still has to come at least a day after the new start.
  if (validateEnd(campaign.endDate, startAt) === "too_soon") {
    return { error: "That start is too close to this campaign's end date. Pick an earlier start." };
  }

  await db.mairoCampaign.update({
    where: { id: campaign.id },
    data: { startDate: startAt, startTimeZone: startAt ? startTimeZone : null },
  });

  // Tell each network that already has an ad set. One that doesn't will be
  // given the new time when it is built.
  const failures: string[] = [];
  for (const child of campaign.platformCampaigns) {
    if (!child.externalAdGroupId) continue;
    const adapter = getAdapter(child.platform);
    if (!adapter) continue;

    const result = await adapter.updateSchedule({
      organizationId,
      externalAdGroupId: child.externalAdGroupId,
      startAt,
      endAt: campaign.endDate,
    });
    if (!result.ok) failures.push(`${platformName(child.platform)}: ${result.error.message}`);
  }

  revalidatePath("/dashboard/campaigns");
  revalidatePath("/dashboard");

  if (failures.length > 0) {
    return {
      saved: true,
      // Saved, and MAIRO will hold it — but the network holds its old copy of
      // the start time, so the customer should know the two disagree.
      warning: `Saved. MAIRO will hold the campaign until then, but couldn't update the schedule on ${failures.join("; ")}`,
    };
  }

  return { saved: true };
}

/**
 * Stops a campaign everywhere and takes it off the customer's list.
 *
 * This exists because of the plan limits. Starter runs one campaign at a time,
 * so a customer whose first attempt was a dud had no way forward at all: the
 * create form simply wasn't rendered, with nothing saying why or what to do.
 * The honest options are "delete this one" or "pay more", and only the second
 * was on the screen.
 *
 * The rule that shapes the whole function: MAIRO never stops showing a
 * campaign it hasn't stopped spending. Every network is paused first, and if
 * any of them refuses, nothing is archived and the customer is told. The
 * alternative — tidying the row away and leaving the ads running on Meta —
 * turns a campaign into money leaving their account with no screen anywhere
 * that mentions it.
 *
 * Archived rather than erased. The row keeps the network ids, so a campaign
 * MAIRO created is always one MAIRO can still account for.
 */
export async function deleteCampaignAction(
  mairoCampaignId: string
): Promise<{ error?: string; deleted?: boolean; name?: string }> {
  const session = await auth();
  if (!session?.user?.organizationId) return { error: "Not authenticated" };
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const campaign = await db.mairoCampaign.findFirst({
    // Scoped in the query rather than checked after, so an id from another
    // account reads as missing rather than as forbidden.
    where: { id: mairoCampaignId, organizationId },
    include: { platformCampaigns: true },
  });
  if (!campaign) return { error: "Campaign not found" };
  if (campaign.status === "ARCHIVED") return { deleted: true, name: campaign.name };

  // Stop it everywhere it reached, before anything is written down.
  const failures: string[] = [];
  for (const child of campaign.platformCampaigns) {
    // Never launched, so there is nothing out there to stop.
    if (!child.externalCampaignId) continue;

    const adapter = getAdapter(child.platform);
    if (!adapter) {
      // A campaign on a network MAIRO can no longer talk to is exactly the
      // case that must not be quietly archived.
      failures.push(
        `${platformName(child.platform)}: MAIRO can't reach this network to stop the campaign.`
      );
      continue;
    }

    const paused = await adapter.pauseCampaign({
      organizationId,
      externalCampaignId: child.externalCampaignId,
    });
    if (!paused.ok) failures.push(`${platformName(child.platform)}: ${paused.error.message}`);
  }

  if (failures.length > 0) {
    // Recorded on the row too, so the reason survives the customer navigating
    // away from the message.
    await db.platformCampaign.updateMany({
      where: { mairoCampaignId: campaign.id },
      data: { lastError: failures.join(" ") },
    });
    return {
      error: `MAIRO couldn't stop the ads, so it hasn't deleted the campaign — deleting it now would leave it running and spending with nothing on this screen to show it. ${failures.join(" ")}`,
    };
  }

  await db.platformCampaign.updateMany({
    where: { mairoCampaignId: campaign.id },
    data: { status: "ARCHIVED", lastError: null },
  });
  await db.mairoCampaign.update({
    where: { id: campaign.id },
    data: { status: "ARCHIVED" },
  });

  revalidatePath("/dashboard/campaigns");
  revalidatePath("/dashboard");

  return { deleted: true, name: campaign.name };
}

/**
 * Places matching what somebody typed, so a town becomes something Meta targets.
 *
 * Meta targets by its own id and there are eleven Austins, so the customer
 * picks which one they meant rather than MAIRO guessing — a campaign running
 * around the wrong Austin spends the whole budget before anybody notices.
 */
export async function searchPlacesAction(
  query: string
): Promise<{ ok: true; places: Place[] } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.organizationId) return { ok: false, error: "Not signed in." };
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  return searchPlaces(organizationId, query);
}

/**
 * Changes where an existing campaign sends people.
 *
 * The gap this fills: a campaign created without a destination says so on its
 * card, plainly — "there's no address on it yet" — and until now the only way
 * to act on that was to set the business's default in Settings, which changes
 * every campaign, or to delete this one and build it again, which throws away
 * the review it has already been through.
 *
 * Refused once an ad exists. The ad on Meta carries the link inside its
 * creative, and MAIRO has no path that rewrites a creative in place — so
 * storing a new address here would leave the dashboard showing one destination
 * while the live ad sent people to another. Saying that is better than being
 * quietly wrong about where a customer's money is going.
 */
export async function setCampaignDestinationAction(
  mairoCampaignId: string,
  input: { type: AdDestination; value: string; channel?: MessageChannel }
): Promise<{ error?: string; saved?: boolean }> {
  const session = await auth();
  if (!session?.user?.organizationId) return { error: "Not authenticated" };
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const campaign = await db.mairoCampaign.findFirst({
    // Scoped in the query rather than checked after, so an id from another
    // account reads as missing.
    where: { id: mairoCampaignId, organizationId },
    include: { platformCampaigns: true },
  });
  if (!campaign) return { error: "Campaign not found" };

  if (campaign.platformCampaigns.some((c) => c.externalAdId)) {
    return {
      error:
        "The ad for this campaign is already built, and it carries the old address inside it. Create a new campaign to send people somewhere else.",
    };
  }

  let url: string | null = null;
  let phone: string | null = null;

  if (input.type === "WEBSITE") {
    url = normalizeUrl(input.value);
    if (!url) {
      return { error: "That doesn't look like a web address. Something like yourshop.com/offer." };
    }
  } else if (input.type === "PHONE_CALL") {
    phone = normalizePhone(input.value);
    if (!phone) {
      return {
        error:
          "That doesn't look like a phone number MAIRO can dial. Include the area code — for example (555) 123-4567.",
      };
    }
  } else if (input.type === "LEAD_FORM") {
    // Written now, for the same reason the campaign form writes it now: a form
    // is a public page carrying this business's name, so it is created when
    // somebody actually asks for one.
    const form = await ensureLeadForm(organizationId);
    if (!form) {
      return { error: "MAIRO couldn't write your form just now. Try again in a moment." };
    }
    url = leadFormUrl(form.slug, siteUrl());
  }

  await db.mairoCampaign.update({
    where: { id: campaign.id },
    data: {
      destinationType: input.type,
      destinationUrl: url,
      destinationPhone: phone,
      messageChannel: input.channel ?? "MESSENGER",
      // The old reason is about the address that has just been replaced.
      // Leaving it would have the card still explaining a problem they fixed
      // until the next launch attempt overwrote it.
      platformCampaigns: { updateMany: { where: {}, data: { lastError: null } } },
    },
  });

  revalidatePath("/dashboard/campaigns");
  revalidatePath("/dashboard");
  return { saved: true };
}

/**
 * A person approving one campaign.
 *
 * The only step in this product that a human has to take. Everything else —
 * writing the ads, choosing the audience, building it on the network, moving
 * budget once it runs — MAIRO does by itself; this is the moment money starts
 * being spent, so it is the moment somebody has to say so.
 *
 * It goes through maybeGoLive rather than flipping statuses here, because every
 * safeguard worth having already lives in there: the funding check, the
 * scheduled start floor, the half-built repair, and the per-network failure
 * handling. A second launch path would be a second copy of those, and the copy
 * would be the one that forgot the funding check.
 */
export async function approveCampaignAction(
  mairoCampaignId: string,
): Promise<{ error?: string } | undefined> {
  const session = await auth();
  if (!session?.user?.organizationId) return { error: "Not authenticated" };
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  // An id in a URL is not authorisation.
  const owned = await db.mairoCampaign.findFirst({
    where: { id: mairoCampaignId, organizationId },
    select: { id: true },
  });
  if (!owned) return { error: "Campaign not found." };

  const outcome = await maybeGoLive(organizationId, {
    onlyCampaignId: mairoCampaignId,
    approvedByPerson: true,
  });

  revalidatePath("/dashboard/campaigns");
  revalidatePath(`/dashboard/campaigns/${mairoCampaignId}`);
  revalidatePath("/dashboard");

  if (!outcome.launched) {
    // Not an error in itself — the network may simply still be reviewing it.
    // Returning the reason is the difference between "nothing happened" and
    // "nothing happened, and here is why".
    return {
      error:
        outcome.heldBecause ??
        "Not live yet — the network is still reviewing this campaign. MAIRO switches it on the moment that clears, without you having to come back.",
    };
  }
  return undefined;
}
