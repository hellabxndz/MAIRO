import type { AdPlatform } from "@/generated/prisma/enums";
import type { AdPlatformAdapter } from "./types";
import { metaAdapter } from "./meta/adapter";
import { executionBlock } from "@/lib/billing/execution";

// The list of networks MAIRO knows about, and how to reach each one.
//
// This is the seam the whole multi-platform design turns on. Adding Google
// Ads is: a value in the AdPlatform enum, a folder implementing
// AdPlatformAdapter, and an entry in this file. Nothing else in the
// application mentions a platform by name — the campaign form renders from
// `selectablePlatforms()`, the dashboard groups by whatever platforms a
// campaign has, and the optimizer compares whatever it is given.
//
// `implemented` is separate from the enum on purpose. A platform can exist in
// the database, be referenced by old rows, and still not be offerable — which
// is what a half-built adapter needs, and what a network MAIRO drops support
// for needs too.

export type PlatformMeta = {
  platform: AdPlatform;
  /** What the customer sees. */
  name: string;
  /** The networks it actually places ads on, in the customer's words. */
  surfaces: string;
  /** Brand colour, for the icon and accents. */
  accent: string;
  /** False while the adapter is unfinished — hidden from the campaign form. */
  implemented: boolean;
  /**
   * Whether this deployment has the credentials to talk to it. Distinct from
   * `implemented`: the code is ready, the environment may not be.
   */
  configured: () => boolean;
  /** Where the customer goes to connect it. */
  connectPath: string;
};

export const PLATFORMS: Record<AdPlatform, PlatformMeta> = {
  META: {
    platform: "META",
    name: "Meta",
    surfaces: "Facebook + Instagram",
    accent: "#0866FF",
    implemented: true,
    configured: () =>
      Boolean(process.env.META_APP_ID?.trim() && process.env.META_APP_SECRET?.trim()),
    connectPath: "/api/meta/connect",
  },
  // Retired: MAIRO runs Meta only. The value stays in the enum so campaigns
  // and connections created while TikTok was offered still load, and render
  // as unavailable rather than breaking the page.
  TIKTOK: {
    platform: "TIKTOK",
    name: "TikTok",
    surfaces: "TikTok",
    accent: "#25F4EE",
    implemented: false,
    configured: () => false,
    connectPath: "",
  },
  GOOGLE: {
    platform: "GOOGLE",
    name: "Google",
    surfaces: "Search + YouTube",
    accent: "#4285F4",
    implemented: false,
    configured: () => false,
    connectPath: "",
  },
  SNAPCHAT: {
    platform: "SNAPCHAT",
    name: "Snapchat",
    surfaces: "Snapchat",
    accent: "#FFFC00",
    implemented: false,
    configured: () => false,
    connectPath: "",
  },
  PINTEREST: {
    platform: "PINTEREST",
    name: "Pinterest",
    surfaces: "Pinterest",
    accent: "#E60023",
    implemented: false,
    configured: () => false,
    connectPath: "",
  },
  LINKEDIN: {
    platform: "LINKEDIN",
    name: "LinkedIn",
    surfaces: "LinkedIn",
    accent: "#0A66C2",
    implemented: false,
    configured: () => false,
    connectPath: "",
  },
};

const ADAPTERS: Partial<Record<AdPlatform, AdPlatformAdapter>> = {
  META: metaAdapter,
};

/**
 * The adapter for a network, or null if MAIRO can't run that one yet.
 *
 * Returns null rather than throwing: a campaign row can reference a platform
 * whose adapter has been removed, and the dashboard should render it as
 * unavailable rather than crash.
 */
/**
 * The writes that build, change or switch on real advertising. Each is
 * refused unless the account may use paid execution (see billing/execution).
 * Pausing, reading and connecting are never gated.
 */
const PAID_WRITES = ["createCampaign", "createAdGroup", "createAd", "updateSchedule", "updateBudget", "resumeCampaign", "updateAdGroupTargeting"] as const;

function guarded(adapter: AdPlatformAdapter): AdPlatformAdapter {
  return new Proxy(adapter, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function" || !(PAID_WRITES as readonly (string | symbol)[]).includes(prop)) return value;
      return async (input: { organizationId?: string }) => {
        const block = input?.organizationId ? await executionBlock(input.organizationId) : "Missing account.";
        if (block) return { ok: false, error: { kind: "rejected", message: block } };
        return (value as (i: unknown) => unknown).call(target, input);
      };
    },
  });
}

const GUARDED: Partial<Record<AdPlatform, AdPlatformAdapter>> = Object.fromEntries(
  Object.entries(ADAPTERS).map(([k, a]) => [k, a ? guarded(a) : a]),
);

export function getAdapter(platform: AdPlatform): AdPlatformAdapter | null {
  return GUARDED[platform] ?? null;
}

/** Every network a customer can actually pick today. */
export function selectablePlatforms(): PlatformMeta[] {
  return Object.values(PLATFORMS).filter((p) => p.implemented);
}

/** Every network at all, including the ones still to come. */
export function allPlatforms(): PlatformMeta[] {
  return Object.values(PLATFORMS);
}

export function platformMeta(platform: AdPlatform): PlatformMeta {
  return PLATFORMS[platform];
}

export function platformName(platform: AdPlatform): string {
  return PLATFORMS[platform]?.name ?? platform;
}
