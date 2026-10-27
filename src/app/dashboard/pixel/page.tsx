import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { activeOrganizationId } from "@/lib/active-org";
import { PageHeader } from "@/components/ui";
import { loadPixelSetup } from "@/lib/tracking/pixel-setup";
import { connectHref } from "@/lib/onboarding/problems";
import { safeReturnTo } from "@/lib/meta/return-to";
import { PixelSetup } from "./pixel-setup";

// Choosing which Meta Pixel MAIRO measures with — during setup (after Meta is
// connected and the ad account chosen) and any time later from Settings.

export const maxDuration = 30;

export default async function PixelPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  const { returnTo } = await searchParams;
  const back = safeReturnTo(returnTo);
  const view = await loadPixelSetup(organizationId);
  const self = back ? `/dashboard/pixel?returnTo=${encodeURIComponent(back)}` : "/dashboard/pixel";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Meta Pixel"
        description={
          view.need === "required_for_purchases"
            ? "Needed to measure purchases on your website. You choose which Pixel MAIRO uses."
            : "Optional — lets MAIRO count what people do on your website after clicking an ad."
        }
      />
      <PixelSetup view={view} returnTo={back} reconnectHref={connectHref(self)} />
    </div>
  );
}
