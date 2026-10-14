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
import { usesAvoided } from "@/lib/suggested-ads/directions";
import { brandCheck, type BrandRules } from "@/lib/brain/brand-check";
import { REWRITE_CHIPS } from "@/lib/creative/rewrite-rules";
import {
  bringBackDirectionAction,
  createAdImageAction,
  creditQuoteAction,
  refreshDirectionsAction,
  rejectDirectionAction,
  restoreDirectionAction,
  reviseDirectionAction,
  rewriteWordsAction,
  saveVideoAction,
  type CreditQuote,
} from "@/lib/actions/suggested-ads-actions";
import type { listSuggestions } from "@/lib/suggested-ads/store";
import type { ExperimentView } from "@/lib/experiments/store";
import { ExperimentPanel } from "./experiment-panel";
import { VideoEditor } from "./video-editor";
import { ReviewDialog } from "./review-dialog";
import { ReadinessChip, adReadiness, type TrackingFacts } from "./readiness-panel";

type Data = Awaited<ReturnType<typeof listSuggestions>>;
type Dir = Data["directions"][number];
type Test = ExperimentView | null;
type Panel = { kind: "create" | "edit" | "video" | "review" | "reject"; id: string } | null;

const CTA_CHOICES = ["Shop now", "Get a quote", "Book now", "Learn more", "Contact us", "Order now", "Sign up"];
const SOURCE: Record<string, string> = { template: "MAIRO's suggestion", owner: "Your edit", ai: "MAIRO's rewrite", fix: "MAIRO's fix" };

export function SuggestedAds({ organizationId, data, test, paid, imagesAvailable, uploadsAvailable, rewriteAvailable, rendering }: { organizationId: string; data: Data; test: Test; paid: boolean; imagesAvailable: boolean; uploadsAvailable: boolean; rewriteAvailable: boolean; rendering: { ok: boolean; reason: string | null } }) {
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
          Each is a hypothesis to test, not a promise of results. Built only from what you&apos;ve confirmed — no invented discounts, reviews or numbers.
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
            <DirectionCard key={d.id} d={d} readiness={adReadiness({ words: d.words ?? { hook: "", body: "", cta: "" }, facts: data.facts, brand: data.brand, media: latestImage(d) ? "image" : d.videos[0] ? "video" : "none", video: latestImage(d) ? null : d.videos[0] ?? null, tracking: data.tracking })} onOpen={(kind) => setPanel({ kind, id: d.id })} />
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

      {data.rejected.length > 0 && <Rejected items={data.rejected} onNotice={setNotice} />}

      <ExperimentPanel test={test} approved={data.directions.filter((d) => d.approval?.state === "current").length} paid={paid} />

      {current && panel?.kind === "create" && (
        <CreateDialog d={current} paid={paid} available={imagesAvailable} onClose={close} onMade={() => setPanel({ kind: "review", id: current.id })} onVideo={() => setPanel({ kind: "video", id: current.id })} />
      )}
      {current && panel?.kind === "edit" && <EditDialog d={current} avoid={data.facts.avoid} brand={data.brand} aiAvailable={rewriteAvailable} onClose={close} />}
      {current && panel?.kind === "reject" && <RejectDialog d={current} onClose={close} onDone={(m) => { setNotice(m); close(); }} />}
      {current && panel?.kind === "video" && (
        <VideoDialog d={current} organizationId={organizationId} paid={paid} available={uploadsAvailable} rendering={paid ? rendering : { ok: false, reason: "Writing edits into a video file is part of a MAIRO plan." }} onClose={close} onReview={() => setPanel({ kind: "review", id: current.id })} />
      )}
      {current && panel?.kind === "review" && (
        <ReviewDialog
          d={current}
          businessName={businessName}
          paid={paid}
          facts={data.facts}
          brand={data.brand}
          tracking={data.tracking as TrackingFacts}
          imagesAvailable={imagesAvailable}
          onClose={close}
          onCreate={() => setPanel({ kind: "create", id: current.id })}
          onVideo={() => setPanel({ kind: "video", id: current.id })}
          onEditWords={() => setPanel({ kind: "edit", id: current.id })}
        />
      )}
    </div>
  );
}

