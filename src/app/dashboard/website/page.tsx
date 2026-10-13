import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { PageHeader } from "@/components/ui";
import { findingDecisions, latestOrgScan } from "@/lib/website/store";
import { WebsiteReportPanel } from "./report-panel";

// "Before you spend on ads": the latest reading of the business's own website,
// the owner's decisions on each finding, and rechecks that confirm a fix.
// Built by the same scanner as onboarding and the free tools.

export const maxDuration = 60;

export default async function WebsitePage() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  const [org, scan, decisions] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { website: true } }),
    latestOrgScan(organizationId),
    findingDecisions(organizationId),
  ]);
  const gone = [...decisions.values()].filter((d) => d.goneAt).sort((a, b) => b.goneAt!.getTime() - a.goneAt!.getTime()).slice(0, 6);
  return (
    <div>
      <PageHeader title="Before you spend on ads" description="What a visitor from your ads would find on your website — the three changes that matter most first, with the evidence for each." />
      {!org?.website ? (
        <div className="rounded-2xl border border-white/10 p-6">
          <p className="text-[15px] text-white">MAIRO doesn&rsquo;t have your website yet.</p>
          <p className="mt-1 text-[13.5px] text-muted">Add it in your Business Brain and come back — or skip this if you advertise with Meta lead forms or calls only.</p>
          <Link href="/dashboard/settings/business-brain" className="mt-3 inline-block text-[13.5px] text-violet-bright underline underline-offset-4">Add your website</Link>
        </div>
      ) : (
        <WebsiteReportPanel
          website={org.website}
          scan={scan ? { result: scan.result, at: scan.createdAt.toISOString() } : null}
          decisions={Object.fromEntries([...decisions.entries()].map(([k, d]) => [k, { status: d.status, resolvedAt: d.resolvedAt?.toISOString() ?? null, goneAt: d.goneAt?.toISOString() ?? null }]))}
          gone={gone.map((g) => ({ key: g.key, at: g.goneAt!.toISOString() }))}
        />
      )}
    </div>
  );
}
