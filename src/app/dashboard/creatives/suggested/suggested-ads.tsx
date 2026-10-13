/* eslint-disable @next/next/no-img-element -- remote blob URLs */
"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { Modal } from "@/components/mairo/overlay";
import { actionClass, quietClass } from "@/components/mairo/action-styles";
import { checkVideo, VIDEO_TYPES, type MediaCheck } from "@/lib/campaigns/media-rules";
import { measureVideo } from "@/lib/media/measure-video";
import { PREVIEW_FORMATS } from "@/lib/meta/preview-formats";
import { usesAvoided } from "@/lib/suggested-ads/directions";
import { editsNotInFile } from "@/lib/suggested-ads/video";
import {
  approveCreativeAction,
  continueToCampaignAction,
  createAdImageAction,
  creditQuoteAction,
  refreshDirectionsAction,
  restoreDirectionAction,
  reviseDirectionAction,
  saveVideoAction,
  suggestedPreviewAction,
  type CreditQuote,
} from "@/lib/actions/suggested-ads-actions";
import type { listSuggestions, proposedTest } from "@/lib/suggested-ads/store";
import { VideoEditor } from "./video-editor";
import { PLACEMENTS, PlacementMock, type MockMedia, type Placement } from "./placements";

type Data = Awaited<ReturnType<typeof listSuggestions>>;
type Dir = Data["directions"][number];
type Test = Awaited<ReturnType<typeof proposedTest>>;
type Panel = { kind: "create" | "edit" | "video" | "review"; id: string } | null;

const CTA_CHOICES = ["Shop now", "Get a quote", "Book now", "Learn more", "Contact us", "Order now", "Sign up"];
const SOURCE: Record<string, string> = { template: "MAIRO's suggestion", owner: "Your edit", ai: "MAIRO's rewrite" };

