/* eslint-disable @next/next/no-img-element -- remote blob URLs */
"use client";

import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/mairo/overlay";
import { actionClass, quietClass } from "@/components/mairo/action-styles";
import { PREVIEW_FORMATS } from "@/lib/meta/preview-formats";
import type { BrandRules } from "@/lib/brain/brand-check";
import type { ConfirmedFacts } from "@/lib/suggested-ads/directions";
import { editsNotInFile } from "@/lib/suggested-ads/video";
import type { listSuggestions } from "@/lib/suggested-ads/store";
import { approveCreativeAction, continueToCampaignAction, improveAdAction, suggestedPreviewAction } from "@/lib/actions/suggested-ads-actions";
import { PLACEMENTS, PlacementMock, mockLabel, type MockMedia, type Placement } from "./placements";
import { ReadinessPanel, adReadiness, type TrackingFacts } from "./readiness-panel";
import { PictureEditor } from "./picture-editor";

// The final review of one suggested ad: how it looks in each placement, how
// ready it is, what can still be changed, and — once there's a picture or
// video — approval of exactly these versions. Nothing is published here.

type Data = Awaited<ReturnType<typeof listSuggestions>>;
type Dir = Data["directions"][number];
type Choice = { kind: "image"; versionId: string; url: string } | { kind: "video"; revisionId: string };

