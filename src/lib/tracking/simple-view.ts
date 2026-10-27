import { db } from "@/lib/db";
import { connectionSummaries } from "@/lib/ad-platforms/connections";
import { siteUrl } from "@/lib/site";
import { nicheById } from "@/lib/tracking/niches";
import { ensureTrackingProfile } from "@/lib/tracking/profile";
import { trackingOverview, type TrackingOverview } from "@/lib/tracking/setup";
import { PASTE_STEPS, pasteGuideFor, tagSnippet } from "@/lib/tracking/smart-tag";
import type { CheckStatus } from "@/lib/tracking/state";

// The three-step pixel setup (app/dashboard/tracking/simple-pixel.tsx), as
// data: shown on the Tracking page, and as a guide on the dashboard home until
// tracking works.

export type SimplePixelView = {
  connected: boolean;
  pixel: { id: string; name: string } | null;
  snippet: string | null;
  guides: { id: string; label: string; steps: string[] }[];
  suggestedGuide: string;
  /** What the tag counts for this kind of business, in the owner's words. */
  counts: { label: string; event: string }[];
  nicheLabel: string;
  install: { status: CheckStatus; detail: string | null } | null;
  primaryEvent: { name: string; status: CheckStatus | null; detail: string | null } | null;
};

/** Pure: the view from what the Tracking page has already read. */
export function simplePixelView(input: { connected: boolean; overview: TrackingOverview; nicheId: string; tagId: string | null; appUrl: string }): SimplePixelView {
  const { overview } = input;
  const niche = nicheById(input.nicheId);
  const primaryEvent = overview.requiredEvent;
  return {
    connected: input.connected,
    pixel: overview.pixel ? { id: overview.pixel.id, name: overview.pixel.name } : null,
    snippet: input.tagId ? tagSnippet(input.appUrl, input.tagId) : null,
    guides: PASTE_STEPS.map(({ id, label, steps }) => ({ id, label, steps })),
    suggestedGuide: pasteGuideFor(overview.detectedPlatform),
    counts: niche.actions.map((a) => ({ label: a.label, event: a.metaEvent })),
    nicheLabel: niche.label,
    install: overview.install ? { status: overview.install.status, detail: overview.install.detail } : null,
    primaryEvent: primaryEvent
      ? { name: primaryEvent, status: overview.events[primaryEvent]?.status ?? null, detail: overview.events[primaryEvent]?.detail ?? null }
      : null,
  };
}

/** For the dashboard: the view, and whether tracking is already working (then there's no guide to show). */
export async function loadSimplePixel(organizationId: string): Promise<{ view: SimplePixelView; verified: boolean; stepsDone: number }> {
  const [overview, connections, profile, tagRow] = await Promise.all([
    trackingOverview(organizationId),
    connectionSummaries(organizationId),
    ensureTrackingProfile(organizationId),
    db.trackingPixel.findUnique({ where: { organizationId_platform: { organizationId, platform: "META" } }, select: { id: true } }),
  ]);
  const view = simplePixelView({ connected: connections.get("META")?.connected ?? false, overview, nicheId: profile.nicheId, tagId: tagRow?.id ?? null, appUrl: siteUrl() });
  const stepsDone = [Boolean(view.pixel), view.install?.status === "VERIFIED", view.primaryEvent?.status === "VERIFIED"].filter(Boolean).length;
  return { view, verified: overview.stage.stage === "verified", stepsDone };
}
