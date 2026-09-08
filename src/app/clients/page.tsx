import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { limitsFor, planFor } from "@/lib/plans";
import { signOutAction } from "@/lib/actions/auth-actions";
import { switchClientAction, removeClientAction } from "@/lib/actions/client-actions";
import { AddClientForm } from "./add-client-form";
import { AmbientSky } from "@/components/ambient-sky";
import { Welcome } from "./welcome";
import { GettingStarted } from "./getting-started";

// A freelancer's home: every business they run ads for, in one list.
//
// This is the only screen in the app that lives above an organization rather
// than inside one. Everything else — campaigns, creatives, the plan, the Meta
// connection — belongs to a single client, and you reach it by choosing one
// from here.

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
    <div className="relative min-h-screen text-white">
      <AmbientSky />
      {justSubscribed && (
        <Welcome planName={plan.name} clientLimit={limitsFor(workspace.subscriptionTier).clients ?? 0} />
      )}
      <header className="border-b border-white/[0.07] bg-black/20 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <div>
            <p className="text-sm font-light tracking-[0.28em]">MAIRO</p>
            <p className="mt-1 text-xs uppercase tracking-[0.14em] text-neutral-500">
              {workspace.name}
            </p>
          </div>
          <div className="flex items-center gap-5 text-xs text-neutral-400">
            <span>
              {plan.name} · {clients.length}/{allowed} clients
            </span>
            {/* The workspace's own billing, not a client's. A freelancer has no
                dashboard of their own to put this on — /dashboard is always
                some client's dashboard. */}
            <Link href="/clients/guide" className="hover:text-white">
              Guide
            </Link>
            <Link href="/clients/billing" className="hover:text-white">
              Billing
            </Link>
            <form action={signOutAction}>
              <button type="submit" className="hover:text-white">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="font-light tracking-[-0.02em]" style={{ fontSize: "clamp(32px, 4.4vw, 52px)" }}>
          Your clients
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-neutral-400">
          Each business here has its own ad account, its own campaigns and its own
          creatives. Open one to work inside it.
        </p>

        <div className="mt-10 space-y-3">
          {clients.length === 0 && (
            <p className="rounded-xl border border-white/10 bg-white/[0.02] px-5 py-8 text-center text-sm text-neutral-500">
              No clients yet. Add the first business you run ads for.
            </p>
          )}

          {clients.map((client) => {
            const connected = client.metaAdAccount?.status === "CONNECTED";
            return (
              <div
                key={client.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.025] px-5 py-4 transition hover:border-white/20"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{client.name}</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {client.industry ? `${client.industry} · ` : ""}
                    {client._count.campaigns} campaign
                    {client._count.campaigns === 1 ? "" : "s"} ·{" "}
                    <span className={connected ? "text-emerald-400/90" : "text-amber-400/90"}>
                      {connected ? "Meta connected" : "Meta not connected"}
                    </span>
                    {!client.intake && " · setup unfinished"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <form action={switchClientAction.bind(null, client.id)}>
                    <button
                      type="submit"
                      className="rounded-full bg-white px-4 py-2 text-xs font-medium text-black transition hover:bg-neutral-200"
                    >
                      Open
                    </button>
                  </form>
                  <form action={removeClientAction.bind(null, client.id)}>
                    <button
                      type="submit"
                      className="rounded-full border border-white/15 px-4 py-2 text-xs text-neutral-400 transition hover:border-red-500/40 hover:text-red-300"
                    >
                      Remove
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>

        <AddClientForm room={room} allowed={allowed} />

        <GettingStarted state={guide} />
      </main>
    </div>
  );
}
