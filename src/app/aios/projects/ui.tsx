"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addItemAction, createProjectAction, deleteItemAction, setItemDoneAction, setProjectStatusAction, type FounderResult } from "@/lib/actions/founder-actions";

// The workspace's controls. Each press goes through a server action that
// re-checks staff access and writes the activity log.

const field = "w-full rounded-xl border border-[color:var(--mairo-line)] bg-[rgba(var(--mairo-fg-rgb),0.03)] px-3 py-2.5 text-[14px] text-white placeholder:text-neutral-500 focus:border-signal/60 focus:outline-none";
const button = "min-h-10 rounded-full bg-[image:var(--mairo-ramp)] px-4 text-[13px] font-medium shadow-[var(--mairo-glow-key)] disabled:opacity-60";

function Result({ state }: { state: FounderResult | null }) {
  if (!state) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={`text-[12.5px] ${state.ok ? "text-emerald-300" : "text-red-300"}`}>
      {state.ok ? state.message : state.error}
    </p>
  );
}

export function ProjectForm() {
  const form = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [state, action, pending] = useActionState(async (prev: FounderResult | null, data: FormData) => {
    const r = await createProjectAction(prev, data);
    if (r.ok) {
      form.current?.reset();
      if (r.id) router.push(`/aios/projects/${r.id}`);
    }
    return r;
  }, null);
  return (
    <form ref={form} action={action} className="space-y-2.5" aria-label="New project">
      <label className="block">
        <span className="sr-only">Project name</span>
        <input name="name" required maxLength={200} placeholder="Project name" className={field} />
      </label>
      <label className="block">
        <span className="sr-only">What it&rsquo;s for</span>
        <textarea name="summary" rows={2} maxLength={20000} placeholder="What it's for (optional)" className={field} />
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={button}>{pending ? "Creating…" : "Create project"}</button>
        <Result state={state} />
      </div>
    </form>
  );
}

const KINDS = [
  ["TASK", "Task"],
  ["MILESTONE", "Milestone"],
  ["NOTE", "Note"],
  ["DOC", "Doc"],
  ["IDEA", "Idea"],
] as const;

export function ItemForm({ projectId, defaultKind = "TASK" }: { projectId?: string; defaultKind?: (typeof KINDS)[number][0] }) {
  const form = useRef<HTMLFormElement>(null);
  const [kind, setKind] = useState<string>(defaultKind);
  const [state, action, pending] = useActionState(async (prev: FounderResult | null, data: FormData) => {
    const r = await addItemAction(prev, data);
    if (r.ok) form.current?.reset();
    return r;
  }, null);
  const dated = kind === "TASK" || kind === "MILESTONE";
  return (
    <form ref={form} action={action} className="space-y-2.5" aria-label="Add to this project">
      {projectId && <input type="hidden" name="projectId" value={projectId} />}
      <div role="radiogroup" aria-label="Kind" className="flex flex-wrap gap-1.5">
        {KINDS.map(([k, label]) => (
          <label key={k} className={`cursor-pointer rounded-full border px-3 py-1.5 text-[12.5px] transition ${kind === k ? "border-signal/60 bg-signal/10 text-white" : "border-[color:var(--mairo-line)] text-neutral-400 hover:text-white"}`}>
            <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
            {label}
          </label>
        ))}
      </div>
      <label className="block">
        <span className="sr-only">Title</span>
        <input name="title" required maxLength={200} placeholder={dated ? "What needs doing" : "Title"} className={field} />
      </label>
      {!dated && (
        <label className="block">
          <span className="sr-only">Details</span>
          <textarea name="body" rows={kind === "DOC" ? 6 : 3} maxLength={20000} placeholder="Write it down" className={field} />
        </label>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {dated && (
          <label className="flex items-center gap-2 text-[12.5px] text-neutral-400">
            Due
            <input type="date" name="due" className={`${field} w-auto py-2`} />
          </label>
        )}
        <button type="submit" disabled={pending} className={button}>{pending ? "Adding…" : "Add"}</button>
        <Result state={state} />
      </div>
    </form>
  );
}

export function ItemControls({ id, done, checkable, title }: { id: string; done: boolean; checkable: boolean; title: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<FounderResult>) =>
    start(async () => {
      const r = await fn();
      setError(r.ok ? null : r.error);
    });
  return (
    <span className="flex shrink-0 items-center gap-1">
      {checkable && (
        <button
          type="button"
          disabled={pending}
          aria-pressed={done}
          aria-label={done ? `Reopen ${title}` : `Mark ${title} done`}
          onClick={() => run(() => setItemDoneAction(id, !done))}
          className={`grid h-7 w-7 place-items-center rounded-lg border text-[12px] transition ${done ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-300" : "border-[color:var(--mairo-line-lit)] text-transparent hover:text-neutral-400"}`}
        >
          ✓
        </button>
      )}
      <button
        type="button"
        disabled={pending}
        aria-label={`Delete ${title}`}
        onClick={() => {
          if (window.confirm(`Delete "${title}"? This can't be undone.`)) run(() => deleteItemAction(id));
        }}
        className="grid h-7 w-7 place-items-center rounded-lg text-[13px] text-neutral-500 hover:bg-red-500/10 hover:text-red-300"
      >
        ×
      </button>
      {error && <span role="alert" className="text-[11.5px] text-red-300">{error}</span>}
    </span>
  );
}

const STATUSES = [
  ["IDEA", "Idea"],
  ["ACTIVE", "Active"],
  ["PAUSED", "Paused"],
  ["DONE", "Done"],
] as const;

export function StatusPicker({ projectId, status }: { projectId: string; status: string }) {
  const [pending, start] = useTransition();
  return (
    <div role="group" aria-label="Project status" className="inline-flex rounded-full border border-[color:var(--mairo-line)] p-0.5">
      {STATUSES.map(([s, label]) => (
        <button
          key={s}
          type="button"
          disabled={pending}
          aria-pressed={status === s}
          onClick={() => start(async () => void (await setProjectStatusAction(projectId, s)))}
          className={`rounded-full px-3 py-1.5 text-[12.5px] transition ${status === s ? "bg-[rgba(var(--mairo-fg-rgb),0.1)] text-white" : "text-neutral-400 hover:text-white"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
