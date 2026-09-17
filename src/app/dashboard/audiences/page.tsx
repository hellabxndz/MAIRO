import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { describeAudience, normalizeAudience } from "@/lib/campaigns/audience";
import { GlassPanel, MairoButton } from "@/components/mairo";

// Audiences: who each campaign is actually shown to.
//
// Built from the audience already stored on every campaign rather than from a
// new table, because that is where the real answer lives — the three questions
// in audience.ts are asked at campaign creation and saved there. Inventing a
// separate audience library would have meant either duplicating that or showing
// a list that nothing uses.
//
// Simple View language throughout: "Austin + 10 miles, ages 25-65, everyone"
// rather than a targeting spec. The spec is what gets sent to Meta; this is
// what a business owner recognises as a description of their customers.

export const dynamic = "force-dynamic";

export default async function AudiencesPage() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const campaigns = await db.mairoCampaign.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      geoKey: true,
      geoLabel: true,
      geoRadius: true,
      ageMin: true,
      ageMax: true,
      genders: true,
    },
  });

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-[-0.02em] text-white sm:text-3xl">Audiences</h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Who each campaign is shown to. Mairo sets this from the three questions you answered, and
        you can change it on any campaign that has not launched yet.
      </p>

      {campaigns.length === 0 ? (
        <GlassPanel className="mt-8 p-8 text-center sm:p-12">
          <h2 className="text-lg font-medium text-white">No audiences yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
            An audience is created with your first campaign — Mairo works it out from where your
            customers are and who they are, then shows it here.
          </p>
          <div className="mt-6 flex justify-center">
            <MairoButton href="/dashboard/create">
              Create your first campaign
              <span aria-hidden>→</span>
            </MairoButton>
          </div>
        </GlassPanel>
      ) : (
        <ul className="mt-8 space-y-3">
          {campaigns.map((c) => {
            const audience = normalizeAudience({
              geoKey: c.geoKey,
              geoLabel: c.geoLabel,
              geoRadius: c.geoRadius,
              ageMin: c.ageMin ?? undefined,
              ageMax: c.ageMax ?? undefined,
              genders: c.genders ?? undefined,
            });
            return (
              <li key={c.id}>
                <GlassPanel>
                  <Link
                    href="/dashboard/campaigns"
                    className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-white/[0.03] sm:flex-row sm:items-center sm:gap-5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] text-white">{c.name}</span>
                      <span className="mt-1 block text-[13px] text-muted">
                        {describeAudience(audience)}
                      </span>
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
                      {c.status.toLowerCase()}
                    </span>
                  </Link>
                </GlassPanel>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
