import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader, Badge, primaryButtonClass, secondaryButtonClass } from "@/components/ui";
import { disconnectMetaAction, exploreWithoutMetaAction } from "@/lib/actions/meta-actions";

export default async function MetaConnectionPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string; required?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");

  const { error, connected, required } = await searchParams;

  const metaAccount = await db.metaAdAccount.findUnique({
    where: { organizationId: session.user.organizationId },
  });

  return (
    <div>
      <PageHeader
        title="Meta connection"
        description="Connect your Facebook/Instagram ad account so MAIRO can launch and manage campaigns for you."
      />

      {required && !metaAccount && (
        <Card className="mb-6 border-amber-500/30 bg-amber-500/[0.06]">
          <p className="text-sm text-amber-300">
            One last step — connect your Meta ad account to unlock the rest of your dashboard.
            We can&apos;t plan or launch campaigns without it.
          </p>
        </Card>
      )}

      {error && (
        <Card className="mb-6 border-red-500/30 bg-red-500/[0.06]">
          <p className="text-sm text-red-300">{decodeURIComponent(error)}</p>
        </Card>
      )}
      {connected && (
        <Card className="mb-6 border-emerald-500/30 bg-emerald-500/[0.06]">
          <p className="text-sm text-emerald-300">Meta account connected successfully.</p>
        </Card>
      )}

      <Card>
        {metaAccount ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Badge tone={metaAccount.status === "CONNECTED" ? "green" : "red"}>
                {metaAccount.status}
              </Badge>
              <span className="text-sm text-neutral-400">
                Ad account {metaAccount.metaAdAccountId}
              </span>
            </div>
            <p className="text-sm text-neutral-500">
              Connected {metaAccount.connectedAt.toLocaleDateString()}
            </p>
            <div className="flex flex-wrap gap-3">
              {required && (
                <Link href="/dashboard" className={primaryButtonClass}>
                  Continue to your dashboard →
                </Link>
              )}
              <form action={disconnectMetaAction}>
                <button type="submit" className={secondaryButtonClass}>
                  Disconnect
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-neutral-400">
              You&apos;ll be redirected to Facebook to log in and grant MAIRO access to your
              ad account.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <a href="/api/meta/connect" className={primaryButtonClass}>
                Connect Meta account
              </a>
              <form action={exploreWithoutMetaAction}>
                <button
                  type="submit"
                  className="text-sm text-neutral-400 underline underline-offset-4 transition hover:text-white"
                >
                  Look around first
                </button>
              </form>
            </div>
            <p className="text-xs leading-relaxed text-neutral-600">
              You can explore the dashboard, build a plan, and talk to the AI
              specialists without connecting. Nothing goes live until you do.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
