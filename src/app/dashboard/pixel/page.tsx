import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { activeOrganizationId } from "@/lib/active-org";
import { PageHeader } from "@/components/ui";
import { loadMeasurementSetup } from "@/lib/tracking/measurement-store";
import { connectHref } from "@/lib/onboarding/problems";
import { safeReturnTo } from "@/lib/meta/return-to";
import { MeasurementSetup } from "./measurement-setup";

// Website tracking, guided: what to measure, which Meta Pixel, how it goes on
// the website, and whether Meta is receiving each event. The same page during
// setup (with returnTo) and from Settings → Tracking. Progress is the
// business's records, so a refresh, a trip through Meta's login or coming back
// next week lands on the same step.

export const maxDuration = 30;

export default async function PixelPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  const { returnTo } = await searchParams;
  const back = safeReturnTo(returnTo);
  const view = await loadMeasurementSetup(organizationId);
  const self = back ? `/dashboard/pixel?returnTo=${encodeURIComponent(back)}` : "/dashboard/pixel";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Website tracking" description="Choose what matters to your business. MAIRO helps you connect and verify Meta tracking." />
      <MeasurementSetup view={view} returnTo={back} reconnectHref={connectHref(self)} />
    </div>
  );
}
