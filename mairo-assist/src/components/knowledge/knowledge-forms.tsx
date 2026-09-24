"use client";

import { BookOpen, Loader2, Search, Trash2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { deleteKnowledgeDocument, inspectKnowledge, saveKnowledgeEntry, uploadKnowledgeFile } from "@/lib/knowledge/actions";
import type { KnowledgeHit } from "@/lib/knowledge/service";
import { type FormState, withNonce } from "@/lib/validation/form";

export type CategoryOption = { value: string; label: string };

function CategorySelect({ id, options, defaultValue, errors }: { id: string; options: CategoryOption[]; defaultValue?: string; errors?: string[] }) {
  return (
    <Field label="Type" htmlFor={id} errors={errors}>
      <Select id={id} name="category" defaultValue={defaultValue ?? ""}>
        <option value="" disabled>Choose a type</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
    </Field>
  );
}

export function EntryForm({
  options,
  doc,
  onDone,
}: {
  options: CategoryOption[];
  doc?: { id: string; title: string; category: string; content: string };
  onDone?: () => void;
}) {
  const [state, action] = useActionState(
    withNonce(async (prev: FormState, form: FormData) => {
      const r = await saveKnowledgeEntry(prev, form);
      if (r.ok && onDone) onDone();
      return r;
    }),
    {} as FormState,
  );
  const v = state.values;
  const idp = doc ? `e-${doc.id}` : "new";
  return (
    <form key={state.nonce ?? 0} action={action} className="space-y-4" noValidate>
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      {doc && <input type="hidden" name="id" value={doc.id} />}
      <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
        <Field label="Title" htmlFor={`${idp}-title`} errors={state.errors?.title}>
          <Input id={`${idp}-title`} name="title" maxLength={200} defaultValue={v?.title ?? doc?.title ?? ""} placeholder="e.g. Do your jeans run large?" />
        </Field>
        <CategorySelect id={`${idp}-category`} options={options} defaultValue={v?.category ?? doc?.category} errors={state.errors?.category} />
      </div>
      <Field label="Content" htmlFor={`${idp}-content`} errors={state.errors?.content}>
        <Textarea id={`${idp}-content`} name="content" className="min-h-36" defaultValue={v?.content ?? doc?.content ?? ""} placeholder="Write the answer exactly as you'd want it given." />
      </Field>
      <SubmitButton pendingText="Saving…">{doc ? "Save changes" : "Add to knowledge base"}</SubmitButton>
    </form>
  );
}

export function UploadForm({ options }: { options: CategoryOption[] }) {
  const [state, action] = useActionState(withNonce(uploadKnowledgeFile), {} as FormState);
  return (
    <form key={state.nonce ?? 0} action={action} className="space-y-4" noValidate>
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
        <Field label="Document" htmlFor="file" errors={state.errors?.file} hint=".txt, .md, .pdf or .docx — up to 5 MB. Scanned images aren't read.">
          <Input id="file" name="file" type="file" accept=".txt,.md,.pdf,.docx" className="h-auto py-2.5 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-sm file:text-fg" />
        </Field>
        <CategorySelect id="upload-category" options={options} errors={state.errors?.category} />
      </div>
      <Field label="Title (optional)" htmlFor="upload-title">
        <Input id="upload-title" name="title" maxLength={200} placeholder="Defaults to the file name" />
      </Field>
      <SubmitButton variant="secondary" pendingText="Reading document…">Upload</SubmitButton>
    </form>
  );
}

export function DocumentActions({ doc, options, canManage }: { doc: { id: string; title: string; category: string; content: string }; options: CategoryOption[]; canManage: boolean }) {
  const [open, setOpen] = useState<"view" | "edit" | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" onClick={() => setOpen(open === "view" ? null : "view")}>{open === "view" ? "Hide" : "View"}</Button>
        {canManage && <Button size="sm" variant="ghost" onClick={() => setOpen(open === "edit" ? null : "edit")}>Edit</Button>}
        {canManage &&
          (confirm ? (
            <>
              <Button size="sm" variant="danger" disabled={pending} onClick={() => start(async () => {
                const r = await deleteKnowledgeDocument(doc.id);
                if (!r.ok) setError(r.message);
              })}>
                {pending ? <Loader2 className="animate-spin" /> : <Trash2 />} Confirm delete
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirm(true)} aria-label={`Delete ${doc.title}`}>
              <Trash2 /> Delete
            </Button>
          ))}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      {open === "view" && <p className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl bg-black/20 p-3 text-sm text-fg-muted">{doc.content}</p>}
      {open === "edit" && <EntryForm options={options} doc={doc} onDone={() => setOpen(null)} />}
    </div>
  );
}

export function Inspector() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<KnowledgeHit[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await inspectKnowledge(q);
            setHits(r.hits);
            setMessage(r.ok ? null : r.message ?? null);
          });
        }}
      >
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Can I return sale items?" aria-label="Test question" />
        <Button type="submit" variant="secondary" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Search />} Test</Button>
      </form>
      {message && <p className="text-sm text-fg-muted">{message}</p>}
      {hits && hits.length === 0 && !message && (
        <Alert tone="warning">Nothing matched. Your AI employee would say it doesn&apos;t know and offer your team&apos;s help. Consider adding an entry for this.</Alert>
      )}
      {hits && hits.length > 0 && (
        <ol className="space-y-2">
          {hits.map((h, i) => (
            <li key={h.chunkId} className="rounded-xl border border-line p-3">
              <p className="mb-1 flex items-center gap-2 text-xs text-fg-subtle"><BookOpen className="size-3.5 text-violet-glow" aria-hidden /> #{i + 1} · {h.title}</p>
              <p className="line-clamp-4 whitespace-pre-wrap text-sm text-fg-muted">{h.content}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
