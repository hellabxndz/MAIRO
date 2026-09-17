import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { showsEnquiries } from "@/lib/leads/fields";
import { GlassPanel } from "@/components/mairo";

// Account: everywhere the new navigation does not go.
//
// The old sidebar listed eleven destinations and a phone had to open all of
// them in a full-screen drawer. Five of those are now the bottom bar; the rest
// live here, and none of them were deleted — "Your social posts", "Measuring
// sales", "How it works" and the Meta-specific connection screen are all still
// exactly where they were, on the same routes, doing the same job.
//
// Grouped by what someone is trying to do rather than by which part of the
// system owns the page, because "measuring sales" and "where you advertise"
// are the same errand and used to be three items apart.

export const dynamic = "force-dynamic";

type Entry = { href: string; label: string; hint: string };

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const [organization, leadForm] = await Promise.all([
    db.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, subscriptionTier: true },
    }),
    db.leadForm.findFirst({ where: { organizationId }, select: { id: true } }),
  ]);

  const groups: { title: string; entries: Entry[] }[] = [
    {
      title: "Your advertising",
      entries: [
        { href: "/dashboard/analytics", label: "Analytics", hint: "Performance, and how sales are measured" },
        { href: "/dashboard/audiences", label: "Audiences", hint: "Who your ads are shown to" },
        { href: "/dashboard/creatives", label: "Creatives", hint: "Every ad Mairo has made for you" },
        { href: "/dashboard/social", label: "Your social posts", hint: "The unpaid half of your feed" },
        ...(showsEnquiries({ hasForm: Boolean(leadForm) })
          ? [{ href: "/dashboard/leads", label: "Enquiries", hint: "People who asked you to get in touch" }]
          : []),
      ],
    },
    {
      title: "Connections and tracking",
      entries: [
        { href: "/dashboard/integrations", label: "Integrations", hint: "Where you advertise" },
        { href: "/dashboard/meta", label: "Meta connection", hint: "Your Page, ad account and permissions" },
        { href: "/dashboard/tracking", label: "Measuring sales", hint: "Pixel and conversion tracking" },
      ],
    },
    {
      title: "Account",
      entries: [
        { href: "/dashboard/plan", label: "Billing", hint: "Your Mairo subscription and invoices" },
        { href: "/dashboard/settings", label: "Settings", hint: "Business details and brand" },
        { href: "/dashboard/guide", label: "How it works", hint: "What Mairo does, and when" },
      ],
    },
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-[-0.02em] text-white sm:text-3xl">Account</h1>
      <p className="mt-2 text-sm text-muted">
        {organization?.name ?? "Your business"} · {organization?.subscriptionTier ?? "No plan"}
      </p>

      <div className="mt-8 space-y-8">
        {groups.map((group) => (
          <section key={group.title}>
            <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.24em] text-faint">
              {group.title}
            </h2>
            <GlassPanel>
              <ul>
                {group.entries.map((entry, i) => (
                  <li
                    key={entry.href}
                    className={i > 0 ? "border-t" : undefined}
                    style={i > 0 ? { borderColor: "var(--mairo-line)" } : undefined}
                  >
                    <Link
                      href={entry.href}
                      className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-white/[0.03]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] text-white">{entry.label}</span>
                        <span className="block text-[12px] text-faint">{entry.hint}</span>
                      </span>
                      <span aria-hidden className="text-faint">
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </GlassPanel>
          </section>
        ))}
      </div>
    </div>
  );
}
