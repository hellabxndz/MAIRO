import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/dashboard/page-header";
import { InviteForm } from "@/components/team/invite-form";
import { LeaveButton, MemberActions } from "@/components/team/member-actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { revokeInvitation } from "@/lib/team/actions";
import { createClient } from "@/lib/supabase/server";
import { hasPlanFeature, requireBusiness } from "@/lib/tenancy/context";
import { isRole, parseGrants, ROLE_LABELS } from "@/lib/tenancy/permissions";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const ctx = await requireBusiness("team.view");
  const supabase = await createClient();
  const canManage = ctx.permissions.has("team.manage");

  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase
      .from("business_members")
      .select("id, role, permissions, created_at, user:users!inner(id, email, full_name)")
      .eq("business_id", ctx.business.id)
      .order("created_at"),
    canManage
      ? supabase
          .from("business_invitations")
          .select("id, email, role, expires_at, created_at")
          .eq("business_id", ctx.business.id)
          .is("accepted_at", null)
          .is("revoked_at", null)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as { id: string; email: string; role: string; expires_at: string; created_at: string }[] }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Team" description="Who can help run your AI employee, and what each person can do." />

      <Card>
        <CardHeader>
          <CardTitle>Roles</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
          <RoleCard title="Owner" text="Everything, including billing, integrations, team members and deleting the business." />
          <RoleCard title="Admin" text="Runs day-to-day operations: AI settings, knowledge, approvals and analytics. No billing changes." />
          <RoleCard title="Support Agent" text="Customer support only: inbox, customers, orders and tickets. No settings or billing." />
        </CardContent>
      </Card>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Invite a teammate</CardTitle>
            <CardDescription>They&apos;ll get access to this business only.</CardDescription>
          </CardHeader>
          <CardContent>
            {!hasPlanFeature(ctx, "team_access") ? (
              <Alert tone="info">
                Team members are included from the Pro plan.{" "}
                <Link href="/dashboard/upgrade" className="font-medium text-fg underline underline-offset-2">Explore upgrades</Link>
              </Alert>
            ) : (
              <InviteForm />
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-line">
            {(members ?? []).map((m) => {
              const u = (Array.isArray(m.user) ? m.user[0] : m.user) as { id: string; email: string; full_name: string | null };
              const isSelf = u.id === ctx.user.id;
              const role = isRole(m.role) ? m.role : "support_agent";
              return (
                <li key={m.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {u.full_name || u.email} {isSelf && <span className="text-fg-subtle">(you)</span>}
                    </p>
                    <p className="truncate text-xs text-fg-muted">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone={role === "owner" ? "violet" : role === "admin" ? "blue" : "neutral"}>{ROLE_LABELS[role]}</Badge>
                    {canManage ? (
                      <MemberActions memberId={m.id} role={role} isSelf={isSelf} integrationsGrant={parseGrants(role, m.permissions).includes("integrations.manage")} />
                    ) : (
                      isSelf && <LeaveButton />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {canManage && (invites?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending invitations</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-line">
              {invites!.map((i) => (
                <li key={i.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm">{i.email}</p>
                    <p className="text-xs text-fg-subtle">
                      {isRole(i.role) ? ROLE_LABELS[i.role] : i.role} · expires {formatDateTime(i.expires_at)}
                    </p>
                  </div>
                  <form action={revokeInvitation.bind(null, i.id)}>
                    <Button size="sm" variant="ghost" type="submit">Revoke</Button>
                  </form>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RoleCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-line p-3.5">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-xs text-fg-muted">{text}</p>
    </div>
  );
}