// --- A direction ------------------------------------------------------------------

function latestImage(d: Dir) {
  return d.images.find((i) => i.state === "ready" && i.url) ?? null;
}

function DirectionCard({ d, readiness, onOpen }: { d: Dir; readiness: ReturnType<typeof adReadiness>; onOpen: (kind: "create" | "edit" | "video" | "review" | "reject") => void }) {
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
        <dl className="mt-3 space-y-1.5 text-[12.5px]">
          <div><dt className="inline text-muted">For: </dt><dd className="inline text-white/85">{d.audience}</dd></div>
          <div><dt className="inline text-muted">Sends people to: </dt><dd className="inline text-white/85">{d.destination}</dd></div>
          {d.testReason && <div><dt className="inline text-muted">Worth testing because: </dt><dd className="inline text-white/85">{d.testReason}</dd></div>}
        </dl>
        <p className="mt-3"><button type="button" onClick={() => onOpen("review")} className="rounded-full focus-visible:outline focus-visible:outline-2" aria-label={`Readiness ${readiness.score} out of 100 — see the check`}><ReadinessChip r={readiness} /></button></p>
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
            <>
              <button type="button" onClick={() => onOpen("create")} className={actionClass}>Create this ad</button>
              <button type="button" onClick={() => onOpen("review")} className={quietClass}>Preview</button>
            </>
          )}
          <button type="button" onClick={() => onOpen("edit")} className={quietClass}>Change the direction</button>
          <button type="button" onClick={() => onOpen("video")} className={quietClass}>{vid ? "Edit my video" : "Use my video"}</button>
          {img && <button type="button" onClick={() => onOpen("create")} className="text-[12.5px] text-muted underline-offset-4 hover:text-white hover:underline">Make another picture</button>}
          <button type="button" onClick={() => onOpen("reject")} className="text-[12.5px] text-muted underline-offset-4 hover:text-white hover:underline">Not for us</button>
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

type Proposal = { hook: string; body: string; cta: string; note: string; dropped: string[] };

