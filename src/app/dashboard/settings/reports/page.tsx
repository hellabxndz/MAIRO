import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrg } from "@/lib/active-org";
import { smsConfigured } from "@/lib/sms/send";
import { ReportSettings } from "@/components/reports/report-settings";

// Settings › Reports: when the Weekly Report arrives, how, and — for an
// agency workspace — how client reports are branded and shared.

export const metadata = { title: "Report settings — MAIRO" };

export default async function ReportSettingsPage() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const active = await activeOrg();
  const organizationId = active?.id ?? session.user.organizationId;

  const [s, sms] = await Promise.all([
    db.reportSettings.findUnique({ where: { organizationId } }),
    db.smsPreference.findUnique({ where: { organizationId } }),
  ]);
  const textAvailable = Boolean(sms?.verifiedAt && sms.consentAt && !sms.optedOutAt);

  return (
    <div className="mx-auto max-w-[760px]">
      <Link href="/dashboard/settings" className="text-[13px] text-muted hover:text-white">
        ← Settings
      </Link>
      <h1 className="mt-3 text-[clamp(24px,3vw,30px)] font-semibold tracking-[-0.02em] text-white">Reports</h1>
      <p className="mt-1 mb-6 text-[14.5px] text-muted">Your Mairo Weekly Report: a two-minute read on what happened, what Mairo did, and what&rsquo;s next.</p>
      <ReportSettings
        values={{
          weeklyEnabled: s?.weeklyEnabled ?? true,
          deliveryDay: s?.deliveryDay ?? 1,
          preferredMode: s?.preferredMode ?? "simple",
          inApp: s?.inApp ?? true,
          onlyWhenActive: s?.onlyWhenActive ?? true,
          brandName: s?.brandName ?? null,
          brandLogoUrl: s?.brandLogoUrl ?? null,
          hideInternal: s?.hideInternal ?? true,
          autoApprove: s?.autoApprove ?? false,
        }}
        text={smsConfigured() ? { available: textAvailable, on: textAvailable && Boolean(sms?.onWeeklySummary) } : null}
        agency={session.user.role === "FREELANCER" && !active?.actingAsClient}
      />
    </div>
  );
}
