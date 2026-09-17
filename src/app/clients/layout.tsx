import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { limitsFor, planFor } from "@/lib/plans";
import { signOutAction } from "@/lib/actions/auth-actions";
import { WorkspaceShell } from "@/components/mairo/workspace-shell";

// The shell for the freelancer workspace.
//
// These three screens used to draw a header each, which is why /clients/billing
// could only be left by a "Back to clients" link and why the plan and the
// client count were repeated in two places with two different formats.
//
// The role check deliberately stays on the pages rather than moving up here.
// They redirect to different places — the clients list sends a business owner
// to /dashboard, billing sends them to /dashboard/settings, which is the screen
// they actually wanted — and collapsing that into one redirect in the layout
// would quietly drop somebody on the wrong screen.

export default async function ClientsLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");

  const workspaceId = session.user.organizationId;
  const [workspace, clientCount] = await Promise.all([
    db.organization.findUnique({
      where: { id: workspaceId },
      select: { name: true, subscriptionTier: true },
    }),
    db.organization.count({ where: { parentId: workspaceId } }),
  ]);
  if (!workspace) redirect("/sign-in");

  return (
    <WorkspaceShell
      workspaceName={workspace.name}
      planName={planFor(workspace.subscriptionTier).name}
      clientCount={clientCount}
      clientLimit={limitsFor(workspace.subscriptionTier).clients ?? null}
      footer={
        <form action={signOutAction}>
          <button
            type="submit"
            className="w-full rounded-xl px-3 py-2.5 text-left text-[13px] text-muted transition-colors hover:bg-white/[0.04] hover:text-white"
          >
            Sign out
          </button>
        </form>
      }
    >
      {children}
    </WorkspaceShell>
  );
}