const keyOf = (c: Choice) => (c.kind === "image" ? c.versionId : c.revisionId);
const listOf = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export function ReviewDialog({
  d,
  businessName,
  paid,
  facts,
  brand,
  tracking,
  imagesAvailable,
  metaConnected,
  onClose,
  onCreate,
  onVideo,
  onEditWords,
}: {
  d: Dir;
  businessName: string;
  paid: boolean;
  facts: ConfirmedFacts;
  brand: BrandRules | null;
  tracking: TrackingFacts;
  imagesAvailable: boolean;
  metaConnected: boolean;
  onClose: () => void;
  onCreate: () => void;
  onVideo: () => void;
  onEditWords: () => void;
}) {
  const router = useRouter();
  const ready = d.images.filter((i) => i.state === "ready" && i.url && i.versionId);
  const vid = d.videos[0] ?? null;
  const choices: Choice[] = [
    ...ready.map((i) => ({ kind: "image" as const, versionId: i.versionId!, url: i.url! })),
    ...(vid?.revisionId ? [{ kind: "video" as const, revisionId: vid.revisionId }] : []),
  ];
  const approvedKey = d.approval?.studioVersionId ?? d.approval?.videoRevisionId ?? null;
  const [pickRaw, setPick] = useState<string | null>(approvedKey);
  const pick = pickRaw && choices.some((c) => keyOf(c) === pickRaw) ? pickRaw : choices[0] ? keyOf(choices[0]) : null;
  const [placement, setPlacement] = useState<Placement>("ig-feed");
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const [improving, startImprove] = useTransition();
  const [meta, setMeta] = useState<{ format: string; src: string | null; error: string | null; loading: boolean } | null>(null);
  const choice = choices.find((c) => keyOf(c) === pick) ?? null;
  const words = d.words!;
  const image = choice?.kind === "image" ? ready.find((i) => i.versionId === choice.versionId) ?? null : null;
  // Edits not yet written into a file mean the ad would play the original — the owner acknowledges that.
  const unrendered = choice?.kind === "video" && vid && vid.render?.status !== "READY" ? editsNotInFile(vid.edits) : [];
  const media: MockMedia = !choice
    ? { kind: "none" }
    : choice.kind === "image"
      ? { kind: "image", url: choice.url, version: image?.version ?? null }
      : vid?.render?.status === "READY"
        ? { kind: "video", posterUrl: vid.render.posterUrl ?? vid.posterUrl, aspect: "original", firstCaption: null, version: vid.version }
        : { kind: "video", posterUrl: vid?.posterUrl ?? null, aspect: vid?.edits.aspect ?? "original", firstCaption: vid?.edits.captions[0] ?? null, version: vid?.version ?? null };
  const alreadyCurrent = d.approval?.state === "current" && approvedKey === pick;
  const r = adReadiness({ words, facts, brand, media: choice?.kind ?? "none", video: vid, tracking });
  const status = d.approval?.state === "current" ? (alreadyCurrent ? "Approved — these exact versions" : "Approved with a different picture or video") : d.approval?.state === "changed" ? "Changed since you approved it" : "Not approved yet";

  const approve = () =>
    start(async () => {
      if (!choice) return;
      setError(null);
      if (!alreadyCurrent) {
        const a = await approveCreativeAction({ angleId: d.id, revisionId: words.revisionId, studioVersionId: choice.kind === "image" ? choice.versionId : null, videoRevisionId: choice.kind === "video" ? choice.revisionId : null });
        if (!a.ok) return setError(a.error);
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

  const improve = () =>
    startImprove(async () => {
      setError(null);
      const x = await improveAdAction(d.id, r.fixes.map((f) => f.kind));
      if (!x.ok) return setError(x.error);
      setDone(`Saved as version ${x.version}. The earlier words are in “Change the words” if you want them back.`);
      router.refresh();
    });

  const metaPreview = (format: string) => {
    if (!choice || choice.kind !== "image") return;
    setMeta({ format, src: null, error: null, loading: true });
    suggestedPreviewAction(d.id, choice.versionId, format).then((p) => setMeta({ format, src: p.ok ? p.src : null, error: p.ok ? null : p.error, loading: false }));
  };

  return (
    <Modal open onClose={busy ? () => {} : onClose} title={`Review: ${d.title}`} wide>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <div role="tablist" aria-label="Where the ad shows" className="-mx-1 flex flex-wrap gap-1">
            {PLACEMENTS.map((p) => (
              <button key={p.id} role="tab" type="button" aria-selected={placement === p.id} onClick={() => setPlacement(p.id)} className={`rounded-full px-3 py-1.5 text-[12.5px] ${placement === p.id ? "bg-white/[0.1] text-white" : "text-muted hover:text-white"}`}>{p.label}</button>
            ))}
          </div>
          <div role="tabpanel" className="mt-4">
            <PlacementMock placement={placement} media={media} words={words} businessName={businessName} />
            <p className={`mx-auto mt-2 max-w-[360px] text-center text-[11.5px] ${media.kind === "none" ? "text-warn" : "text-faint"}`}>{mockLabel(placement, media)}</p>
          </div>
          {choice?.kind === "image" && !metaConnected && (
            <p className="mt-5 text-[12.5px] text-muted">Meta&apos;s own preview appears here once your Meta ad account is connected. <Link href="/dashboard/meta" className="text-violet-bright underline-offset-4 hover:underline">Connect it</Link> when you&apos;re ready to run an ad.</p>
          )}
          {choice?.kind === "image" && metaConnected && (
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

        <div className="min-w-0 space-y-4">
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

          <ReadinessPanel r={r} onImprove={r.fixes.length ? improve : undefined} improving={improving} onCreate={choices.length ? undefined : onCreate} />

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onEditWords} className={quietClass}>Change the words</button>
            {!choices.length && <button type="button" onClick={onVideo} className={quietClass}>Use my video</button>}
          </div>

          {image && image.versionId && <PictureEditor angleId={d.id} image={{ ...image, versionId: image.versionId, history: image.history ?? [] }} available={imagesAvailable} paid={paid} />}

          {/* The final review: everything that would go into a campaign, in one place. */}
          <section aria-labelledby={`final-${d.id}`} className="rounded-2xl bg-white/[0.04] px-4 py-3">
            <h3 id={`final-${d.id}`} className="text-[13px] font-semibold text-white">Final review</h3>
            <dl className="mt-2 space-y-1.5 text-[12.5px]">
              <Row k="Words">Version {words.version} · “{words.hook}”</Row>
              <Row k={choice?.kind === "video" ? "Video" : "Picture"}>{!choice ? "None yet — make the picture or add your video to approve" : choice.kind === "video" ? `Your video, edit version ${vid?.version}${vid?.render?.status === "READY" ? " — rendered into a new file" : ""}` : `Picture version ${image?.version ?? 1}`}</Row>
              <Row k="Button">{words.cta}</Row>
              <Row k="Sends people to">{d.destination}</Row>
              <Row k="Where it runs">Facebook and Instagram, through your Meta ad account</Row>
              <Row k="Budget">You set it in the campaign builder. Nothing spends until you launch.</Row>
              <Row k="Status">{status}</Row>
            </dl>
            <p className="mt-2 text-[11.5px] leading-relaxed text-muted">Approval is for exactly these versions. If the words, picture or video change, MAIRO asks you to approve again before they&apos;re used.</p>
          </section>

          {unrendered.length > 0 && (
            <label className="flex items-start gap-2 rounded-xl border border-amber-300/30 bg-amber-300/[0.06] px-3.5 py-3 text-[12.5px] leading-relaxed text-white/85">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />
              <span>I understand the ad plays my original video, without {listOf(unrendered)} — MAIRO can only preview edits here for now.</span>
            </label>
          )}

          {error && <p role="alert" className="text-[13px] text-warn">{error}</p>}
          {done && <p role="status" className="text-[13px] text-live">{done}</p>}
          <div className="flex flex-wrap gap-2">
            {choices.length ? (
              <button type="button" disabled={busy || !choice || (unrendered.length > 0 && !ack) || Boolean(done && done.startsWith("Approved"))} onClick={approve} className={`${actionClass} disabled:opacity-50`}>
                {busy ? "Saving…" : paid ? (alreadyCurrent ? "Continue to the campaign" : "Approve creative and continue") : "Approve creative"}
              </button>
            ) : (
              <button type="button" onClick={onCreate} className={actionClass}>Create this ad</button>
            )}
            {done?.startsWith("Approved") && !paid && <Link href="/plan/activate" className={quietClass}>Choose a plan</Link>}
            <button type="button" disabled={busy} onClick={onClose} className={quietClass}>Not yet</button>
          </div>
          {paid && choices.length > 0 && <p className="text-[11.5px] text-faint">Continue opens the campaign builder with this ad. Nothing is published or spent until you launch it there.</p>}
        </div>
      </div>
    </Modal>
  );
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-muted">{k}</dt>
      <dd className="min-w-0 text-white/90">{children}</dd>
    </div>
  );
}