function EditDialog({ d, avoid, brand, aiAvailable, onClose }: { d: Dir; avoid: string[]; brand: BrandRules | null; aiAvailable: boolean; onClose: () => void }) {
  const router = useRouter();
  const [hook, setHook] = useState(d.words?.hook ?? "");
  const [body, setBody] = useState(d.words?.body ?? "");
  const [cta, setCta] = useState(d.words?.cta ?? "Learn more");
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const [asking, startAsk] = useTransition();
  const [instruction, setInstruction] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  // The words MAIRO proposed and the owner took, untouched since: saved as "MAIRO's rewrite".
  const [taken, setTaken] = useState<{ hook: string; body: string; cta: string } | null>(null);
  const avoided = usesAvoided(`${hook} ${body}`, avoid);
  // The same brand check as the campaign builder: offers and claims you haven't confirmed are flagged, not blocked.
  const brandNotes = brand ? brandCheck(`${hook} ${body}`, brand).filter((f) => f.level === "warning") : [];
  const unchanged = hook === d.words?.hook && body === d.words?.body && cta === d.words?.cta;
  const fromAi = Boolean(taken && taken.hook === hook && taken.body === body && taken.cta === cta);

  const save = () =>
    start(async () => {
      setError(null);
      const r = await reviseDirectionAction(d.id, { hook, body, cta }, fromAi ? "ai" : "owner");
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
  const ask = (text: string) =>
    startAsk(async () => {
      setError(null);
      setProposal(null);
      const r = await rewriteWordsAction(d.id, text);
      if (!r.ok) return setError(r.error);
      setProposal({ ...r.words, note: r.note, dropped: r.dropped });
    });
  const take = () => {
    if (!proposal) return;
    setHook(proposal.hook);
    setBody(proposal.body);
    setCta(proposal.cta);
    setTaken({ hook: proposal.hook, body: proposal.body, cta: proposal.cta });
    setProposal(null);
  };

  return (
    <Modal open onClose={onClose} title={`Change the direction: ${d.title}`}>
      <div className="space-y-4">
        <section aria-labelledby={`ask-${d.id}`} className="rounded-2xl border px-4 py-3" style={{ borderColor: "var(--mairo-line)" }}>
          <h3 id={`ask-${d.id}`} className="text-[13px] font-medium text-white">Ask MAIRO to rewrite it</h3>
          {!aiAvailable ? (
            <p className="mt-1 text-[12.5px] text-muted">Rewriting with AI isn&apos;t switched on for this deployment yet. You can still change the words yourself below.</p>
          ) : (
            <>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {REWRITE_CHIPS.map((c) => (
                  <button key={c} type="button" disabled={asking} onClick={() => { setInstruction(c); ask(c); }} className="rounded-full border border-[color:var(--mairo-line)] px-3 py-1 text-[12px] text-muted hover:text-white disabled:opacity-50">{c}</button>
                ))}
              </div>
              <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (instruction.trim().length >= 3) ask(instruction); }}>
                <label className="sr-only" htmlFor={`ins-${d.id}`}>What to change</label>
                <input id={`ins-${d.id}`} value={instruction} onChange={(e) => setInstruction(e.target.value)} maxLength={300} placeholder="e.g. Focus more on our new product" className="min-w-0 flex-1 rounded-xl border border-[color:var(--mairo-line)] bg-transparent px-3 py-2 text-[13.5px] text-white" />
                <button type="submit" disabled={asking || instruction.trim().length < 3} className={`${quietClass} disabled:opacity-50`}>{asking ? "Writing…" : "Ask"}</button>
              </form>
              <p className="mt-1.5 text-[11.5px] text-faint">MAIRO uses only what you&apos;ve confirmed. Nothing is saved until you choose to keep it.</p>
            </>
          )}
          {proposal && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2" aria-live="polite">
              <div className="rounded-xl bg-white/[0.03] px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Now</p>
                <p className="mt-1 text-[13px] font-medium text-white">{hook}</p>
                {body && <p className="mt-1 text-[12.5px] text-white/75">{body}</p>}
                <p className="mt-1.5 text-[12px] text-muted">Button: {cta}</p>
              </div>
              <div className="rounded-xl border border-violet/40 bg-violet/[0.06] px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-violet-bright">MAIRO&apos;s proposal</p>
                <p className="mt-1 text-[13px] font-medium text-white">{proposal.hook}</p>
                {proposal.body && <p className="mt-1 text-[12.5px] text-white/75">{proposal.body}</p>}
                <p className="mt-1.5 text-[12px] text-muted">Button: {proposal.cta}</p>
              </div>
              {proposal.note && <p className="text-[12.5px] text-white/80 sm:col-span-2">{proposal.note}</p>}
              {proposal.dropped.length > 0 && <p className="text-[12px] text-muted sm:col-span-2">MAIRO left out {proposal.dropped.join(", ")} — not something you&apos;ve confirmed.</p>}
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <button type="button" onClick={take} className={actionClass}>Use these words</button>
                <button type="button" onClick={() => setProposal(null)} className={quietClass}>Keep mine</button>
              </div>
            </div>
          )}
        </section>

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
        {brandNotes.map((f) => <p key={f.text} className="text-[12.5px] text-muted">{f.text}</p>)}
        {error && <p role="alert" className="text-[12.5px] text-warn">{error}</p>}
        <p className="text-[12px] text-muted">Saving makes version {(d.words?.version ?? 0) + 1}{fromAi ? ", marked as MAIRO's rewrite" : ""}. Earlier versions are kept{d.approval ? ", and you'll approve the new words before they're used" : ""}.</p>
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

// --- Not for us: turned down, with a reason ------------------------------------

const REASONS = ["Not right for our brand", "We don't offer this", "Wrong kind of customer", "Something else"];

function RejectDialog({ d, onClose, onDone }: { d: Dir; onClose: () => void; onDone: (notice: string) => void }) {
  const router = useRouter();
  const [reason, setReason] = useState<string | null>(null);
  const [more, setMore] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const submit = () =>
    start(async () => {
      setError(null);
      const why = [reason, more.trim()].filter(Boolean).join(" — ");
      const r = await rejectDirectionAction(d.id, why);
      if (!r.ok) return setError(r.error);
      router.refresh();
      onDone(r.replacement ? `Set aside. MAIRO suggested “${r.replacement}” in its place.` : "Set aside. MAIRO has no other kind of ad to suggest from what you've confirmed — tell it more in your Business Brain.");
    });
  return (
    <Modal open onClose={busy ? () => {} : onClose} title={`Not for us: ${d.title}`}>
      <p className="text-[13.5px] leading-relaxed text-white/85">MAIRO sets this direction aside and won&apos;t suggest this kind of ad again. {d.approval ? "Its approval is withdrawn. " : ""}You can bring it back later.</p>
      <fieldset className="mt-4">
        <legend className="text-[13px] font-medium text-white">Why? <span className="font-normal text-muted">(helps MAIRO suggest better)</span></legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {REASONS.map((x) => (
            <label key={x} className={`cursor-pointer rounded-full border px-3 py-1.5 text-[12.5px] ${reason === x ? "border-white/70 bg-white/[0.08] text-white" : "border-[color:var(--mairo-line)] text-muted"}`}>
              <input type="radio" name={`why-${d.id}`} value={x} checked={reason === x} onChange={() => setReason(x)} className="sr-only" />
              {x}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="mt-3 block text-[13px] text-white">
        Anything else <span className="text-faint">(optional)</span>
        <input value={more} onChange={(e) => setMore(e.target.value)} maxLength={200} className="mt-1 w-full rounded-xl border border-[color:var(--mairo-line)] bg-transparent px-3 py-2 text-[13.5px] text-white" />
      </label>
      {error && <p role="alert" className="mt-3 text-[12.5px] text-warn">{error}</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={submit} className={`${actionClass} disabled:opacity-50`}>{busy ? "Setting aside…" : "Set it aside"}</button>
        <button type="button" disabled={busy} onClick={onClose} className={quietClass}>Cancel</button>
      </div>
    </Modal>
  );
}

function Rejected({ items, onNotice }: { items: Data["rejected"]; onNotice: (m: string) => void }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <details className="mt-4 rounded-2xl border px-5 py-3" style={{ borderColor: "var(--mairo-line)" }}>
      <summary className="cursor-pointer text-[13px] text-white/85">Turned down ({items.length})</summary>
      <ul className="mt-2 space-y-2">
        {items.map((x) => (
          <li key={x.id} className="flex flex-wrap items-baseline justify-between gap-2 text-[12.5px]">
            <span className="text-white/85">{x.title}{x.reason ? <span className="text-muted"> — {x.reason}</span> : null}</span>
            <button type="button" disabled={busy} onClick={() => start(async () => { const r = await bringBackDirectionAction(x.id); onNotice(r.ok ? `“${x.title}” is back among your suggestions.` : r.error); router.refresh(); })} className="text-violet-bright underline-offset-4 hover:underline disabled:opacity-50">Bring it back</button>
          </li>
        ))}
      </ul>
    </details>
  );
}

// --- Use my video ---------------------------------------------------------------

function VideoDialog({ d, organizationId, paid, available, rendering, onClose, onReview }: { d: Dir; organizationId: string; paid: boolean; available: boolean; rendering: { ok: boolean; reason: string | null }; onClose: () => void; onReview: () => void }) {
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
          <VideoEditor key={`${video.videoId}-${video.version}`} video={video} words={{ hook: d.words?.hook ?? "", cta: d.words?.cta ?? "" }} onBusy={setEditing} rendering={rendering} />
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
