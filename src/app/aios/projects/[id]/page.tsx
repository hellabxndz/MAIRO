import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { KIND_LABEL } from "@/lib/aios/workspace";
import { StageTimeline, type Stage } from "@/components/viz/stage-timeline";
import { ItemControls, ItemForm, StatusPicker } from "../ui";

// One project: its milestones as a timeline, tasks, docs and notes, ideas,
// and everything that happened to it. Staff only (app/aios/layout.tsx).

export const dynamic = "force-dynamic";

const eyebrow = "text-[11px] font-semibold uppercase tracking-[0.18em] text-signal";
const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await db.founderProject.findUnique({ where: { id }, select: { name: true } });
  return { title: p ? `${p.name} · Projects` : "Projects" };
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await db.founderProject.findUnique({ where: { id }, include: { items: { orderBy: [{ doneAt: { sort: "asc", nulls: "first" } }, { dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }] } } });
  if (!project) notFound();
  const items = project.items;
  const activity = await db.founderActivity.findMany({ where: { target: { in: [project.id, ...items.map((i) => i.id)] } }, orderBy: { createdAt: "desc" }, take: 30 });
  const actors = await db.user.findMany({ where: { id: { in: [...new Set(activity.map((a) => a.actorUserId))] } }, select: { id: true, name: true, email: true } });
  const who = (uid: string) => actors.find((a) => a.id === uid)?.name ?? actors.find((a) => a.id === uid)?.email ?? "Someone";
  const today = new Date(new Date().toDateString());

  const milestones = items.filter((i) => i.kind === "MILESTONE").sort((a, b) => (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity));
  const firstOpen = milestones.findIndex((m) => !m.doneAt);
  const stages: Stage[] = milestones.map((m, i) => ({
    id: m.id,
    label: m.title,
    state: m.doneAt ? "done" : i === firstOpen ? (m.dueAt && m.dueAt < today ? "problem" : "current") : "upcoming",
    when: m.doneAt ? `Done ${day(m.doneAt)}` : m.dueAt ? `Due ${day(m.dueAt)}` : undefined,
    note: !m.doneAt && i === firstOpen && m.dueAt && m.dueAt < today ? "Overdue" : undefined,
  }));
  const tasks = items.filter((i) => i.kind === "TASK");
  const writing = items.filter((i) => i.kind === "DOC" || i.kind === "NOTE");
  const ideas = items.filter((i) => i.kind === "IDEA");
  const done = [...tasks, ...milestones].filter((i) => i.doneAt).length;

  const Row = ({ i }: { i: (typeof items)[number] }) => (
    <li className="flex items-start gap-3 rounded-xl px-2 py-2 hover:bg-[rgba(var(--mairo-fg-rgb),0.03)]">
      <span className="min-w-0 flex-1">
        {(i.kind === "DOC" || i.kind === "NOTE") && <span className="block text-[10.5px] uppercase tracking-[0.14em] text-neutral-500">{KIND_LABEL[i.kind]} · {day(i.createdAt)}</span>}
        <span className={`block text-[14px] ${i.doneAt ? "text-neutral-500 line-through" : "text-white"}`}>{i.title}</span>
        {i.body && <span className="mt-0.5 block whitespace-pre-wrap text-[13px] leading-relaxed text-neutral-400">{i.body}</span>}
      </span>
      {i.dueAt && !i.doneAt && <span className={`shrink-0 text-[12px] tabular-nums ${i.dueAt < today ? "text-amber-300" : "text-neutral-400"}`}>{day(i.dueAt)}</span>}
      <ItemControls id={i.id} done={Boolean(i.doneAt)} checkable={i.kind === "TASK" || i.kind === "MILESTONE"} title={i.title} />
    </li>
  );

  return (
    <div className="mx-auto max-w-[1180px] space-y-8">
      <header>
        <Link href="/aios/projects" className="text-[13px] text-neutral-400 hover:text-white">← Projects</Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[clamp(24px,3vw,32px)] font-semibold tracking-[-0.02em] text-white">{project.name}</h1>
            {project.summary && <p className="mt-2 max-w-[720px] whitespace-pre-wrap text-[14.5px] text-neutral-400">{project.summary}</p>}
            <p className="mt-2 text-[12.5px] text-neutral-500">{done} of {tasks.length + milestones.length} tasks and milestones done · started {day(project.createdAt)}</p>
          </div>
          <StatusPicker projectId={project.id} status={project.status} />
        </div>
      </header>

      <section aria-labelledby="ms-title" className="rounded-[24px] border border-[color:var(--mairo-line)] p-5">
        <h2 id="ms-title" className={eyebrow}>Milestones</h2>
        {stages.length ? (
          <>
            <div className="mt-4"><StageTimeline stages={stages} summary={firstOpen === -1 ? "Every milestone is done." : `Next: ${milestones[firstOpen].title}`} /></div>
            <ul className="mt-4 space-y-0.5 border-t border-[color:var(--mairo-line)] pt-3">{milestones.map((i) => <Row key={i.id} i={i} />)}</ul>
          </>
        ) : (
          <p className="mt-3 text-[14px] text-neutral-400">No milestones yet — add one with a due date.</p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section aria-labelledby="tasks-title">
            <h2 id="tasks-title" className={eyebrow}>Tasks</h2>
            {tasks.length ? <ul className="mt-2 space-y-0.5">{tasks.map((i) => <Row key={i.id} i={i} />)}</ul> : <p className="mt-2 text-[14px] text-neutral-400">No tasks yet.</p>}
          </section>
          <section aria-labelledby="docs-title">
            <h2 id="docs-title" className={eyebrow}>Docs and notes</h2>
            {writing.length ? (
              <ul className="mt-2 space-y-0.5">{writing.map((i) => <Row key={i.id} i={i} />)}</ul>
            ) : (
              <p className="mt-2 text-[14px] text-neutral-400">Nothing written yet.</p>
            )}
          </section>
          <section aria-labelledby="ideas-title">
            <h2 id="ideas-title" className={eyebrow}>Ideas</h2>
            {ideas.length ? <ul className="mt-2 space-y-0.5">{ideas.map((i) => <Row key={i.id} i={i} />)}</ul> : <p className="mt-2 text-[14px] text-neutral-400">No ideas parked here yet.</p>}
          </section>
        </div>
        <aside className="space-y-6">
          <section aria-labelledby="add-title" className="rounded-2xl border border-[color:var(--mairo-line)] p-4">
            <h2 id="add-title" className={eyebrow}>Add</h2>
            <div className="mt-3"><ItemForm projectId={project.id} /></div>
          </section>
          <section aria-labelledby="act-title">
            <h2 id="act-title" className={eyebrow}>Activity</h2>
            {activity.length ? (
              <ol className="mt-2 space-y-2 border-l border-[color:var(--mairo-line)] pl-4">
                {activity.map((a) => (
                  <li key={a.id} className="text-[12.5px]">
                    <span className="text-white">{who(a.actorUserId)}</span> <span className="text-neutral-400">{a.action.replace(".", " ")}</span>
                    {a.detail && <span className="text-neutral-400"> · {a.detail}</span>}
                    {a.via === "assistant" && <span className="ml-1 rounded-full bg-signal/10 px-1.5 text-[10.5px] text-signal">via JARVIS</span>}
                    <span className="block text-[11px] text-neutral-500">{a.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-[13px] text-neutral-500">Nothing yet.</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
