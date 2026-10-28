import Link from "next/link";
import { db } from "@/lib/db";
import { STATUS_LABEL } from "@/lib/aios/workspace";
import { ItemControls, ItemForm, ProjectForm } from "./ui";

// The founder's projects, and the inbox: things written down before they
// belong anywhere. Staff only (app/aios/layout.tsx).

export const dynamic = "force-dynamic";
export const metadata = { title: "Projects" };

const eyebrow = "text-[11px] font-semibold uppercase tracking-[0.18em] text-signal";

export default async function ProjectsPage() {
  const [projects, inbox] = await Promise.all([
    db.founderProject.findMany({
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      include: { items: { select: { kind: true, doneAt: true, dueAt: true } } },
    }),
    db.founderItem.findMany({ where: { projectId: null }, orderBy: [{ doneAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }], take: 50 }),
  ]);
  const today = new Date(new Date().toDateString());

  return (
    <div className="mx-auto max-w-[1180px] space-y-8">
      <header>
        <p className={eyebrow}>AIOS · Projects</p>
        <h1 className="mt-2 text-[clamp(24px,3vw,32px)] font-semibold tracking-[-0.02em] text-white">Projects</h1>
        <p className="mt-2 max-w-[640px] text-[14.5px] text-neutral-400">Tasks, milestones, docs, ideas and notes for running MAIRO. Only MAIRO staff can see this; every change is in the activity log.</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section aria-labelledby="list-title">
          <h2 id="list-title" className="sr-only">All projects</h2>
          {projects.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[color:var(--mairo-line)] px-5 py-10 text-center text-[14px] text-neutral-400">No projects yet. Create the first one on the right, or ask JARVIS to.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {projects.map((p) => {
                const work = p.items.filter((i) => i.kind === "TASK" || i.kind === "MILESTONE");
                const done = work.filter((i) => i.doneAt).length;
                const overdue = work.filter((i) => !i.doneAt && i.dueAt && i.dueAt < today).length;
                const pct = work.length ? Math.round((done / work.length) * 100) : 0;
                return (
                  <li key={p.id}>
                    <Link href={`/aios/projects/${p.id}`} className="block h-full rounded-2xl border border-[color:var(--mairo-line)] bg-[rgba(var(--mairo-fg-rgb),0.02)] p-4 transition hover:-translate-y-px hover:border-[color:var(--mairo-line-lit)]">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-[15px] font-medium text-white">{p.name}</span>
                        <span className="shrink-0 rounded-full border border-[color:var(--mairo-line)] px-2 py-0.5 text-[11px] text-neutral-400">{STATUS_LABEL[p.status]}</span>
                      </span>
                      {p.summary && <span className="mt-1 line-clamp-2 block text-[13px] text-neutral-400">{p.summary}</span>}
                      <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-[rgba(var(--mairo-fg-rgb),0.08)]" aria-hidden>
                        <span className="block h-full rounded-full bg-signal" style={{ width: `${pct}%` }} />
                      </span>
                      <span className="mt-2 flex gap-3 text-[12px] text-neutral-500">
                        <span>{work.length ? `${done} of ${work.length} done` : "No tasks yet"}</span>
                        <span>{p.items.length - work.length} notes, docs and ideas</span>
                        {overdue > 0 && <span className="text-amber-300">{overdue} overdue</span>}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="space-y-6">
          <section aria-labelledby="new-title" className="rounded-2xl border border-[color:var(--mairo-line)] p-4">
            <h2 id="new-title" className={eyebrow}>New project</h2>
            <div className="mt-3"><ProjectForm /></div>
          </section>
        </aside>
      </div>

      <section aria-labelledby="inbox-title" className="rounded-[24px] border border-[color:var(--mairo-line)] p-5">
        <h2 id="inbox-title" className={eyebrow}>Inbox</h2>
        <p className="mt-1 text-[13px] text-neutral-500">Anything not filed under a project yet.</p>
        <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_360px]">
          {inbox.length === 0 ? (
            <p className="text-[14px] text-neutral-400">Empty.</p>
          ) : (
            <ul className="space-y-1">
              {inbox.map((i) => (
                <li key={i.id} className="flex items-start gap-3 rounded-xl px-2 py-2 hover:bg-[rgba(var(--mairo-fg-rgb),0.03)]">
                  <span className="mt-0.5 w-[74px] shrink-0 text-[11px] uppercase tracking-[0.12em] text-neutral-500">{i.kind.toLowerCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[14px] ${i.doneAt ? "text-neutral-500 line-through" : "text-white"}`}>{i.title}</span>
                    {i.body && <span className="mt-0.5 line-clamp-2 block whitespace-pre-wrap text-[13px] text-neutral-400">{i.body}</span>}
                  </span>
                  {i.dueAt && <span className="shrink-0 text-[12px] tabular-nums text-neutral-400">{i.dueAt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</span>}
                  <ItemControls id={i.id} done={Boolean(i.doneAt)} checkable={i.kind === "TASK" || i.kind === "MILESTONE"} title={i.title} />
                </li>
              ))}
            </ul>
          )}
          <ItemForm />
        </div>
      </section>
    </div>
  );
}
