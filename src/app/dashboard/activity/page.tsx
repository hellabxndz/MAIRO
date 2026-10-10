import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { activeOrganizationId } from "@/lib/active-org";
import { PageHeader } from "@/components/ui";
import { activityTimeline } from "@/lib/activity/log";
import { ActivityTimeline } from "@/components/decisions/activity-timeline";
import { effectiveLevel } from "@/lib/decisions/store";
import { levelInfo } from "@/lib/automation/levels";

// MAIRO Activity: what MAIRO did with this account's advertising, and why.
// Every entry is a change a network accepted, or a Spend Protection warning
// that was really sent.

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  const [entries, level] = await Promise.all([activityTimeline(organizationId, 80), effectiveLevel(organizationId)]);

  return (
    <div>
      <PageHeader
        title="MAIRO Activity"
        description="Every change MAIRO has made to your advertising, with the reason. Changes you approved and changes MAIRO made on its own inside your limits are both here."
      />
      <p className="mb-8 text-[13px] text-muted">
        Mode: <span className="text-white">{levelInfo(level).label}</span> — {levelInfo(level).summary}{" "}
        <Link href="/dashboard/settings#automation" className="text-blue-bright hover:text-white">
          Change
        </Link>
      </p>
      <ActivityTimeline entries={entries} />
    </div>
  );
}
