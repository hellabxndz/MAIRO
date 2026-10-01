import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";

// "Learn more" for a Meta capability MAIRO recommends. Plain words: what it
// is, what it's for, that MAIRO tested it, and that the owner stays in
// control. No Ads Manager vocabulary required.

export default async function MetaCapabilityPage({ params }: PageProps<"/dashboard/meta-capabilities/[key]">) {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  const { key } = await params;
  const featureKey = decodeURIComponent(key);
  const [f, optIn] = await Promise.all([
    db.platformFeature.findUnique({ where: { platform_featureKey: { platform: "META", featureKey } } }),
    db.platformFeatureOptIn.findUnique({ where: { platform_organizationId_featureKey: { platform: "META", organizationId, featureKey } } }),
  ]);
  // Only capabilities MAIRO validated are explained to customers.
  if (!f || !["SUPPORTED", "PARTIALLY_SUPPORTED"].includes(f.mairoSupport)) notFound();
  return (
    <div className="mx-auto max-w-[720px]">
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-violet-bright">A new Meta capability</p>
      <h1 className="mt-1 text-[clamp(24px,3vw,30px)] font-semibold text-white">{f.name}</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-white/85">{f.description}</p>
      <ul className="mt-5 space-y-2 text-[14px] text-white/85">
        <li>• MAIRO tested it before suggesting it{f.lastVerifiedAt ? ` (last checked ${f.lastVerifiedAt.toLocaleDateString("en-US", { month: "long", day: "numeric" })})` : ""}.</li>
        <li>• It&rsquo;s only suggested when it can serve your current goal — not because it&rsquo;s new.</li>
        <li>• If you say yes, MAIRO may use it in your <strong>next</strong> campaign. Campaigns already running don&rsquo;t change.</li>
        <li>• MAIRO compares your results with and without it, and stops using it if it doesn&rsquo;t help you.</li>
      </ul>
      <p className="mt-5 text-[13px] text-muted">
        {optIn?.status === "APPROVED" ? "You approved it. MAIRO will consider it when it plans your next campaign." : "Approve or choose “Not now” from the recommendation on your Decisions page."}
      </p>
      <Link href="/dashboard/decisions" className="mt-4 inline-block text-[13px] text-violet-bright underline underline-offset-4">Back to MAIRO&rsquo;s recommendations</Link>
    </div>
  );
}
