"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  approvePostsAction,
  createPostAction,
  discardPostAction,
  planWeekAction,
  updatePostAction,
  type SocialResult,
} from "@/lib/actions/social-actions";
import { CAPTION_MAX } from "@/lib/instagram/constants";
import { CAROUSEL_MAX, MEDIA_LABEL, type MediaType } from "@/lib/instagram/social-logic";
import type { MediaItem } from "@/lib/instagram/library";

// Scale's Instagram: let MAIRO plan the week, or make a post yourself — a
// photo, a carousel or a Reel — and post it now or schedule it. Nothing
// MAIRO suggests goes out until it's approved here.

export type PostView = {
  id: string;
  status: string;
  mediaType: MediaType;
  caption: string;
  previewUrl: string | null;
  whenLabel: string;
  whenLocal: string;
  error: string | null;
};

const card = "rounded-2xl border border-white/[0.07] bg-[#0b1122]/80 p-5";
const input = "w-full rounded-lg border border-white/10 bg-[#0c1326] px-3 py-2 text-[14px] text-white outline-none placeholder:text-faint focus:border-violet/60";
const primary = "min-h-[42px] rounded-lg bg-[#7c5cff] px-4 text-[13.5px] font-medium text-white transition hover:brightness-110 disabled:opacity-50";
const secondary = "min-h-[42px] rounded-lg border border-white/12 px-4 text-[13.5px] text-white/85 transition hover:border-white/30 disabled:opacity-50";

function Thumb({ url, kind }: { url: string | null; kind: "image" | "video" }) {
  return (
    <span className="relative block aspect-square w-full overflow-hidden rounded-lg bg-white/[0.04]">
      {url ? <Image src={url} alt="" fill unoptimized sizes="160px" className="object-cover" /> : null}
      {kind === "video" && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-[11px] text-white">▶</span>
        </span>
      )}
    </span>
  );
}

function Notice({ result }: { result: SocialResult | null }) {
  if (!result) return null;
  return result.ok ? (
    <p className="mt-3 rounded-lg bg-emerald-400/10 px-3 py-2 text-[13px] text-emerald-300">
      {result.message}
      {result.permalink && (
        <a href={result.permalink} target="_blank" rel="noopener noreferrer" className="ml-2 underline underline-offset-4">See it on Instagram</a>
      )}
    </p>
  ) : (
    <p className="mt-3 rounded-lg bg-alert/10 px-3 py-2 text-[13px] text-alert">{result.error}</p>
  );
}

function PostEditor({ post, onDone }: { post: PostView; onDone: () => void }) {
  const [caption, setCaption] = useState(post.caption);
  const [local, setLocal] = useState(post.whenLocal);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<SocialResult | null>(null);
  return (
    <div className="mt-3 space-y-2">
      <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={5} maxLength={CAPTION_MAX} className={input} aria-label="Caption" />
      <div className="flex flex-wrap items-center gap-2">
        <input type="datetime-local" value={local} onChange={(e) => setLocal(e.target.value)} className={`${input} w-auto`} aria-label="When to post" />
        <button type="button" disabled={pending} className={secondary}
          onClick={() => start(async () => {
            const r = await updatePostAction({ id: post.id, caption, local: local || null });
            setResult(r);
            if (r.ok) onDone();
          })}>
          Save changes
        </button>
      </div>
      <Notice result={result} />
    </div>
  );
}

