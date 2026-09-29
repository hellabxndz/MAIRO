import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { activeOrganizationId } from "@/lib/active-org";
import { PageHeader } from "@/components/ui";
import { loadBrain } from "@/lib/business/brain";
import { BusinessBrain } from "@/components/business/brain-editor";

// Settings > Business Brain.

export const dynamic = "force-dynamic";

export default async function BusinessBrainPage() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  const brain = await loadBrain(organizationId);

  return (
    <div>
      <Link href="/dashboard/settings" className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-white">
        <span aria-hidden>←</span> Settings
      </Link>
      <PageHeader
        title="Business Brain"
        description="Everything Mairo remembers about your business. Every campaign, ad and recommendation starts from this, so you only answer once. Change anything — what you type here always wins over what Mairo read from your website."
        action={
          <Link href="/dashboard/business" className="rounded-full border px-4 py-2 text-[12.5px] text-white/85 hover:text-white" style={{ borderColor: "var(--mairo-line)" }}>
            Analyze my website
          </Link>
        }
      />
      <BusinessBrain profile={brain.profile} edited={brain.editedFields} />
    </div>
  );
}
