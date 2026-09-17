import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { limitsFor, planFor } from "@/lib/plans";
import { switchClientAction, removeClientAction } from "@/lib/actions/client-actions";
import { AddClientForm } from "./add-client-form";
import { Welcome } from "./welcome";
import { GettingStarted } from "./getting-started";
import { Tour, StartTourLink } from "@/components/tour";
import { FREELANCER_TOUR } from "./tour-steps";
import { hasSeenTour } from "@/lib/actions/tour-actions";
import { PageHeader, Badge, EmptyState, primaryButtonClass } from "@/components/ui";
import { MairoCard } from "@/components/mairo";

// A freelancer's home: every business they run ads for, in one list.
//
// This is the only screen in the app that lives above an organization rather
// than inside one. Everything else — campaigns, creatives, the plan, the Meta
// connection — belongs to a single client, and you reach it by choosing one
// from here.
//
// The header this page used to draw is gone; the shell in layout.tsx owns the
// wordmark, the workspace name, the plan and the navigation now. What is left
// here is the list itself.

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ subscribed?: string }>;
}) {
  const justSubscribed = (await searchParams).subscribed === "1";
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  // A business owner has no clients and no use for this page.
  if (session.user.role !== "FREELANCER") redirect("/dashboard");

  const workspaceId = session.user.organizationId;
  const seenTour = await hasSeenTour();

  const [workspace, clients] = await Promise.all([
    db.organization.findUnique({
      where: { id: workspaceId },
      select: { name: true, subscriptionTier: true },
    }),
    db.organization.findMany({
      where: { parentId: workspaceId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        industry: true,
        _count: { select: { campaigns: true, monthlyPlans: true } },
        metaAdAccount: { select: { status: true } },
        intake: { select: { id: true } },
      },
    }),
  ]);
  if (!workspace) redirect("/sign-in");

  const plan = planFor(workspace.subscriptionTier);
  // Read off the clients we already loaded, so the guide costs no extra query.
  const guide = {
    hasClient: clients.length > 0,
    hasSetup: clients.some((c) => c.intake),
    hasMeta: clients.some((c) => c.metaAdAccount?.status === "CONNECTED"),
    hasPlan: clients.some((c) => c._count.monthlyPlans > 0),
    hasCampaign: clients.some((c) => c._count.campaigns > 0),
  };
  const allowed = limitsFor(workspace.subscriptionTier).clients ?? 0;
  const room = Math.max(allowed - clients.length, 0);

  return (
    <>
      {justSubscribed && <Welcome planName={plan.name} clientLimit={allowed} />}
      {/* Offers itself once, right after paying. Available on demand after that. */}
      <Tour steps={FREELANCER_TOUR} autoStart={justSubscribed} alreadySeen={seenTour} />

      <PageHeader
        title="Your clients"
        description="Each business here has its own ad account, its own campaigns and its own creatives. Open one to work inside it."
        action={<StartTourLink className="text-[13px] text-muted transition-colors hover:text-white" />}
      />

      <div data-tour="list" className="space-y-3">
        {clients.length === 0 && (
          <EmptyState
            title="No clients yet"
            description="Add the first business you run ads for. A name is enough to start."
          />
        )}

        {clients.map((client) => {
          const connected = client.metaAdAccount?.status === "CONNECTED";
          return (
            <MairoCard key={client.id} className="p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <p className="truncate text-[15px] font-medium text-white">{client.name}</p>
                    {/* Meta state carries the vocabulary the rest of the product
                        uses: green is live, yellow is waiting on somebody. */}
                    <Badge tone={connected ? "green" : "yellow"}>
                      {connected ? "Meta connected" : "Meta not connected"}
                    </Badge>
                    {!client.intake && <Badge tone="neutral">Setup unfinished</Badge>}
                  </div>
                  <p className="mt-1.5 text-[13px] text-muted">
                    {client.industry ? `${client.industry} · ` : ""}
                    {client._count.campaigns} campaign
                    {client._count.campaigns === 1 ? "" : "s"}
                  </p>
                </div>

                {/* Stacks under the name on a phone rather than being squeezed
                    beside it, which is where two buttons used to wrap to three
                    lines each. */}
                <div data-tour="open" className="flex w-full items-center gap-2 sm:w-auto">
                  <form action={switchClientAction.bind(null, client.id)} className="flex-1 sm:flex-none">
                    <button type="submit" className={`w-full ${primaryButtonClass}`}>
                      Open
                    </button>
                  </form>
                  <form action={removeClientAction.bind(null, client.id)} className="flex-1 sm:flex-none">
                    <button
                      type="submit"
                      className="w-full rounded-full border border-[color:var(--mairo-line)] px-5 py-2.5 text-sm text-muted transition-colors hover:border-alert/40 hover:text-alert"
                    >
                      Remove
                    </button>
                  </form>
                </div>
              </div>
            </MairoCard>
          );
        })}
      </div>

      <AddClientForm room={room} allowed={allowed} />

      <GettingStarted state={guide} />
    </>
  );
}
