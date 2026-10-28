import Link from "next/link";
import { db } from "@/lib/db";

// The audit trail for MAIRO staff: what was done in AIOS (FounderActivity —
// including the assistant's proposals someone confirmed) beside what was done
// inside customer businesses (AuditLog, per business). Read-only.

export const dynamic = "force-dynamic";
export const metadata = { title: "Activity log" };

const eyebrow = "text-[11px] font-semibold uppercase tracking-[0.18em] text-signal";
const when = (d: Date) => d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default async function ActivityPage() {
  const [founder, business] = await Promise.all([
    db.founderActivity.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { organization: { select: { id: true, name: true } } } }),
  ]);
  const people = await db.user.findMany({ where: { id: { in: [...new Set([...founder.map((f) => f.actorUserId), ...business.map((b) => b.actorUserId).filter((x): x is string => Boolean(x))])] } }, select: { id: true, name: true, email: true } });
  const who = (id: string | null) => (id ? people.find((p) => p.id === id)?.name ?? people.find((p) => p.id === id)?.email ?? "Someone" : "MAIRO");

  return (
    <div className="mx-auto max-w-[1180px] space-y-6">
      <header>
        <p className={eyebrow}>AIOS · Activity log</p>
        <h1 className="mt-2 text-[clamp(24px,3vw,32px)] font-semibold tracking-[-0.02em] text-white">Activity log</h1>
        <p className="mt-2 max-w-[680px] text-[14.5px] text-neutral-400">The latest 100 of each. Entries are written when the change is made and can&rsquo;t be edited here.</p>
      </header>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-[22px] border border-[color:var(--mairo-line)] p-5">
          <h2 className="text-[15px] font-medium text-white">In AIOS</h2>
          {founder.length === 0 ? (
            <p className="mt-3 text-[13.5px] text-neutral-400">Nothing yet.</p>
          ) : (
            <ol className="mt-3 space-y-2.5">
              {founder.map((a) => (
                <li key={a.id} className="text-[13px]">
                  <span className="text-white">{who(a.actorUserId)}</span> <span className="text-neutral-400">{a.action}</span>
                  {a.detail && <span className="text-neutral-300"> · {a.detail}</span>}
                  {a.via === "assistant" && <span className="ml-1.5 rounded-full bg-signal/10 px-1.5 text-[10.5px] text-signal">via JARVIS, confirmed</span>}
                  <span className="block text-[11.5px] text-neutral-500">{when(a.createdAt)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="rounded-[22px] border border-[color:var(--mairo-line)] p-5">
          <h2 className="text-[15px] font-medium text-white">Inside customer businesses</h2>
          {business.length === 0 ? (
            <p className="mt-3 text-[13.5px] text-neutral-400">Nothing yet.</p>
          ) : (
            <ol className="mt-3 space-y-2.5">
              {business.map((a) => (
                <li key={a.id} className="text-[13px]">
                  <Link href={`/aios/organizations/${a.organization.id}`} className="text-white hover:text-signal">{a.organization.name}</Link>
                  <span className="text-neutral-400"> · {who(a.actorUserId)} · {a.action}</span>
                  {a.target && <span className="text-neutral-500"> · {a.target}</span>}
                  <span className="block text-[11.5px] text-neutral-500">{when(a.createdAt)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