export function SuggestedAds({ organizationId, data, test, paid, imagesAvailable, uploadsAvailable }: { organizationId: string; data: Data; test: Test; paid: boolean; imagesAvailable: boolean; uploadsAvailable: boolean }) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>(null);
  const [refreshing, startRefresh] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const current = panel ? data.directions.find((d) => d.id === panel.id) ?? null : null;
  const businessName = data.facts.businessName || "Your business";
  const close = () => setPanel(null);

  return (
    <div className="mx-auto max-w-[1180px]">
      <header className="mb-8 max-w-3xl">
        <p className="text-[12.5px] font-medium uppercase tracking-[0.08em] text-violet-bright">Your first ads</p>
        <h1 className="mt-1 text-[24px] font-semibold tracking-[-0.02em] text-white sm:text-[28px]">Review your suggested ads</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-white/85">{data.intro}</p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
          Built only from what you&apos;ve confirmed — no invented discounts, reviews or numbers.
          {data.unconfirmed.length > 0 && <> Not used until you confirm {data.unconfirmed.length === 1 ? "it" : "them"}: {data.unconfirmed.join(", ").toLowerCase()}.</>}{" "}
          <Link href="/dashboard/settings/business-brain" className="underline underline-offset-4 hover:text-white">Check what MAIRO knows</Link>
        </p>
      </header>

      {data.directions.length === 0 ? (
        <div className="rounded-[var(--radius-panel)] border border-dashed p-8 text-center" style={{ borderColor: "var(--mairo-line)" }}>
          <p className="text-[15px] font-medium text-white">MAIRO needs a little more before it can suggest ads</p>
          <p className="mx-auto mt-2 max-w-md text-[13px] text-muted">Confirm what you sell and who it&apos;s for in your Business Brain, then come back.</p>
          <Link href="/dashboard/settings/business-brain" className={`${actionClass} mt-4`}>Open your Business Brain</Link>
        </div>
      ) : (
        <ol className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Suggested ads">
          {data.directions.map((d) => (
            <DirectionCard key={d.id} d={d} onOpen={(kind) => setPanel({ kind, id: d.id })} />
          ))}
        </ol>
      )}

      {data.missing.length > 0 && data.directions.length > 0 && (
        <aside className="mt-6 rounded-2xl border px-5 py-4" style={{ borderColor: "var(--mairo-line)" }}>
          <p className="text-[13.5px] font-medium text-white">Tell MAIRO more to get other kinds of ad</p>
          <ul className="mt-2 space-y-1">
            {data.missing.map((m) => (
              <li key={m.fact} className="text-[12.5px] text-muted"><span className="text-white/85">{m.fact}</span> — gives {m.gives}.</li>
            ))}
          </ul>
          <Link href="/dashboard/settings/business-brain" className="mt-3 inline-block text-[12.5px] text-violet-bright underline-offset-4 hover:underline">Add them in your Business Brain</Link>
        </aside>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={refreshing}
          onClick={() => {
            if (!window.confirm("Suggest three new directions from what you've confirmed today? The ones you haven't approved are set aside; approved ones stay.")) return;
            startRefresh(async () => {
              const r = await refreshDirectionsAction();
              setNotice(r.ok ? (r.created ? "Three new directions, from what you've confirmed today." : "Your approved directions stay; nothing new to add yet.") : r.error);
              router.refresh();
            });
          }}
          className={quietClass}
        >
          {refreshing ? "Suggesting…" : "Suggest new directions"}
        </button>
        {notice && <p role="status" className="text-[12.5px] text-muted">{notice}</p>}
      </div>

      <Learn test={test} approved={data.directions.filter((d) => d.approval?.state === "current").length} />

      {current && panel?.kind === "create" && (
        <CreateDialog d={current} paid={paid} available={imagesAvailable} onClose={close} onMade={() => setPanel({ kind: "review", id: current.id })} onVideo={() => setPanel({ kind: "video", id: current.id })} />
      )}
      {current && panel?.kind === "edit" && <EditDialog d={current} avoid={data.facts.avoid} onClose={close} />}
      {current && panel?.kind === "video" && (
        <VideoDialog d={current} organizationId={organizationId} paid={paid} available={uploadsAvailable} onClose={close} onReview={() => setPanel({ kind: "review", id: current.id })} />
      )}
      {current && panel?.kind === "review" && <ReviewDialog d={current} businessName={businessName} paid={paid} onClose={close} />}
    </div>
  );
}

// --- A direction ------------------------------------------------------------------

function latestImage(d: Dir) {
  return d.images.find((i) => i.state === "ready" && i.url) ?? null;
}

function DirectionCard({ d, onOpen }: { d: Dir; onOpen: (kind: "create" | "edit" | "video" | "review") => void }) {
  const img = latestImage(d);
  const vid = d.videos[0] ?? null;
  const failed = !img && d.images.find((i) => i.state === "failed");
  const hasMedia = Boolean(img || vid);
  const titleId = `dir-${d.id}`;
  return (
    <li className={`flex flex-col overflow-hidden rounded-[22px] border ${d.recommended ? "border-violet/50" : ""}`} style={{ borderColor: d.recommended ? undefined : "var(--mairo-line)", background: "linear-gradient(180deg, rgba(var(--mairo-fg-rgb),0.035), rgba(var(--mairo-fg-rgb),0.015))" }} aria-labelledby={titleId}>
      {/* Shorter on a phone while there's nothing to show yet. */}
      <div className={`relative w-full ${hasMedia ? "aspect-[4/5]" : "aspect-[4/3] sm:aspect-[4/5]"}`}>
        {img?.url ? (
          <img src={img.url} alt={`The picture for “${d.title}”`} className="h-full w-full object-cover" />
        ) : vid?.posterUrl ? (
          <>
            <img src={vid.posterUrl} alt={`A still from your video for “${d.title}”`} className="h-full w-full object-cover" />
            <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-[#fff]">▶ Your video</span>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center" style={{ background: "radial-gradient(90% 70% at 50% 35%, rgba(124,92,255,0.14), transparent 70%), rgba(var(--mairo-fg-rgb),0.025)" }}>
            <p className="text-[15px] font-semibold leading-snug text-white">“{d.words?.hook}”</p>
            <p className="text-[12px] text-muted">{failed ? "The last picture couldn't be made — no credits were used." : "No picture yet"}</p>
          </div>
        )}
        {d.recommended && <span className="absolute right-3 top-3 rounded-full bg-[image:var(--mairo-ramp)] px-2.5 py-1 text-[11.5px] font-medium text-[#fff]">Recommended first test</span>}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <p className="text-[12px] text-muted">{d.title}{d.format ? ` · best as ${d.format.toLowerCase()}` : ""}</p>
        <h2 id={titleId} className="mt-1 text-[17px] font-semibold leading-snug text-white">{d.words?.hook}</h2>
        {d.words?.body && <p className="mt-2 text-[13.5px] leading-relaxed text-white/80">{d.words.body}</p>}
        <p className="mt-3"><span className="rounded-md bg-white/[0.08] px-2.5 py-1 text-[12px] font-medium text-white/90">{d.words?.cta}</span></p>
        {d.recommended && d.recommendedWhy && <p className="mt-3 rounded-xl bg-violet/[0.08] px-3 py-2 text-[12.5px] leading-relaxed text-white/85"><span className="text-violet-bright">Why test this first: </span>{d.recommendedWhy}</p>}
        {d.words?.why && (
          <details className="mt-3">
            <summary className="cursor-pointer text-[12.5px] text-muted hover:text-white">Why this direction</summary>
            <p className="mt-1 text-[12.5px] leading-relaxed text-white/80">{d.words.why}</p>
          </details>
        )}
        {d.words && d.words.version > 1 && <p className="mt-2 text-[11.5px] text-faint">Version {d.words.version} · {SOURCE[d.words.source] ?? d.words.source}</p>}

        {d.approval?.state === "current" && <p className="mt-3 text-[12.5px] text-live">✓ Approved {new Date(d.approval.at).toLocaleDateString()} — ready for a campaign. Nothing is published.</p>}
        {d.approval?.state === "changed" && <p className="mt-3 text-[12.5px] text-warn">Changed since you approved it — review and approve again.</p>}

        <div className="mt-auto flex flex-wrap gap-2 pt-4">
          {hasMedia ? (
            <button type="button" onClick={() => onOpen("review")} className={actionClass}>{d.approval?.state === "current" ? "Review" : "Review and approve"}</button>
          ) : (
            <button type="button" onClick={() => onOpen("create")} className={actionClass}>Create this ad</button>
          )}
          <button type="button" onClick={() => onOpen("edit")} className={quietClass}>Change the direction</button>
          <button type="button" onClick={() => onOpen("video")} className={quietClass}>{vid ? "Edit my video" : "Use my video"}</button>
          {img && <button type="button" onClick={() => onOpen("create")} className="text-[12.5px] text-muted underline-offset-4 hover:text-white hover:underline">Make another picture</button>}
        </div>
      </div>
    </li>
  );
}

// --- Create: cost first, then the real picture --------------------------------

function CreateDialog({ d, paid, available, onClose, onMade, onVideo }: { d: Dir; paid: boolean; available: boolean; onClose: () => void; onMade: () => void; onVideo: () => void }) {
  const router = useRouter();
  const [quality, setQuality] = useState<"standard" | "premium">("standard");
  const [quote, setQuote] = useState<CreditQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [making, start] = useTransition();

  useEffect(() => {
    let live = true;
    creditQuoteAction(quality).then((q) => {
      if (live) setQuote(q);
    });
    return () => {
      live = false;
    };
  }, [quality]);

  const q = quote?.ok ? quote : null;
  const canMake = Boolean(q && q.available && !q.blocked && q.remaining >= q.cost);
  const make = () =>
    start(async () => {
      if (!q) return;
      setError(null);
      const r = await createAdImageAction(d.id, quality, q.cost);
      if (!r.ok) {
        setError(r.error);
        router.refresh();
        return;
      }
      router.refresh();
      onMade();
    });

  return (
    <Modal open onClose={making ? () => {} : onClose} title={`Create this ad: ${d.title}`}>
      <p className="text-[13.5px] leading-relaxed text-white/85">MAIRO makes one picture for “{d.words?.hook}”. The words stay separate, so the picture has no text in it. If people appear, they&apos;re not presented as your customers.</p>
      {!available ? (
        <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/[0.06] px-4 py-3 text-[13px] text-white/85">
          Making pictures isn&apos;t switched on for this deployment yet, so nothing can be made and nothing will be charged.
          <button type="button" onClick={onVideo} className="mt-2 block text-violet-bright underline-offset-4 hover:underline">Use your own video instead</button>
        </div>
      ) : !paid ? (
        <div className="mt-4 rounded-xl border px-4 py-3 text-[13px] text-white/85" style={{ borderColor: "var(--mairo-line)" }}>
          Making pictures is part of a MAIRO plan. You can still change the words now and make the picture after.
          <Link href="/plan/activate" className="mt-2 block text-violet-bright underline-offset-4 hover:underline">Choose a plan</Link>
        </div>
      ) : (
        <>
          <fieldset className="mt-4">
            <legend className="text-[13px] font-medium text-white">Quality</legend>
            <div className="mt-2 flex gap-2">
              {(["standard", "premium"] as const).map((v) => (
                <label key={v} className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-[13px] ${quality === v ? "border-white/70 bg-white/[0.08] text-white" : "border-[color:var(--mairo-line)] text-muted"}`}>
                  <input type="radio" name="quality" value={v} checked={quality === v} onChange={() => setQuality(v)} className="sr-only" />
                  {v === "standard" ? "Standard" : "Premium"}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="mt-4 rounded-xl bg-white/[0.04] px-4 py-3 text-[13px]" aria-live="polite">
            {!quote ? (
              <p className="text-muted">Checking the cost…</p>
            ) : !quote.ok ? (
              <p className="text-warn">{quote.error}</p>
            ) : (
              <>
                <p className="text-white">This costs <strong>{quote.cost} AI credit{quote.cost === 1 ? "" : "s"}</strong>. You have {quote.remaining} of {quote.allowance} left this month.</p>
                <p className="mt-1 text-[12px] text-muted">Credits are used only if the picture is made. If it fails, they&apos;re returned.</p>
                {quote.blocked && <p className="mt-2 text-warn">{quote.blocked}</p>}
                {!quote.blocked && quote.remaining < quote.cost && <p className="mt-2 text-warn">That&apos;s more than you have left this month.</p>}
              </>
            )}
          </div>
          {error && <p role="alert" className="mt-3 text-[13px] text-warn">{error}</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" disabled={!canMake || making} onClick={make} className={`${actionClass} disabled:opacity-50`}>
              {making ? "Making your picture… up to a minute" : q ? `Make it — ${q.cost} credit${q.cost === 1 ? "" : "s"}` : "Make it"}
            </button>
            <button type="button" disabled={making} onClick={onClose} className={quietClass}>Cancel</button>
          </div>
        </>
      )}
    </Modal>
  );
}

// --- Change the direction: a new version of the words ----------------------------

function EditDialog({ d, avoid, onClose }: { d: Dir; avoid: string[]; onClose: () => void }) {
  const router = useRouter();
  const [hook, setHook] = useState(d.words?.hook ?? "");
  const [body, setBody] = useState(d.words?.body ?? "");
  const [cta, setCta] = useState(d.words?.cta ?? "Learn more");
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const avoided = usesAvoided(`${hook} ${body}`, avoid);
  const unchanged = hook === d.words?.hook && body === d.words?.body && cta === d.words?.cta;

  const save = () =>
    start(async () => {
      setError(null);
      const r = await reviseDirectionAction(d.id, { hook, body, cta });
      if (!r.ok) return setError(r.error);
      router.refresh();
      onClose();
    });
  const restore = (version: number) =>
    start(async () => {
      const r = await restoreDirectionAction(d.id, version);
      if (!r.ok) return setError(r.error);
      router.refresh();
      onClose();
    });

  return (
    <Modal open onClose={onClose} title={`Change the direction: ${d.title}`}>
      <div className="space-y-4">
        <label className="block text-[13px] text-white">
          Opening line <span className="text-faint">({hook.length}/160)</span>
          <textarea value={hook} onChange={(e) => setHook(e.target.value)} rows={2} maxLength={160} className="mt-1 w-full rounded-xl border border-[color:var(--mairo-line)] bg-transparent px-3 py-2 text-[14px] text-white" />
        </label>
        <label className="block text-[13px] text-white">
          The rest of the text <span className="text-faint">({body.length}/600)</span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={600} className="mt-1 w-full rounded-xl border border-[color:var(--mairo-line)] bg-transparent px-3 py-2 text-[14px] text-white" />
        </label>
        <label className="block text-[13px] text-white">
          The button
          <select value={cta} onChange={(e) => setCta(e.target.value)} className="mt-1 w-full rounded-xl border border-[color:var(--mairo-line)] bg-[color:var(--mairo-bg)] px-3 py-2 text-[14px] text-white">
            {[...new Set([cta, ...CTA_CHOICES])].map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        {avoided && <p role="alert" className="text-[12.5px] text-warn">“{avoided}” is on your list of words to avoid.</p>}
        {error && <p role="alert" className="text-[12.5px] text-warn">{error}</p>}
        <p className="text-[12px] text-muted">Saving makes version {(d.words?.version ?? 0) + 1}. Earlier versions are kept{d.approval ? ", and you'll approve the new words before they're used" : ""}.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={saving || unchanged || Boolean(avoided)} onClick={save} className={`${actionClass} disabled:opacity-50`}>{saving ? "Saving…" : "Save the new version"}</button>
          <button type="button" onClick={onClose} className={quietClass}>Cancel</button>
        </div>
        {d.history.length > 1 && (
          <section aria-labelledby={`hist-${d.id}`} className="border-t pt-4" style={{ borderColor: "var(--mairo-line)" }}>
            <h3 id={`hist-${d.id}`} className="text-[13px] font-medium text-white">Earlier versions</h3>
            <ol className="mt-2 space-y-2">
              {d.history.map((h) => (
                <li key={h.version} className="flex items-start justify-between gap-3 text-[12.5px]">
                  <span className="text-white/80">v{h.version} · {SOURCE[h.source] ?? h.source}: “{h.hook}”</span>
                  {h.version !== d.words?.version && <button type="button" disabled={saving} onClick={() => restore(h.version)} className="shrink-0 text-violet-bright underline-offset-4 hover:underline">Use this</button>}
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </Modal>
  );
}

// --- Use my video ---------------------------------------------------------------

function VideoDialog({ d, organizationId, paid, available, onClose, onReview }: { d: Dir; organizationId: string; paid: boolean; available: boolean; onClose: () => void; onReview: () => void }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [check, setCheck] = useState<MediaCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [editing, setEditing] = useState(false);
  const video = d.videos[0] ?? null;

  async function choose(file: File) {
    setError(null);
    setCheck(null);
    let m;
    try {
      m = await measureVideo(file);
    } catch (e) {
      return setError(e instanceof Error ? e.message : "Couldn't read that video.");
    }
    const result = checkVideo({ type: file.type, bytes: file.size, ...m });
    setCheck(result);
    if (result.problems.length) return;
    try {
      setProgress(0);
      const base = `ad-media/${organizationId}`;
      const poster = await upload(`${base}/poster.jpg`, m.poster, { access: "public", handleUploadUrl: "/api/uploads/ad-media", contentType: "image/jpeg" });
      const uploaded = await upload(`${base}/video.${file.type === "video/quicktime" ? "mov" : "mp4"}`, file, {
        access: "public",
        handleUploadUrl: "/api/uploads/ad-media",
        contentType: file.type,
        multipart: file.size > 100 * 1024 * 1024,
        onUploadProgress: (p) => setProgress(Math.round(p.percentage)),
      });
      const r = await saveVideoAction({ angleId: d.id, url: uploaded.url, posterUrl: poster.url, name: file.name, type: file.type, durationSec: m.durationSec, width: m.width, height: m.height, bytes: file.size });
      setProgress(null);
      if (!r.ok) return setError(r.error);
      setReplacing(false);
      router.refresh();
    } catch (e) {
      setProgress(null);
      setError(e instanceof Error && e.message ? `The upload didn't finish: ${e.message}` : "The upload didn't finish. Try again.");
    }
  }

  const uploader = !available ? (
    <p className="rounded-xl border border-amber-300/30 bg-amber-300/[0.06] px-4 py-3 text-[13px] text-white/85">Video uploads aren&apos;t switched on for this deployment yet.</p>
  ) : !paid ? (
    <p className="rounded-xl border px-4 py-3 text-[13px] text-white/85" style={{ borderColor: "var(--mairo-line)" }}>Using your own video is part of a MAIRO plan. <Link href="/plan/activate" className="text-violet-bright underline-offset-4 hover:underline">Choose a plan</Link></p>
  ) : (
    <div className="space-y-3">
      <input ref={input} type="file" accept={VIDEO_TYPES.join(",")} className="hidden" onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void choose(f);
        }} />
      <button type="button" disabled={progress !== null} onClick={() => input.current?.click()} className="w-full rounded-xl border border-dashed p-8 text-center text-[13px] text-muted transition hover:text-white disabled:opacity-60" style={{ borderColor: "var(--mairo-line)" }}>
        {progress !== null ? `Uploading… ${progress}%` : "Choose a video — MP4 or MOV, up to 500MB"}
      </button>
      <p className="text-[11.5px] text-faint">Your file is kept exactly as uploaded. Every edit you make here is saved as a new version alongside it.</p>
      {error && <p role="alert" className="text-[12.5px] text-warn">{error}</p>}
      {check?.problems.map((p) => <p key={p} role="alert" className="text-[12.5px] text-warn">{p}</p>)}
      {check && !check.problems.length && check.warnings.map((w) => <p key={w} className="text-[12.5px] text-muted">{w}</p>)}
    </div>
  );

  return (
    <Modal open onClose={onClose} title={video ? `Your video for “${d.title}”` : `Use my video: ${d.title}`} wide>
      {video && !replacing ? (
        <>
          <VideoEditor key={`${video.videoId}-${video.version}`} video={video} words={{ hook: d.words?.hook ?? "", cta: d.words?.cta ?? "" }} onBusy={setEditing} />
          <div className="mt-6 flex flex-wrap items-center gap-2 border-t pt-4" style={{ borderColor: "var(--mairo-line)" }}>
            <button type="button" onClick={onReview} disabled={editing} className={`${actionClass} disabled:opacity-50`}>Review and approve</button>
            <button type="button" onClick={() => setReplacing(true)} className={quietClass}>Upload a different video</button>
            {editing && <p className="text-[12px] text-muted">Save or discard your edits first.</p>}
          </div>
        </>
      ) : (
        uploader
      )}
    </Modal>
  );
}

// --- Final review: placements, then approval of exactly this version -------------

type Choice = { kind: "image"; versionId: string; url: string } | { kind: "video"; revisionId: string };

function ReviewDialog({ d, businessName, paid, onClose }: { d: Dir; businessName: string; paid: boolean; onClose: () => void }) {
  const router = useRouter();
  const ready = d.images.filter((i) => i.state === "ready" && i.url && i.versionId);
  const vid = d.videos[0] ?? null;
  const choices: Choice[] = [
    ...ready.map((i) => ({ kind: "image" as const, versionId: i.versionId!, url: i.url! })),
    ...(vid?.revisionId ? [{ kind: "video" as const, revisionId: vid.revisionId }] : []),
  ];
  const approvedKey = d.approval?.studioVersionId ?? d.approval?.videoRevisionId ?? null;
  const [pick, setPick] = useState<string | null>(approvedKey && choices.some((c) => keyOf(c) === approvedKey) ? approvedKey : choices[0] ? keyOf(choices[0]) : null);
  const [placement, setPlacement] = useState<Placement>("feed");
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const [meta, setMeta] = useState<{ format: string; src: string | null; error: string | null; loading: boolean } | null>(null);
  const choice = choices.find((c) => keyOf(c) === pick) ?? null;
  const words = d.words!;
  const unrendered = choice?.kind === "video" && vid ? editsNotInFile(vid.edits) : [];
  const media: MockMedia = !choice ? { kind: "none" } : choice.kind === "image" ? { kind: "image", url: choice.url } : { kind: "video", posterUrl: vid?.posterUrl ?? null, aspect: vid?.edits.aspect ?? "original", firstCaption: vid?.edits.captions[0] ?? null };
  const alreadyCurrent = d.approval?.state === "current" && approvedKey === pick;

  const approve = () =>
    start(async () => {
      if (!choice) return;
      setError(null);
      if (!alreadyCurrent) {
        const r = await approveCreativeAction({ angleId: d.id, revisionId: words.revisionId, studioVersionId: choice.kind === "image" ? choice.versionId : null, videoRevisionId: choice.kind === "video" ? choice.revisionId : null });
        if (!r.ok) return setError(r.error);
      }
      if (!paid) {
        setDone("Approved. Choose a plan to build a campaign with it — nothing has been published.");
        router.refresh();
        return;
      }
      const c = await continueToCampaignAction(d.id);
      if (!c.ok) {
        setDone(null);
        setError(`Approved, but the campaign couldn't be started: ${c.error}`);
        router.refresh();
        return;
      }
      router.push(c.href);
    });

  const metaPreview = (format: string) => {
    if (!choice || choice.kind !== "image") return;
    setMeta({ format, src: null, error: null, loading: true });
    suggestedPreviewAction(d.id, choice.versionId, format).then((r) => setMeta({ format, src: r.ok ? r.src : null, error: r.ok ? null : r.error, loading: false }));
  };

  return (
    <Modal open onClose={busy ? () => {} : onClose} title={`Review: ${d.title}`} wide>
      {choices.length === 0 ? (
        <p className="text-[13.5px] text-muted">Make the picture or add your video first.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <div role="tablist" aria-label="Where the ad shows" className="flex gap-1">
              {PLACEMENTS.map((p) => (
                <button key={p.id} role="tab" type="button" aria-selected={placement === p.id} onClick={() => setPlacement(p.id)} className={`rounded-full px-3.5 py-1.5 text-[13px] ${placement === p.id ? "bg-white/[0.1] text-white" : "text-muted hover:text-white"}`}>{p.label}</button>
              ))}
            </div>
            <div role="tabpanel" className="mt-4">
              <PlacementMock placement={placement} media={media} words={words} businessName={businessName} />
              <p className="mt-2 text-center text-[11.5px] text-faint">MAIRO&apos;s mock-up of the layout{placement === "reels" ? " — the dashed area is covered by Reels' text and buttons" : ""}.</p>
            </div>
            {choice?.kind === "image" && (
              <div className="mt-5">
                <p className="text-[12.5px] text-muted">Meta&apos;s own preview — drawn by Meta, nothing is created in your ad account:</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {PREVIEW_FORMATS.map((f) => (
                    <button key={f.value} type="button" onClick={() => metaPreview(f.value)} aria-pressed={meta?.format === f.value} className={`rounded-full border px-3 py-1 text-[12px] ${meta?.format === f.value ? "border-white/70 text-white" : "border-[color:var(--mairo-line)] text-muted hover:text-white"}`}>{f.label}</button>
                  ))}
                </div>
                {meta?.loading && <p className="mt-2 text-[12.5px] text-muted">Asking Meta…</p>}
                {meta?.error && <p className="mt-2 text-[12.5px] text-warn">{meta.error}</p>}
                {meta?.src && <iframe src={meta.src} title="Meta's preview of this ad" className="mt-3 h-[560px] w-full max-w-[380px] rounded-xl border-0 bg-white" />}
              </div>
            )}
          </div>

          <div>
            {choices.length > 1 && (
              <fieldset>
                <legend className="text-[13px] font-medium text-white">Which goes with these words</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {choices.map((c, i) => (
                    <label key={keyOf(c)} className={`cursor-pointer overflow-hidden rounded-xl border-2 ${pick === keyOf(c) ? "border-white/80" : "border-transparent"}`}>
                      <input type="radio" name={`media-${d.id}`} checked={pick === keyOf(c)} onChange={() => setPick(keyOf(c))} className="sr-only" />
                      {c.kind === "image" ? <img src={c.url} alt={`Picture ${ready.length - i}`} className="h-20 w-16 object-cover" /> : <span className="flex h-20 w-16 items-center justify-center bg-black text-[11px] text-[#fff]">▶ Video v{vid?.version}</span>}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <dl className="mt-4 space-y-2 rounded-xl bg-white/[0.04] px-4 py-3 text-[12.5px]">
              <div className="flex gap-2"><dt className="w-24 shrink-0 text-muted">Words</dt><dd className="text-white/90">Version {words.version} · “{words.hook}”</dd></div>
              <div className="flex gap-2"><dt className="w-24 shrink-0 text-muted">{choice?.kind === "video" ? "Video" : "Picture"}</dt><dd className="text-white/90">{choice?.kind === "video" ? `Your video, edit version ${vid?.version}` : `Picture version ${ready.find((r) => r.versionId === pick)?.version ?? 1}`}</dd></div>
              <div className="flex gap-2"><dt className="w-24 shrink-0 text-muted">Button</dt><dd className="text-white/90">{words.cta}</dd></div>
            </dl>
            <p className="mt-3 text-[12px] leading-relaxed text-muted">Approval is for exactly these versions. If the words, picture or video change, MAIRO asks you to approve again before they&apos;re used.</p>

            {unrendered.length > 0 && (
              <label className="mt-4 flex items-start gap-2 rounded-xl border border-amber-300/30 bg-amber-300/[0.06] px-3.5 py-3 text-[12.5px] leading-relaxed text-white/85">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />
                <span>I understand the ad plays my original video, without {listOf(unrendered)} — MAIRO can only preview edits here for now.</span>
              </label>
            )}

            {error && <p role="alert" className="mt-3 text-[13px] text-warn">{error}</p>}
            {done && <p role="status" className="mt-3 text-[13px] text-live">{done}</p>}
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" disabled={busy || !choice || (unrendered.length > 0 && !ack) || Boolean(done)} onClick={approve} className={`${actionClass} disabled:opacity-50`}>
                {busy ? "Saving…" : paid ? (alreadyCurrent ? "Continue to the campaign" : "Approve creative and continue") : "Approve creative"}
              </button>
              {done && !paid && <Link href="/plan/activate" className={quietClass}>Choose a plan</Link>}
              <button type="button" disabled={busy} onClick={onClose} className={quietClass}>Not yet</button>
            </div>
            {paid && <p className="mt-2 text-[11.5px] text-faint">Continue opens the campaign builder with this ad. Nothing is published or spent until you launch it there.</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}

const listOf = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const keyOf = (c: Choice) => (c.kind === "image" ? c.versionId : c.revisionId);

// --- Learning from results ----------------------------------------------------------

function Learn({ test, approved }: { test: Test; approved: number }) {
  return (
    <section aria-labelledby="learn-h" className="mt-10 rounded-[var(--radius-panel)] border px-6 py-5" style={{ borderColor: "var(--mairo-line)" }}>
      <h2 id="learn-h" className="text-[16px] font-semibold text-white">How MAIRO learns which works</h2>
      {test ? (
        <>
          <p className="mt-2 text-[13.5px] text-white/85">{test.hypothesis}</p>
          <ul className="mt-2 flex flex-wrap gap-2">{test.variants.map((v) => <li key={v.label} className="rounded-full bg-white/[0.06] px-3 py-1 text-[12.5px] text-white/85">{v.label}</li>)}</ul>
          <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
            {test.status === "CONCLUDED" && test.conclusion
              ? test.conclusion
              : "Written down, not running: MAIRO doesn't start tests by itself. To run it, launch these ads with the same budget and audience. Each ad's results then show under Top Performing in Creatives, ranked by your goal — and a difference only counts once there are enough results to tell them apart."}
          </p>
          <Link href="/dashboard/creatives?tab=top" className="mt-2 inline-block text-[12.5px] text-violet-bright underline-offset-4 hover:underline">See Top Performing</Link>
        </>
      ) : (
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          {approved === 1 ? "One approved. " : ""}Approve two directions and MAIRO writes down a fair test between them: same budget and audience, one difference — the opening. Once the ads run, Top Performing in Creatives ranks them by your goal, never by likes.
        </p>
      )}
    </section>
  );
}
