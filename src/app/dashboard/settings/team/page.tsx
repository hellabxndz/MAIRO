import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { currentMember } from "@/lib/members/authorize";
import { listTeam, seatProblem } from "@/lib/members/store";
import { can, canManage, permissionsOf, PERMISSION_VERB, ROLE_LABEL, ROLE_SUMMARY, ROLES } from "@/lib/members/roles";
import { TeamManager } from "./team-manager";

// Settings › Team: who's on this business's team with which role, the
// invitations waiting, and every change to the team. Everyone on the team
// can see who's on it; only owners and administrators can change it, and the
// actions check that again on the server.

export const metadata = { title: "Team — MAIRO" };

export default async function TeamPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const me = await currentMember();
  if (!me) redirect("/dashboard");

  const back = (
    <Link href="/dashboard/settings" className="text-[13px] text-muted hover:text-white">
      ← Settings
    </Link>
  );

  if (me.actingAsClient) {
    return (
      <div className="mx-auto max-w-[760px]">
        {back}
        <h1 className="mt-3 text-[clamp(24px,3vw,30px)] font-semibold tracking-[-0.02em] text-white">Team</h1>
        <p className="mt-2 text-[14.5px] text-muted">You run this business from your workspace, so it doesn&rsquo;t have a team of its own. Your workspace&rsquo;s team is in its settings.</p>
      </div>
    );
  }

  const [team, org, seats] = await Promise.all([
    listTeam(me.organizationId),
    db.organization.findUnique({ where: { id: me.organizationId }, select: { name: true } }),
    seatProblem(me.organizationId),
  ]);
  const manages = can(me.role, "team.manage");

  return (
    <div className="mx-auto max-w-[860px]">
      {back}
      <h1 className="mt-3 text-[clamp(24px,3vw,30px)] font-semibold tracking-[-0.02em] text-white">Team</h1>
      <p className="mt-1 mb-6 text-[14.5px] text-muted">
        Who works on {org?.name ?? "this business"} in MAIRO, and what each person can do. You&rsquo;re {/^[AEIOU]/.test(ROLE_LABEL[me.role]) ? "an" : "a"} {ROLE_LABEL[me.role]}.
      </p>
      {manages && seats && (
        <p className="mb-5 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[13.5px] leading-relaxed text-muted">
          {seats} Everyone already on the team stays.{" "}
          <Link href="/dashboard/billing" className="text-blue-bright hover:text-white">See plans</Link>
        </p>
      )}
      <TeamManager
        me={{ userId: me.userId, role: me.role }}
        manages={manages}
        grantable={ROLES.filter((r) => canManage(me.role, r))}
        members={team.members.map((m) => ({ ...m, since: m.since.toISOString(), editable: m.userId !== me.userId && canManage(me.role, m.role) }))}
        invites={manages ? team.invites.map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expiresAt.toISOString(), editable: canManage(me.role, i.role) })) : []}
        log={manages ? team.log.map((l) => ({ id: l.id, action: l.action, target: l.target, detail: l.detail, actor: l.actor, at: l.createdAt.toISOString() })) : []}
        roles={ROLES.map((r) => ({ role: r, label: ROLE_LABEL[r], summary: ROLE_SUMMARY[r], can: permissionsOf(r).map((p) => PERMISSION_VERB[p]) }))}
      />
    </div>
  );
}
