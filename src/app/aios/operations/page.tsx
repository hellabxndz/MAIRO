import Link from "next/link";
import { db } from "@/lib/db";
import { AGENT } from "@/lib/team/agents";
import { currentOperationHealth } from "@/lib/meta-intelligence/operations";
import { OPERATION_LABEL } from "@/lib/meta-intelligence/operations/rules";

// Operations for MAIRO staff: background runs that failed or never finished,
// what Meta is doing to MAIRO's writes, and the decisions waiting on
// customers. Read-only: customers approve their own decisions; this page
// shows the queue, it never approves on anyone's behalf.

export const dynamic = "force-dynamic";
export const metadata = { title: "Operations" };

const eyebrow = "text-[11px] font-semibold uppercase tracking-[0.18em] text-signal";
const when = (d: Date) => d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const STATE = { ok: "text-emerald-300", investigate: "text-amber-200", paused: "text-red-300" } as const;

export default async function OperationsPage() {
  const now = new Date();
  const [failed, stuck, decisions, health, errors] = await Promise.all([
    db.agentRun.findMany({ where: { status: "FAILED", startedAt: { gte: new Date(now.getTime() - 86_400_000) } }, orderBy: { startedAt: "desc" }, take: 30, include: { organization: { select: { id: true, name: true } } } }),
    db.agentRun.findMany({ where: { status: "RUNNING", startedAt: { lt: new Date(now.getTime() - 3_600_000) } }, orderBy: { startedAt: "asc" }, take: 30, include: { organization: { select: { id: true, name: true } } } }),
    db.mairoDecision.groupBy({ by: ["organizationId"], where: { status: "PENDING" }, _count: true, _min: { createdAt: true } }),
    currentOperationHealth(now).catch(() => null),
    db.platformApiError.findMany({ where: { lastAt: { gte: new Date(now.getTime() - 86_400_000) } }, orderBy: { count: "desc" }, take: 8 }),
  ]);
  const urgent = await db.mairoDecision.groupBy({ by: ["organizationId"], where: { status: "PENDING", urgent: true }, _count: true });
  const orgs = await db.organization.findMany({ where: { id: { in: decisions.map((d) => d.organizationId) } }, select: { id: true, name: true } });
  const queue = decisions
    .map((d) => ({ id: d.organizationId, name: orgs.find((o) => o.id === d.organizationId)?.name ?? "Unknown", count: d._count, urgent: urgent.find((u) => u.organizationId === d.organizationId)?._count ?? 0, oldest: d._min.createdAt }))
    .sort((a, b) => b.urgent - a.urgent || (a.oldest?.getTime() ?? 0) - (b.oldest?.getTime() ?? 0));

  const runRow = (r: (typeof failed)[number]) => (
    <tr key={r.id} className="border-t border-[color:var(--mairo-line)] align-top">
      <td className="py-2"><Link href={`/aios/organizations/${r.organization.id}`} className="text-white hover:text-signal">{r.organization.name}</Link></td>
      <td className="py-2 text-neutral-300">{AGENT[r.agent]?.name ?? r.agent}<span className="block text-[11.5px] text-neutral-500">{r.task}</span></td>
      <td className="py-2 text-neutral-400">{r.summary ?? "—"}</td>
      <td className="py-2 tabular-nums text-neutral-500">{when(r.startedAt)}</td>
    </tr>
  );
  const runTable = (rows: typeof failed, empty: string) =>
    rows.length === 0 ? (
      <p className="mt-3 text-[13.5px] text-neutral-400">{empty}</p>
    ) : (
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[600px] text-left text-[13px]">
          <thead className="text-neutral-500"><tr><th className="py-1.5 font-normal">Business</th><th className="py-1.5 font-normal">Specialty · task</th><th className="py-1.5 font-normal">What it recorded</th><th className="py-1.5 font-normal">Started</th></tr></thead>
          <tbody>{rows.map(runRow)}</tbody>
        </table>
      </div>
    );

  return (
    <div className="mx-auto max-w-[1180px] space-y-6">
      <header>
        <p className={eyebrow}>AIOS · Operations</p>
        <h1 className="mt-2 text-[clamp(24px,3vw,32px)] font-semibold tracking-[-0.02em] text-white">Operations</h1>
        <p className="mt-2 max-w-[680px] text-[14.5px] text-neutral-400">Background work, Meta&rsquo;s side of things, and what&rsquo;s waiting on customers — from MAIRO&rsquo;s run records, operation counts and decision queue.</p>
      </header>

      <section className="rounded-[22px] border border-[color:var(--mairo-line)] p-5">
        <h2 className="text-[15px] font-medium text-white">Meta operations, last 2 hours</h2>
        {health === null ? (
          <p className="mt-2 text-[13.5px] text-neutral-400">Couldn&rsquo;t read the operation counts.</p>
        ) : health.length === 0 ? (
          <p className="mt-2 text-[13.5px] text-neutral-400">No writes to Meta in the last 2 hours.</p>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {health.map((h) => (
              <li key={h.operation} className="rounded-xl border border-[color:var(--mairo-line)] px-3 py-2.5">
                <p className="flex items-center justify-between text-[13px] text-white">{OPERATION_LABEL[h.operation]}<span className={`text-[12px] ${STATE[h.state]}`}>{h.state === "ok" ? "OK" : h.state === "paused" ? "Paused" : "Investigate"}</span></p>
                <p className="mt-0.5 text-[11.5px] text-neutral-500">{h.okCount} of {h.attempts} succeeded{h.reason ? ` · ${h.reason}` : ""}</p>
              </li>
            ))}
          </ul>
        )}
        {errors.length > 0 && (
          <>
            <h3 className="mt-5 text-[13px] text-neutral-300">Errors Meta returned in the last 24 hours</h3>
            <ul className="mt-2 space-y-1.5">
              {errors.map((e) => (
                <li key={e.id} className="flex gap-3 text-[12.5px]">
                  <span className="w-10 shrink-0 tabular-nums text-neutral-400">×{e.count}</span>
                  <span className="min-w-0 flex-1 truncate text-neutral-300" title={e.message}>{e.code ? `#${e.code} ` : ""}{e.message}</span>
                  <span className="shrink-0 text-neutral-500">{e.method} {e.endpoint}</span>
                </li>
              ))}
            </ul>
            <Link href="/aios/meta-intelligence?tab=errors" className="mt-3 inline-block text-[13px] text-signal hover:underline">All errors →</Link>
          </>
        )}
      </section>

      <section className="rounded-[22px] border border-[color:var(--mairo-line)] p-5">
        <h2 className="text-[15px] font-medium text-white">Runs that never finished <span className="ml-1 text-[12px] tabular-nums text-neutral-400">{stuck.length}</span></h2>
        <p className="mt-1 text-[12.5px] text-neutral-500">Started over an hour ago and still marked running — usually a deploy or timeout cut them off.</p>
        {runTable(stuck, "None.")}
      </section>

      <section className="rounded-[22px] border border-[color:var(--mairo-line)] p-5">
        <h2 className="text-[15px] font-medium text-white">Failed in the last 24 hours <span className="ml-1 text-[12px] tabular-nums text-neutral-400">{failed.length}</span></h2>
        {runTable(failed, "None failed.")}
      </section>

      <section className="rounded-[22px] border border-[color:var(--mairo-line)] p-5">
        <h2 className="text-[15px] font-medium text-white">Decisions waiting on customers</h2>
        <p className="mt-1 text-[12.5px] text-neutral-500">Each business approves its own. Oldest and most urgent first.</p>
        {queue.length === 0 ? (
          <p className="mt-3 text-[13.5px] text-neutral-400">Nothing waiting.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[color:var(--mairo-line)]">
            {queue.map((q) => (
              <li key={q.id} className="flex items-center gap-3 py-2 text-[13px]">
                <Link href={`/aios/organizations/${q.id}`} className="min-w-0 flex-1 truncate text-white hover:text-signal">{q.name}</Link>
                {q.urgent > 0 && <span className="rounded-full bg-amber-400/10 px-2 text-[11.5px] text-amber-200">{q.urgent} urgent</span>}
                <span className="tabular-nums text-neutral-400">{q.count} waiting</span>
                <span className="w-28 text-right text-[12px] text-neutral-500">{q.oldest ? `since ${q.oldest.toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
