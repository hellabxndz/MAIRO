"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { approvePostsAction, discardPostAction, updatePostAction } from "@/lib/actions/social-actions";
import { attachMediaAction } from "@/lib/actions/social-manager-actions";
import { CAROUSEL_MAX, captionMax, mediaLabel, type MediaType } from "@/lib/instagram/social-logic";
import type { MediaItem } from "@/lib/instagram/library";
import { InstagramPreview } from "./instagram-preview";
import { FacebookPreview } from "./facebook-preview";
import type { CalendarPost } from "./manager-data";

// One Social Manager post, as a card: the preview, what it is and why MAIRO
// made it, and what the business can do with it right now.

type Result = { ok: true; message: string; permalink?: string | null } | { ok: false; error: string };

const primary = "min-h-[40px] rounded-lg bg-[#7c5cff] px-4 text-[13px] font-medium text-white transition hover:brightness-110 disabled:opacity-50";
const secondary = "min-h-[40px] rounded-lg border border-white/12 px-4 text-[13px] text-white/85 transition hover:border-white/30 disabled:opacity-50";
const input = "w-full rounded-lg border border-white/10 bg-[#0c1326] px-3 py-2 text-[14px] text-white outline-none placeholder:text-faint focus:border-violet/60";

export const TONE_CLASS: Record<CalendarPost["tone"], string> = {
  muted: "bg-white/[0.06] text-white/60",
  attention: "bg-amber-400/15 text-amber-200",
  info: "bg-sky-400/15 text-sky-200",
  good: "bg-emerald-400/15 text-emerald-300",
  bad: "bg-red-400/15 text-red-300",
};

