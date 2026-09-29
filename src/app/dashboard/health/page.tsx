import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { activeOrganizationId } from "@/lib/active-org";
import { viewMode } from "@/lib/view-mode";
import { refreshDecisions } from "@/lib/decisions/run";
import { loadIntelligence } from "@/lib/intelligence/run";
import type { HealthAreaKey } from "@/lib/intelligence/types";
import { BusinessHealthScore } from "@/components/intelligence/business-health";
import { EarlyWarningCard } from "@/components/intelligence/early-warnings";

// The full Business Health report: the score, every area opened up, and each
// open finding under the area it affects — the same Insights the dashboard
// shows, all of them.

const AREA_CATEGORIES: Record<HealthAreaKey, string[]> = {
  advertising: ["PERFORMANCE", "TRACKING"],
  creative: ["CREATIVE"],
  website: ["WEBSITE"],
  audience: ["AUDIENCE"],
  budget: ["BUDGET", "PLATFORM"],
};

export default async function HealthReportPage() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  await refreshDecisions(organizationId).catch((error) => console.error("Decisions refresh failed:", error));
  const [{ report, insights }, mode] = await Promise.all([loadIntelligence(organizationId), viewMode()]);
  const health = report?.health ?? null;
  const weakest = health?.areas.filter((a) => a.score !== null).sort((a, b) => a.score! - b.score!)[0]?.key ?? null;

  return (
    <div className="mx-auto max-w-[1200px]">
      <Link href="/dashboard" className="text-[13px] text-muted hover:text-white">
        ← Dashboard
      </Link>
      <h1 className="mt-3 text-[clamp(24px,3vw,32px)] font-semibold tracking-[-0.02em] text-white">Business health report</h1>
      <p className="mt-1.5 max-w-2xl text-[14.5px] text-muted">
        How healthy your advertising looks, area by area — and exactly what&rsquo;s behind each score.
        {report ? ` Last checked ${new Date(report.computedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.` : ""}
      </p>
      <div className="mt-6">
        <BusinessHealthScore health={health} showReportLink={false} defaultOpen={weakest} />
      </div>
      {health?.areas.map((area) => {
        const found = insights.filter((i) => AREA_CATEGORIES[area.key].includes(i.category));
        if (found.length === 0) return null;
        return (
          <section key={area.key} className="mt-8">
            <h2 className="text-[17px] font-semibold text-white">
              {area.label} <span className="text-[14px] font-normal text-faint">· {found.length} finding{found.length === 1 ? "" : "s"}</span>
            </h2>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {found.map((i) => (
                <EarlyWarningCard key={i.id} insight={i} advanced={mode === "advanced"} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
