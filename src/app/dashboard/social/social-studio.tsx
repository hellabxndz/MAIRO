"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import {
  enableNetworkAction,
  approvePostsAction,
  createPostAction,
  discardPostAction,
  planWeekAction,
  updatePostAction,
  type SocialResult,
} from "@/lib/actions/social-actions";
import { InstagramPreview } from "./instagram-preview";
import { FacebookPreview } from "./facebook-preview";
import { CAROUSEL_MAX, captionMax, mediaLabel, type MediaType, type Network } from "@/lib/instagram/social-logic";
import type { MediaItem } from "@/lib/instagram/library";

// Scale's Instagram and Facebook posting: let MAIRO plan the week, or make a
// post yourself — a photo, a carousel (multi-photo on Facebook) or a Reel
// (video) — and post it now or schedule it. Nothing goes out until it's
// approved here, after seeing exactly how it will look.

export type PostView = {
  id: string;
  status: string;
  mediaType: MediaType;
  caption: string;
  previewUrl: string | null;
  whenLabel: string;
  whenLocal: string;
  error: string | null;
  /** Pictures as Instagram will receive them, for the preview. */
  images: string[];
  /** Whether a time was chosen (otherwise it posts once approved). */
  hasTime: boolean;
  suggestedByMairo: boolean;
  /** Social Manager: what kind of post, and why MAIRO made it. */
  contentType?: string | null;
  rationale?: string | null;
};

const card = "rounded-2xl border border-white/[0.07] bg-field/80 p-5";
const input = "w-full rounded-lg border border-white/10 bg-field-2 px-3 py-2 text-[14px] text-white outline-none placeholder:text-faint focus:border-violet/60";
const primary = "min-h-[42px] rounded-lg bg-[#7c5cff] px-4 text-[13.5px] font-medium text-white transition hover:brightness-110 disabled:opacity-50";
const secondary = "min-h-[42px] rounded-lg border border-white/12 px-4 text-[13.5px] text-white/85 transition hover:border-white/30 disabled:opacity-50";

function Thumb({ url, kind }: { url: string | null; kind: "image" | "video" }) {
  return (
    <span className="relative block aspect-square w-full overflow-hidden rounded-lg bg-white/[0.04]">
      {url ? <Image src={url} alt="" fill unoptimized sizes="160px" className="object-cover" /> : null}
      {kind === "video" && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-[11px] text-[#fff]">▶</span>
        </span>
      )}
    </span>
  );
}

function Notice({ result, network = "INSTAGRAM" }: { result: SocialResult | null; network?: Network }) {
  if (!result) return null;
  return result.ok ? (
    <p className="mt-3 rounded-lg bg-emerald-400/10 px-3 py-2 text-[13px] text-emerald-300">
      {result.message}
      {result.permalink && (
        <a href={result.permalink} target="_blank" rel="noopener noreferrer" className="ml-2 underline underline-offset-4">See it on {network === "FACEBOOK" ? "Facebook" : "Instagram"}</a>
      )}
    </p>
  ) : (
    <p className="mt-3 rounded-lg bg-alert/10 px-3 py-2 text-[13px] text-alert">{result.error}</p>
  );
}

