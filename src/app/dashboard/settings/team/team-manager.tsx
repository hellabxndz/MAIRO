"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui";
import { changeRoleAction, inviteMemberAction, leaveTeamAction, removeMemberAction, revokeInviteAction, type InviteResult } from "@/lib/actions/team-actions";
import type { Role } from "@/lib/members/roles";

type Member = { id: string; userId: string; name: string | null; email: string; role: Role; since: string; editable: boolean };
type Invite = { id: string; email: string; role: Role; expiresAt: string; editable: boolean };
type LogRow = { id: string; action: string; target: string | null; detail: string | null; actor: string; at: string };
type RoleInfo = { role: Role; label: string; summary: string; can: string[] };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function TeamManager({ me, manages, grantable, members, invites, log, roles }: {
  me: { userId: string; role: Role };
  manages: boolean;
  grantable: Role[];
  members: Member[];
  invites: Invite[];
  log: LogRow[];
  roles: RoleInfo[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const label = (r: Role) => roles.find((x) => x.role === r)?.label ?? r;

  // Only the server's answer is shown as done.
  const run = (fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setNote(r.ok ? { ok: true, text: r.message ?? "Saved." } : { ok: false, text: r.error });
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });

  return (
    <div className="space-y-6">
      {note && (
        <p role={note.ok ? "status" : "alert"} className={`rounded-xl px-4 py-2.5 text-[13.5px] ${note.ok ? "bg-live/10 text-live" : "bg-red-500/[0.08] text-red-400"}`}>
          {note.text}
        </p>
      )}

      <Card>
        <h2 className="text-[15px] font-semibold text-white">People</h2>
        <ul className="mt-4 divide-y" style={{ borderColor: "var(--mairo-line)" }}>
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 py-3" style={{ borderColor: "var(--mairo-line)" }}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] text-white">{m.name || m.email}{m.userId === me.userId && <span className="ml-2 text-[12px] text-muted">(you)</span>}</p>
                <p className="truncate text-[12.5px] text-muted">{m.email} · since {day(m.since)}</p>
              </div>
              {manages && m.editable ? (
                <>
                  <label className="sr-only" htmlFor={`role-${m.id}`}>Role for {m.email}</label>
                  <select
                    id={`role-${m.id}`}
                    value={m.role}
                    disabled={pending}
                    className={`${inputClass} !w-auto min-h-[38px] py-1.5 text-[13px]`}
                    onChange={(e) => run(() => changeRoleAction(m.id, e.target.value))}
                  >
                    {grantable.map((r) => <option key={r} value={r}>{label(r)}</option>)}
                  </select>
                  <button
                    type="button"
                    disabled={pending}
                    className="min-h-[38px] rounded-full px-3 text-[13px] text-red-400 hover:bg-red-500/[0.08]"
                    onClick={() => { if (confirm(`Remove ${m.email} from the team? Their access ends straight away.`)) run(() => removeMemberAction(m.id)); }}
                  >
                    Remove
                  </button>
                </>
              ) : (
                <span className="rounded-full bg-white/[0.06] px-3 py-1 text-[12.5px] text-white/90">{label(m.role)}</span>
              )}
              {/* The only owner can't leave: the business would have nobody to run it. */}
              {m.userId === me.userId && !(m.role === "OWNER" && members.filter((x) => x.role === "OWNER").length === 1) && (
                <button
                  type="button"
                  disabled={pending}
                  className="min-h-[38px] rounded-full px-3 text-[13px] text-muted hover:bg-white/[0.05] hover:text-white"
                  onClick={() => { if (confirm("Leave this team? You'll lose access to this business straight away.")) run(() => leaveTeamAction(), () => router.push("/dashboard")); }}
                >
                  Leave
                </button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {manages && <InviteCard grantable={grantable} label={label} />}

      {manages && invites.length > 0 && (
        <Card>
          <h2 className="text-[15px] font-semibold text-white">Invitations waiting</h2>
          <ul className="mt-3 space-y-2">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 text-[13.5px]">
                <span className="min-w-0 flex-1 truncate text-white">{i.email}</span>
                <span className="text-muted">{label(i.role)} · until {day(i.expiresAt)}</span>
                {i.editable && <button type="button" disabled={pending} onClick={() => run(() => revokeInviteAction(i.id))} className="rounded-full px-3 py-1 text-[13px] text-red-400 hover:bg-red-500/[0.08]">Withdraw</button>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <h2 className="text-[15px] font-semibold text-white">What each role can do</h2>
        <p className="mt-1 text-[13px] text-muted">MAIRO checks the role on the server for every change, not only by hiding buttons.</p>
        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {roles.map((r) => (
            <div key={r.role} className="rounded-xl px-4 py-3" style={{ background: "rgba(var(--mairo-fg-rgb),0.03)" }}>
              <dt className="text-[13.5px] font-semibold text-white">{r.label}</dt>
              <dd className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{r.summary}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {manages && (
        <Card>
          <h2 className="text-[15px] font-semibold text-white">Team changes</h2>
          <p className="mt-1 text-[13px] text-muted">Every invitation, role change and removal, newest first.</p>
          {log.length === 0 ? (
            <p className="mt-3 text-[13.5px] text-muted">Nothing yet.</p>
          ) : (
            <ol className="mt-3 space-y-2">
              {log.map((l) => (
                <li key={l.id} className="text-[13px]">
                  <span className="text-white">{l.actor}</span> <span className="text-white/85">{l.action.charAt(0).toLowerCase() + l.action.slice(1)}</span>
                  {l.target && <span className="text-white/85"> — {l.target}</span>}
                  {l.detail && <span className="text-muted"> ({l.detail})</span>}
                  <span className="block text-[12px] text-faint">{when(l.at)}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}
    </div>
  );
}

function InviteCard({ grantable, label }: { grantable: Role[]; label: (r: Role) => string }) {
  const [state, action, pending] = useActionState<InviteResult, FormData>(inviteMemberAction, undefined);
  const [copied, setCopied] = useState(false);
  return (
    <Card>
      <h2 className="text-[15px] font-semibold text-white">Invite someone</h2>
      <p className="mt-1 text-[13px] text-muted">MAIRO makes a private link for their email address. Send it to them yourself — MAIRO doesn&rsquo;t email anyone. It works once, for seven days.</p>
      <form action={action} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="invite-email" className="block text-[13px] text-muted">Their email</label>
          <input id="invite-email" name="email" type="email" required autoComplete="off" className={`${inputClass} mt-1`} placeholder="name@business.com" />
        </div>
        <div>
          <label htmlFor="invite-role" className="block text-[13px] text-muted">Role</label>
          <select id="invite-role" name="role" defaultValue={grantable.includes("MARKETING_MANAGER") ? "MARKETING_MANAGER" : grantable[0]} className={`${inputClass} mt-1 sm:w-auto`}>
            {grantable.map((r) => <option key={r} value={r}>{label(r)}</option>)}
          </select>
        </div>
        <button type="submit" disabled={pending} className={primaryButtonClass}>{pending ? "Making the link…" : "Make invitation link"}</button>
      </form>
      {state && !state.ok && <p role="alert" className="mt-3 text-[13.5px] text-red-400">{state.error}</p>}
      {state?.ok && (
        <div className="mt-4 rounded-xl bg-violet/[0.08] px-4 py-3">
          <p className="text-[13px] text-white/90">Invitation for {state.email}, until {state.expires}. This link is shown once:</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input readOnly value={state.link} aria-label="Invitation link" className={`${inputClass} flex-1 font-mono text-[12.5px]`} onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className={secondaryButtonClass} onClick={() => navigator.clipboard?.writeText(state.link).then(() => setCopied(true), () => setCopied(false))}>{copied ? "Copied" : "Copy link"}</button>
          </div>
        </div>
      )}
    </Card>
  );
}
