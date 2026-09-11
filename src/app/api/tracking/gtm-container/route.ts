import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { buildContainer } from "@/lib/tracking/gtm";
import { nicheById } from "@/lib/tracking/niches";
import { ensureTrackingProfile } from "@/lib/actions/tracking-actions";

// Hands over the Tag Manager container as a file.
//
// A route rather than a server action because the result is a download, and a
// server action cannot produce one — the browser needs a response with a
// Content-Disposition on it. Generated per request rather than stored, so the
// file always carries whatever pixel ids and niche the account has right now
// instead of whatever they had the day somebody first pressed the button.

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const [organization, profile, pixels] = await Promise.all([
    db.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    }),
    ensureTrackingProfile(organizationId),
    db.trackingPixel.findMany({ where: { organizationId } }),
  ]);

  const meta = pixels.find((p) => p.platform === "META")?.externalPixelId ?? null;
  const tiktok = pixels.find((p) => p.platform === "TIKTOK")?.externalPixelId ?? null;

  // A container with no pixel in it would import cleanly and measure nothing,
  // which is the worst outcome available: it looks done.
  if (!meta && !tiktok) {
    return NextResponse.json(
      { error: "Set up a pixel first — there is nothing for the container to fire." },
      { status: 400 }
    );
  }

  const niche = nicheById(profile.nicheId);
  const container = buildContainer({
    businessName: organization?.name ?? "Your business",
    niche,
    metaPixelId: meta,
    tiktokPixelId: tiktok,
  });

  await db.trackingProfile
    .update({ where: { organizationId }, data: { containerBuiltAt: new Date() } })
    .catch(() => undefined);

  const safeName = (organization?.name ?? "mairo")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

  return new NextResponse(JSON.stringify(container, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="mairo-gtm-${safeName || "container"}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