export function StatusPill({ post }: { post: Pick<CalendarPost, "statusLabel" | "tone" | "autoApproved" | "status"> }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11.5px] font-medium ${TONE_CLASS[post.tone]}`}>
      {post.statusLabel}
      {post.autoApproved && post.status === "SCHEDULED" ? " · Autopilot" : ""}
    </span>
  );
}

export function PlatformMark({ network, className = "h-4 w-4" }: { network: CalendarPost["network"]; className?: string }) {
  return network === "FACEBOOK" ? (
    <svg viewBox="0 0 20 20" className={className} aria-label="Facebook" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="10" cy="10" r="7.5" />
      <path d="M11.2 17.4V11h2l.3-2.3h-2.3V7.4c0-.7.2-1.1 1.1-1.1h1.2V4.2" />
    </svg>
  ) : (
    <svg viewBox="0 0 20 20" className={className} aria-label="Instagram" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="3" y="3" width="14" height="14" rx="4" />
      <circle cx="10" cy="10" r="3.2" />
    </svg>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-faint">{label}</dt>
      <dd className="mt-0.5 truncate text-[13px] text-white/90">{children}</dd>
    </div>
  );
}

function Picker({ post, library, onDone }: { post: CalendarPost; library: MediaItem[]; onDone: (r: Result) => void }) {
  const [type, setType] = useState<MediaType>(post.mediaType);
  const [picked, setPicked] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const kind = type === "REEL" ? "video" : "image";
  const choices = library.filter((m) => m.kind === kind);
  return (
    <div className="mt-3 space-y-3 rounded-xl border border-white/10 p-3">
      <div className="flex flex-wrap gap-1.5">
        {(["IMAGE", "CAROUSEL", "REEL"] as MediaType[]).map((t) => (
          <button key={t} type="button" onClick={() => { setType(t); setPicked([]); }}
            className={`rounded-full px-3 py-1 text-[12px] ${t === type ? "bg-[#7c5cff] text-white" : "border border-white/12 text-white/70"}`}>
            {mediaLabel(t, post.network)}
          </button>
        ))}
      </div>
      {choices.length === 0 ? (
        <p className="text-[12.5px] text-muted">{kind === "video" ? "No videos yet — upload one in a campaign." : "No pictures yet — make one in Creative Studio or approve one in Creatives."}</p>
      ) : (
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
          {choices.map((m) => {
            const at = picked.indexOf(m.ref);
            return (
              <button key={m.ref} type="button" title={m.label}
                onClick={() => setPicked((p) => type === "CAROUSEL" ? (at >= 0 ? p.filter((r) => r !== m.ref) : p.length >= CAROUSEL_MAX ? p : [...p, m.ref]) : [m.ref])}
                className={`relative aspect-square overflow-hidden rounded-lg border-2 ${at >= 0 ? "border-violet-400" : "border-transparent"}`}>
                {m.previewUrl && <Image src={m.previewUrl} alt="" fill unoptimized sizes="90px" className="object-cover" />}
                {at >= 0 && <span className="absolute right-1 top-1 rounded-full bg-violet-500 px-1.5 text-[10px] text-white">{type === "CAROUSEL" ? at + 1 : "✓"}</span>}
              </button>
            );
          })}
        </div>
      )}
      <button type="button" disabled={pending || picked.length === 0} className={primary}
        onClick={() => start(async () => onDone(await attachMediaAction({ id: post.id, mediaType: type, refs: picked }).catch(() => ({ ok: false as const, error: "Something went wrong." }))))}>
        Use {picked.length > 1 ? "these" : "this"}
      </button>
    </div>
  );
}

export function PostCard({
  post,
  library,
  accountName,
  canPost,
  compact = false,
}: {
  post: CalendarPost;
  library: MediaItem[];
  /** @username on Instagram, Page name on Facebook. */
  accountName: string;
  /** Whether posting is possible right now (account ready, active Scale). */
  canPost: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Result | null>(null);
  const [mode, setMode] = useState<"none" | "edit" | "pick">("none");
  const [caption, setCaption] = useState(post.caption);
  const [local, setLocal] = useState(post.whenLocal);

  function run(fn: () => Promise<Result>) {
    setResult(null);
    start(async () => {
      const r = await fn().catch(() => ({ ok: false as const, error: "Something went wrong. Try again." }));
      setResult(r);
      if (r.ok) { setMode("none"); router.refresh(); }
    });
  }

  const hasMedia = post.status !== "DRAFT";
  const when = post.date ? `${new Date(`${post.date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}` : "When approved";

  return (
    <article className="min-w-0 rounded-2xl border border-white/[0.07] bg-[#0b1122]/80 p-4" aria-label={`${post.contentType} post`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[14.5px] font-semibold text-white">{post.contentType}</p>
          {post.step && post.promotionTitle && <p className="truncate text-[12px] text-violet-bright">{post.step} · {post.promotionTitle}</p>}
        </div>
        <StatusPill post={post} />
      </div>

      {!compact && hasMedia && (
        <div className="mb-3">
          {post.network === "FACEBOOK" ? (
            <FacebookPreview pageName={accountName} mediaType={post.mediaType} images={post.images} poster={post.previewUrl} text={post.caption} />
          ) : (
            <InstagramPreview username={accountName} mediaType={post.mediaType} images={post.images} poster={post.previewUrl} caption={post.caption} />
          )}
        </div>
      )}
      {(compact || !hasMedia) && (
        <div className="mb-3 flex gap-3">
          <span className="relative block h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-white/[0.05]">
            {post.previewUrl ? <Image src={post.previewUrl} alt="" fill unoptimized sizes="64px" className="object-cover" /> : <span className="flex h-full items-center justify-center text-[10px] text-faint">No creative yet</span>}
          </span>
          <p className="line-clamp-4 min-w-0 whitespace-pre-wrap text-[13px] text-white/80">{post.caption}</p>
        </div>
      )}
      {!hasMedia && post.creativeIdea && (
        <p className="mb-3 rounded-lg border border-dashed border-amber-400/30 bg-amber-400/[0.05] px-3 py-2 text-[12.5px] text-amber-100/90">
          <span className="font-medium">Creative needed: </span>{post.creativeIdea}
        </p>
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
        <Fact label="Content type">{mediaLabel(post.mediaType, post.network)}</Fact>
        <Fact label="Objective">{post.objective || "—"}</Fact>
        <Fact label="Platform">
          <span className="inline-flex items-center gap-1.5"><PlatformMark network={post.network} className="h-3.5 w-3.5" />{post.network === "FACEBOOK" ? "Facebook" : "Instagram"}</span>
        </Fact>
        <Fact label="Date">{when}</Fact>
        <Fact label="Time">{post.time || "—"}</Fact>
        {post.likes !== null && <Fact label="Results">{post.likes} likes · {post.comments ?? 0} comments</Fact>}
      </dl>

      {post.rationale && (
        <div className="mt-3 rounded-xl bg-violet/[0.08] px-3.5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-bright">Why MAIRO created this</p>
          <p className="mt-1 text-[13px] leading-relaxed text-white/85">{post.rationale}</p>
        </div>
      )}
      {post.error && post.status !== "PUBLISHED" && <p className="mt-2 text-[12px] text-amber-200/90">{post.error}</p>}

      {mode === "edit" && (
        <div className="mt-3 space-y-2">
          <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={6} maxLength={captionMax(post.network)} className={input} aria-label="Caption" />
          <input type="datetime-local" value={local} onChange={(e) => setLocal(e.target.value)} className={`${input} w-auto`} aria-label="When to post" />
          <div className="flex gap-2">
            <button type="button" disabled={pending} className={primary} onClick={() => run(() => updatePostAction({ id: post.id, caption, local: local || null }))}>Save</button>
            <button type="button" className={secondary} onClick={() => setMode("none")}>Cancel</button>
          </div>
        </div>
      )}
      {mode === "pick" && <Picker post={post} library={library} onDone={(r) => { setResult(r); if (r.ok) { setMode("none"); router.refresh(); } }} />}

      <div className="mt-3 flex flex-wrap gap-2">
        {post.status === "SUGGESTED" && (
          <>
            <button type="button" disabled={pending || !canPost} className={primary} onClick={() => run(() => approvePostsAction([post.id], "now"))}>Approve &amp; post now</button>
            {post.date && (
              <button type="button" disabled={pending || !canPost} className={secondary} onClick={() => run(() => approvePostsAction([post.id], "scheduled"))}>
                Approve for {when}{post.time ? `, ${post.time}` : ""}
              </button>
            )}
          </>
        )}
        {post.status === "DRAFT" && (
          <button type="button" disabled={pending} className={primary} onClick={() => setMode(mode === "pick" ? "none" : "pick")}>Add a picture or video</button>
        )}
        {["SUGGESTED", "DRAFT", "SCHEDULED"].includes(post.status) && (
          <>
            <button type="button" className={secondary} onClick={() => setMode(mode === "edit" ? "none" : "edit")}>Edit</button>
            <button type="button" disabled={pending} className={secondary} onClick={() => run(() => discardPostAction(post.id))}>
              {post.status === "SCHEDULED" ? "Cancel" : "Skip"}
            </button>
          </>
        )}
        {post.status === "PUBLISHED" && post.permalink && (
          <a href={post.permalink} target="_blank" rel="noopener noreferrer" className={`${secondary} inline-flex items-center`}>
            See it on {post.network === "FACEBOOK" ? "Facebook" : "Instagram"}
          </a>
        )}
      </div>
      {result && (
        <p className={`mt-2 rounded-lg px-3 py-2 text-[12.5px] ${result.ok ? "bg-emerald-400/10 text-emerald-300" : "bg-alert/10 text-alert"}`}>
          {result.ok ? result.message : result.error}
        </p>
      )}
    </article>
  );
}