export function SocialStudio({
  library,
  suggested,
  upcoming,
  canPost,
  timeZoneLabel,
}: {
  library: MediaItem[];
  suggested: PostView[];
  upcoming: PostView[];
  canPost: boolean;
  timeZoneLabel: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<SocialResult | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const [type, setType] = useState<MediaType>("IMAGE");
  const [picked, setPicked] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [mode, setMode] = useState<"now" | "schedule">("schedule");
  const [local, setLocal] = useState("");

  const kind = type === "REEL" ? "video" : "image";
  const choices = library.filter((m) => m.kind === kind);

  function run(fn: () => Promise<SocialResult>) {
    setResult(null);
    start(async () => {
      const r = await fn().catch(() => ({ ok: false as const, error: "Something went wrong. Try again." }));
      setResult(r);
      if (r.ok) router.refresh();
    });
  }

  function toggle(item: MediaItem) {
    if (type === "CAROUSEL") {
      setPicked((p) => (p.includes(item.ref) ? p.filter((r) => r !== item.ref) : p.length >= CAROUSEL_MAX ? p : [...p, item.ref]));
    } else {
      setPicked([item.ref]);
    }
    if (!caption.trim() && item.suggested) setCaption(item.suggested);
  }

  function switchType(t: MediaType) {
    setType(t);
    setPicked([]);
  }

  return (
    <div className="space-y-6">
      {/* MAIRO plans the week */}
      <div className={`${card} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}>
        <div>
          <p className="text-[15px] font-semibold text-white">Let MAIRO plan your week</p>
          <p className="mt-1 text-[13px] text-muted">MAIRO picks from your approved pictures and videos, writes the captions and suggests times. You approve each post — nothing goes out before that.</p>
        </div>
        <button type="button" disabled={pending || !canPost} onClick={() => run(planWeekAction)} className={`${primary} shrink-0`}>
          {pending ? "Working…" : suggested.length ? "Plan again" : "Plan my week"}
        </button>
      </div>
      <Notice result={result} />

      {suggested.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-[16px] font-semibold text-white">MAIRO&rsquo;s suggestions — waiting for you</h2>
            <button type="button" disabled={pending || !canPost} onClick={() => run(() => approvePostsAction(suggested.map((s) => s.id)))} className={primary}>
              Approve all
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {suggested.map((p) => (
              <div key={p.id} className={card}>
                <div className="flex items-start gap-3">
                  <div className="w-20 shrink-0"><Thumb url={p.previewUrl} kind={p.mediaType === "REEL" ? "video" : "image"} /></div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-bright">{MEDIA_LABEL[p.mediaType]}</p>
                    <p className="mt-1 text-[12.5px] text-white/80">{p.whenLabel}</p>
                  </div>
                </div>
                {editing === p.id ? (
                  <PostEditor post={p} onDone={() => { setEditing(null); router.refresh(); }} />
                ) : (
                  <p className="mt-3 line-clamp-6 whitespace-pre-wrap text-[13px] leading-relaxed text-white/85">{p.caption}</p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" disabled={pending || !canPost} onClick={() => run(() => approvePostsAction([p.id]))} className={primary}>Approve</button>
                  <button type="button" onClick={() => setEditing(editing === p.id ? null : p.id)} className={secondary}>{editing === p.id ? "Close" : "Edit"}</button>
                  <button type="button" disabled={pending} onClick={() => run(() => discardPostAction(p.id))} className={secondary}>Discard</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Make a post */}
      <section className={card}>
        <h2 className="text-[16px] font-semibold text-white">Make a post</h2>
        <div role="tablist" aria-label="Post type" className="mt-3 inline-flex rounded-full border border-white/10 bg-white/[0.03] p-1">
          {(["IMAGE", "CAROUSEL", "REEL"] as MediaType[]).map((t) => (
            <button key={t} role="tab" aria-selected={t === type} onClick={() => switchType(t)}
              className={`rounded-full px-4 py-1.5 text-[13px] ${t === type ? "bg-[#7c5cff] text-white" : "text-white/65 hover:text-white"}`}>
              {MEDIA_LABEL[t]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[12.5px] text-faint">
          {type === "CAROUSEL" ? `Pick 2–${CAROUSEL_MAX} pictures, in the order they should appear.` : type === "REEL" ? "Pick a video you uploaded for a campaign." : "Pick one picture."}
        </p>

        {choices.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-white/12 px-4 py-6 text-center text-[13px] text-muted">
            {kind === "video" ? "No videos yet — upload one in a campaign and it appears here." : "No pictures yet — make one in Creative Studio or approve one in Creatives."}
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
            {choices.map((m) => {
              const at = picked.indexOf(m.ref);
              return (
                <button key={m.ref} type="button" onClick={() => toggle(m)} title={m.label}
                  className={`relative rounded-xl border-2 p-0.5 transition ${at >= 0 ? "border-violet-400" : "border-transparent hover:border-white/20"}`}>
                  <Thumb url={m.previewUrl} kind={m.kind} />
                  {at >= 0 && (
                    <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-violet-500 text-[11px] font-semibold text-white">
                      {type === "CAROUSEL" ? at + 1 : "✓"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <label className="mt-4 block">
          <span className="text-[13px] text-white">Caption</span>
          <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={5} maxLength={CAPTION_MAX} className={`${input} mt-1.5`} placeholder="What should the post say?" />
          <span className="mt-1 block text-right text-[11.5px] text-faint">{caption.length} / {CAPTION_MAX}</span>
        </label>

        <div className="mt-2 flex flex-wrap items-center gap-4 text-[13.5px]">
          <label className="flex items-center gap-2"><input type="radio" checked={mode === "schedule"} onChange={() => setMode("schedule")} className="accent-[#7c5cff]" /> Schedule</label>
          <label className="flex items-center gap-2"><input type="radio" checked={mode === "now"} onChange={() => setMode("now")} className="accent-[#7c5cff]" /> Post now</label>
          {mode === "schedule" && (
            <span className="flex items-center gap-2">
              <input type="datetime-local" value={local} onChange={(e) => setLocal(e.target.value)} className={`${input} w-auto`} aria-label="When to post" />
              <span className="text-[12px] text-faint">{timeZoneLabel}</span>
            </span>
          )}
        </div>

        <button type="button" disabled={pending || !canPost || picked.length === 0 || !caption.trim() || (mode === "schedule" && !local)}
          onClick={() => run(async () => {
            const r = await createPostAction({ mediaType: type, refs: picked, caption, local: mode === "schedule" ? local : null });
            if (r.ok) { setPicked([]); setCaption(""); setLocal(""); }
            return r;
          })}
          className={`${primary} mt-4`}>
          {pending ? "Working…" : mode === "now" ? "Post to Instagram now" : "Schedule post"}
        </button>
      </section>

      {upcoming.length > 0 && (
        <section>
          <h2 className="mb-3 text-[16px] font-semibold text-white">Scheduled</h2>
          <ul className="space-y-3">
            {upcoming.map((p) => (
              <li key={p.id} className={card}>
                <div className="flex items-start gap-4">
                  <div className="w-16 shrink-0"><Thumb url={p.previewUrl} kind={p.mediaType === "REEL" ? "video" : "image"} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-violet-bright">
                      {MEDIA_LABEL[p.mediaType]} · {p.status === "CREATED" ? "Processing on Instagram" : p.whenLabel}
                    </p>
                    {editing === p.id ? (
                      <PostEditor post={p} onDone={() => { setEditing(null); router.refresh(); }} />
                    ) : (
                      <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[13px] text-white/85">{p.caption}</p>
                    )}
                    {p.error && <p className="mt-1.5 text-[12px] text-amber-200/90">{p.error}</p>}
                  </div>
                  {p.status === "SCHEDULED" && (
                    <div className="flex shrink-0 flex-col gap-2">
                      <button type="button" onClick={() => setEditing(editing === p.id ? null : p.id)} className={secondary}>{editing === p.id ? "Close" : "Edit"}</button>
                      <button type="button" disabled={pending} onClick={() => run(() => discardPostAction(p.id))} className={secondary}>Cancel</button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