function PostEditor({ post, onDone, network }: { post: PostView; onDone: () => void; network: Network }) {
  const [caption, setCaption] = useState(post.caption);
  const [local, setLocal] = useState(post.whenLocal);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<SocialResult | null>(null);
  return (
    <div className="mt-3 space-y-2">
      <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={5} maxLength={captionMax(network)} className={input} aria-label="Caption" />
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
  network,
  canAnswer,
  library,
  suggested,
  upcoming,
  canPost,
  timeZoneLabel,
  username,
  planState,
}: {
  network: Network;
  /** Whether the account is ready enough to say yes (posting may still need Facebook's OK). */
  canAnswer: boolean;
  library: MediaItem[];
  suggested: PostView[];
  upcoming: PostView[];
  canPost: boolean;
  timeZoneLabel: string;
  username: string;
  /** Goal-first: no plan until the business set a goal and chose this network. */
  planState: "no_goal" | "not_included" | "ready";
}) {
  const optedIn = planState === "ready";
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<SocialResult | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const [type, setType] = useState<MediaType>("IMAGE");
  const [picked, setPicked] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [mode, setMode] = useState<"now" | "schedule">("now");
  const [local, setLocal] = useState("");

  const facebook = network === "FACEBOOK";
  const where = facebook ? "Page" : "feed";
  const maxText = captionMax(network);
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
      {planState === "no_goal" ? (
        <div className="rounded-2xl border border-violet/35 bg-violet/[0.06] p-6">
          <p className="text-[19px] font-semibold text-white">Start with your goal</p>
          <p className="mt-2 max-w-[640px] text-[14px] leading-relaxed text-muted">
            MAIRO doesn&rsquo;t post for the sake of posting. Tell Social Manager what you want your business to accomplish, and every {facebook ? "Facebook" : "Instagram"} post it plans will work toward it.
          </p>
          <Link href="/dashboard/social" className={`${primary} mt-4 inline-flex items-center`}>Tell MAIRO your goal</Link>
        </div>
      ) : planState === "not_included" ? (
        <div className="rounded-2xl border border-violet/35 bg-violet/[0.06] p-6">
          <p className="text-[19px] font-semibold text-white">{facebook ? "Let MAIRO post on your Facebook Page?" : "Let MAIRO post on your Instagram feed?"}</p>
          <p className="mt-2 max-w-[640px] text-[14px] leading-relaxed text-muted">
            MAIRO plans posts for your goal from your approved pictures and videos, writes the {facebook ? "text" : "captions"}, and shows you exactly how each one will look on your {where}. Nothing is posted until you approve it.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={pending || !canAnswer} onClick={() => run(() => enableNetworkAction(network))} className={primary}>
              {pending ? "Planning your first posts…" : "Yes, let MAIRO post"}
            </button>
          </div>
          {!canAnswer && <p className="mt-3 text-[12.5px] text-amber-200/90">{facebook ? "Your Facebook Page" : "Your Instagram"} needs to be ready first — see above.</p>}
        </div>
      ) : (
        <div className={`${card} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}>
          <div>
            <p className="text-[15px] font-semibold text-white">MAIRO plans your posts for your goal</p>
            <p className="mt-1 text-[13px] text-muted">MAIRO picks from your approved pictures and videos, writes the captions and suggests times. Every post says why it was made. See the whole plan in the <Link href="/dashboard/social/calendar" className="underline underline-offset-4">Content Calendar</Link>.</p>
          </div>
          <button type="button" disabled={pending || !canAnswer} onClick={() => run(() => planWeekAction(network))} className={`${primary} shrink-0`}>
            {pending ? "Working…" : "Plan my week"}
          </button>
        </div>
      )}
      <Notice result={result} network={network} />

      {suggested.length > 0 && (
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-semibold text-white">Waiting for your approval</h2>
              <p className="text-[12.5px] text-muted">This is exactly how each post will look on your {where}.{!canPost && facebook ? " Allow posting on Facebook (above) to approve them." : ""}</p>
            </div>
            {suggested.length > 1 && (
              <button type="button" disabled={pending || !canPost} onClick={() => run(() => approvePostsAction(suggested.map((s) => s.id), "scheduled"))} className={secondary}>
                Approve all at their times
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {suggested.map((p) => (
              <div key={p.id} className="min-w-0">
                {facebook ? (
                  <FacebookPreview pageName={username} mediaType={p.mediaType} images={p.images} poster={p.previewUrl} text={p.caption} />
                ) : (
                  <InstagramPreview username={username} mediaType={p.mediaType} images={p.images} poster={p.previewUrl} caption={p.caption} />
                )}
                <p className="mt-2 text-[12.5px] text-muted">
                  {p.suggestedByMairo ? `${p.contentType ?? "MAIRO suggests"} · posting` : "Your post —"} {p.hasTime ? p.whenLabel : "as soon as you approve"}
                </p>
                {p.rationale && p.suggestedByMairo && (
                  <p className="mt-1.5 rounded-lg bg-violet/[0.08] px-3 py-2 text-[12.5px] leading-relaxed text-white/85">
                    <span className="font-semibold text-violet-bright">Why MAIRO created this: </span>{p.rationale}
                  </p>
                )}
                {editing === p.id && <PostEditor network={network} post={p} onDone={() => { setEditing(null); router.refresh(); }} />}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" disabled={pending || !canPost} onClick={() => run(() => approvePostsAction([p.id], "now"))} className={primary}>
                    Approve &amp; post now
                  </button>
                  {p.hasTime && (
                    <button type="button" disabled={pending || !canPost} onClick={() => run(() => approvePostsAction([p.id], "scheduled"))} className={secondary}>
                      Approve for {p.whenLabel.replace(/ [A-Z]{2,5}$/, "")}
                    </button>
                  )}
                  <button type="button" onClick={() => setEditing(editing === p.id ? null : p.id)} className={secondary}>{editing === p.id ? "Close" : "Edit"}</button>
                  <button type="button" disabled={pending} onClick={() => run(() => discardPostAction(p.id))} className={secondary}>Discard</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Make a post */}
      {optedIn && <section className={card}>
        <h2 className="text-[16px] font-semibold text-white">Make a post</h2>
        <div role="tablist" aria-label="Post type" className="mt-3 inline-flex rounded-full border border-white/10 bg-white/[0.03] p-1">
          {(["IMAGE", "CAROUSEL", "REEL"] as MediaType[]).map((t) => (
            <button key={t} role="tab" aria-selected={t === type} onClick={() => switchType(t)}
              className={`rounded-full px-4 py-1.5 text-[13px] ${t === type ? "bg-[#7c5cff] text-white" : "text-white/65 hover:text-white"}`}>
              {mediaLabel(t, network)}
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
          <span className="text-[13px] text-white">{facebook ? "Post text" : "Caption"}</span>
          <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={5} maxLength={maxText} className={`${input} mt-1.5`} placeholder="What should the post say?" />
          <span className="mt-1 block text-right text-[11.5px] text-faint">{caption.length} / {maxText}</span>
        </label>

        <div className="mt-2 flex flex-wrap items-center gap-4 text-[13.5px]">
          <label className="flex items-center gap-2"><input type="radio" checked={mode === "now"} onChange={() => setMode("now")} className="accent-[#7c5cff]" /> Post as soon as I approve it</label>
          <label className="flex items-center gap-2"><input type="radio" checked={mode === "schedule"} onChange={() => setMode("schedule")} className="accent-[#7c5cff]" /> Schedule for</label>
          {mode === "schedule" && (
            <span className="flex items-center gap-2">
              <input type="datetime-local" value={local} onChange={(e) => setLocal(e.target.value)} className={`${input} w-auto`} aria-label="When to post" />
              <span className="text-[12px] text-faint">{timeZoneLabel}</span>
            </span>
          )}
        </div>

        <button type="button" disabled={pending || !canPost || picked.length === 0 || !caption.trim() || (mode === "schedule" && !local)}
          onClick={() => run(async () => {
            const r = await createPostAction({ network, mediaType: type, refs: picked, caption, local: mode === "schedule" ? local : null });
            if (r.ok) { setPicked([]); setCaption(""); setLocal(""); window.scrollTo({ top: 0, behavior: "smooth" }); }
            return r;
          })}
          className={`${primary} mt-4`}>
          {pending ? "Working…" : "Preview post"}
        </button>
        <p className="mt-2 text-[12px] text-faint">You&rsquo;ll see exactly how it looks on your {where} before anything is posted.</p>
      </section>}

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
                      {mediaLabel(p.mediaType, network)} · {p.status === "CREATED" ? `Processing on ${facebook ? "Facebook" : "Instagram"}` : p.whenLabel}
                    </p>
                    {editing === p.id ? (
                      <PostEditor network={network} post={p} onDone={() => { setEditing(null); router.refresh(); }} />
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
