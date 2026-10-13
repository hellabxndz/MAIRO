"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionClass, quietClass } from "@/components/mairo/action-styles";
import { revertVideoAction, saveVideoEditsAction } from "@/lib/actions/suggested-ads-actions";
import { describeEdits, editsNotInFile, fmtTime, parseEdits, playedRange, sameEdits, videoSuggestions, type Aspect, type VideoEdits, type VideoMeta } from "@/lib/suggested-ads/video";

// Editing the owner's video without touching the file: start and end, captions
// at times, a crop. Each save is a new version; "Back to the original" is one
// too, so nothing is ever lost. The suggestions are timestamped — pressing the
// time jumps the video there — and say what they're based on.
//
// The edits are previewed here over the original. They aren't rendered into
// a new file, and the panel says so in plain words wherever it matters.

export type EditableVideo = {
  videoId: string;
  url: string;
  posterUrl: string | null;
  name: string | null;
  meta: VideoMeta;
  version: number;
  edits: VideoEdits;
  history: { version: number; note: string | null; createdAt: string | Date }[];
};

const ASPECTS: { value: Aspect; label: string }[] = [
  { value: "original", label: "As filmed" },
  { value: "4:5", label: "4:5 — feed" },
  { value: "9:16", label: "9:16 — Stories and Reels" },
  { value: "1:1", label: "1:1 — square" },
];
const ratioOf = (a: Aspect, meta: VideoMeta) => (a === "original" ? meta.width / meta.height : a === "4:5" ? 4 / 5 : a === "9:16" ? 9 / 16 : 1);
const secs = (ms: number) => Math.round(ms / 100) / 10;

export function VideoEditor({ video, words, onBusy }: { video: EditableVideo; words: { hook: string; cta: string }; onBusy?: (busy: boolean) => void }) {
  const router = useRouter();
  const ref = useRef<HTMLVideoElement>(null);
  const saved = useMemo(() => parseEdits(video.edits, video.meta), [video.edits, video.meta]);
  const [edits, setEdits] = useState<VideoEdits>(saved);
  const [now, setNow] = useState(0);
  const [message, setMessage] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = !sameEdits(edits, saved);
  const range = playedRange(edits, video.meta);
  const suggestions = videoSuggestions(video.meta, words, edits);
  const notInFile = editsNotInFile(edits);
  const caption = edits.captions.find((c) => c.startMs <= now && c.endMs > now) ?? null;
  // Unsaved or still saving: the review would show the previous version, so it waits.
  useEffect(() => {
    onBusy?.(dirty || pending);
  }, [dirty, pending, onBusy]);

  const change = (next: VideoEdits) => {
    setEdits(parseEdits(next, video.meta));
    setMessage(null);
  };
  const seek = (ms: number) => {
    const el = ref.current;
    if (!el) return;
    el.currentTime = ms / 1000;
    setNow(ms);
  };
  // Playback stays inside the trimmed part, so what plays is what the ad would.
  const onTime = () => {
    const el = ref.current;
    if (!el) return;
    const ms = el.currentTime * 1000;
    if (ms < range.startMs - 50) el.currentTime = range.startMs / 1000;
    else if (edits.trimEndMs !== null && ms >= range.endMs) {
      el.pause();
      el.currentTime = range.startMs / 1000;
    }
    setNow(el.currentTime * 1000);
  };

  const save = () =>
    start(async () => {
      const r = await saveVideoEditsAction(video.videoId, edits);
      if (!r.ok) return setMessage({ tone: "warn", text: r.error });
      setMessage({ tone: "ok", text: r.changed ? `Saved as version ${r.version}. The earlier versions are kept.` : "Nothing changed since the last version." });
      router.refresh();
    });
  const revert = () =>
    start(async () => {
      const r = await revertVideoAction(video.videoId);
      if (!r.ok) return setMessage({ tone: "warn", text: r.error });
      setEdits(parseEdits({}, video.meta));
      setMessage({ tone: "ok", text: r.changed ? `Back to the original, saved as version ${r.version}. Your edits are still in the history.` : "It's already the original." });
      router.refresh();
    });

  const ratio = ratioOf(edits.aspect, video.meta);
  const videoRatio = video.meta.width / video.meta.height;
  // The kept area as a share of the frame, for the crop outline.
  const keepW = ratio < videoRatio ? (ratio / videoRatio) * 100 : 100;
  const keepH = ratio < videoRatio ? 100 : (videoRatio / ratio) * 100;
  const pct = (ms: number) => `${(ms / video.meta.durationMs) * 100}%`;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* The video stays in view while the edits beside it are scrolled. */}
      <div className="self-start lg:sticky lg:top-0">
        <div className="relative mx-auto max-h-[60vh] overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: `${video.meta.width} / ${video.meta.height}`, maxWidth: videoRatio < 1 ? 340 : undefined }}>
          <video
            ref={ref}
            src={video.url}
            poster={video.posterUrl ?? undefined}
            controls
            playsInline
            preload="metadata"
            onTimeUpdate={onTime}
            onSeeked={onTime}
            className="h-full w-full"
            aria-label={`Your video${video.name ? `, ${video.name}` : ""}, with your edits shown over it`}
          />
          {edits.aspect !== "original" && (
            <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md border-2 border-white/80" style={{ width: `${keepW}%`, height: `${keepH}%`, boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)" }} />
          )}
          {caption && (
            <p aria-live="polite" className="pointer-events-none absolute inset-x-4 top-[12%] mx-auto w-fit max-w-[90%] rounded-lg bg-black/75 px-3 py-1.5 text-center text-[14px] font-semibold leading-snug text-[#fff]">
              {caption.text}
            </p>
          )}
        </div>

        {/* The whole video, with the part that plays, the captions and the suggestions on it. */}
        <div className="relative mt-4 h-10 rounded-lg bg-white/[0.05]" aria-label="Timeline">
          <div className="absolute inset-y-0 rounded-lg bg-violet/25" style={{ left: pct(range.startMs), width: pct(range.lengthMs) }} />
          {edits.captions.map((c, i) => (
            <div key={i} className="absolute top-1 h-2 rounded bg-white/70" style={{ left: pct(c.startMs), width: pct(c.endMs - c.startMs) }} />
          ))}
          <div className="absolute inset-y-0 w-0.5 bg-white" style={{ left: pct(Math.min(now, video.meta.durationMs)) }} />
          {suggestions.filter((s) => s.kind !== "info").map((s) => (
            <button key={s.id} type="button" onClick={() => seek(s.atMs)} title={s.title} aria-label={`Go to ${fmtTime(s.atMs)}: ${s.title}`}
              className="absolute bottom-0 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-[color:var(--mairo-bg)] bg-amber-300" style={{ left: pct(s.atMs) }} />
          ))}
        </div>
        <p className="mt-1.5 flex justify-between text-[11.5px] tabular-nums text-faint"><span>0:00</span><span>Plays {fmtTime(range.startMs)}–{fmtTime(range.endMs)} · {fmtTime(range.lengthMs)}</span><span>{fmtTime(video.meta.durationMs)}</span></p>

        {notInFile.length > 0 && (
          <p className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/[0.06] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-white/85">
            You&apos;re seeing {list(notInFile)} as a preview over your video. MAIRO can&apos;t write edits into the video file yet, so an ad made from this video plays your original. If you need {list(notInFile)} in the ad, make the same change in your phone&apos;s video editor and upload that version.
          </p>
        )}
      </div>

      <div className="space-y-6">
        <section aria-labelledby="sugg-h">
          <h3 id="sugg-h" className="text-[14px] font-semibold text-white">Suggestions</h3>
          <p className="mt-1 text-[12px] text-faint">From your video&apos;s length and shape and this ad&apos;s words. MAIRO hasn&apos;t watched or listened to it.</p>
          <ul className="mt-3 space-y-2">
            {suggestions.map((s) => (
              <li key={s.id} className="rounded-xl border px-3.5 py-3" style={{ borderColor: "var(--mairo-line)" }}>
                <div className="flex flex-wrap items-baseline gap-2">
                  <button type="button" onClick={() => seek(s.atMs)} className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11.5px] tabular-nums text-white/85 hover:bg-white/[0.12]" aria-label={`Go to ${fmtTime(s.atMs)}`}>
                    {fmtTime(s.atMs)}{s.untilMs !== null ? `–${fmtTime(s.untilMs)}` : ""}
                  </button>
                  <span className="text-[13px] font-medium text-white">{s.title}</span>
                </div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{s.detail}</p>
                {s.apply && (
                  <button type="button" onClick={() => change(s.apply!)} className="mt-2 text-[12.5px] font-medium text-violet-bright underline-offset-4 hover:underline">
                    Apply
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="trim-h">
          <h3 id="trim-h" className="text-[14px] font-semibold text-white">Start and end</h3>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <TimeField label="Starts at" value={edits.trimStartMs} max={video.meta.durationMs} onChange={(ms) => change({ ...edits, trimStartMs: ms })} onNow={() => change({ ...edits, trimStartMs: Math.round(now) })} />
            <TimeField label="Ends at" value={edits.trimEndMs ?? video.meta.durationMs} max={video.meta.durationMs} onChange={(ms) => change({ ...edits, trimEndMs: ms >= video.meta.durationMs ? null : ms })} onNow={() => change({ ...edits, trimEndMs: Math.round(now) })} />
          </div>
        </section>

        <section aria-labelledby="cap-h">
          <h3 id="cap-h" className="text-[14px] font-semibold text-white">Captions</h3>
          {edits.captions.length === 0 && <p className="mt-1 text-[12.5px] text-muted">None yet. Most people watch with the sound off.</p>}
          <ul className="mt-2 space-y-2">
            {edits.captions.map((c, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => seek(c.startMs)} className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11.5px] tabular-nums text-white/85">{fmtTime(c.startMs)}–{fmtTime(c.endMs)}</button>
                <input
                  value={c.text}
                  maxLength={120}
                  aria-label={`Caption at ${fmtTime(c.startMs)}`}
                  onChange={(e) => setEdits({ ...edits, captions: edits.captions.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })}
                  onBlur={() => change(edits)}
                  className="min-w-0 flex-1 rounded-lg border border-[color:var(--mairo-line)] bg-transparent px-2.5 py-1.5 text-[13px] text-white"
                />
                <button type="button" onClick={() => change({ ...edits, captions: edits.captions.filter((_, j) => j !== i) })} className="text-[12px] text-muted hover:text-white" aria-label={`Remove the caption at ${fmtTime(c.startMs)}`}>Remove</button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => change({ ...edits, captions: [...edits.captions, { startMs: Math.round(now), endMs: Math.min(video.meta.durationMs, Math.round(now) + 3000), text: "Your words here" }] })} className="mt-2 text-[12.5px] font-medium text-violet-bright underline-offset-4 hover:underline">
            + Add a caption at {fmtTime(now)}
          </button>
        </section>

        <fieldset>
          <legend className="text-[14px] font-semibold text-white">Crop</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {ASPECTS.map((a) => (
              <label key={a.value} className={`cursor-pointer rounded-full border px-3 py-1.5 text-[12.5px] ${edits.aspect === a.value ? "border-white/70 bg-white/[0.08] text-white" : "border-[color:var(--mairo-line)] text-muted"}`}>
                <input type="radio" name={`aspect-${video.videoId}`} value={a.value} checked={edits.aspect === a.value} onChange={() => change({ ...edits, aspect: a.value })} className="sr-only" />
                {a.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="rounded-xl bg-white/[0.04] px-3.5 py-3">
          <p className="text-[12.5px] text-muted">{dirty ? "Not saved yet:" : `Version ${video.version}:`} <span className="text-white/85">{describeEdits(edits, video.meta).join(" · ")}</span></p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={!dirty || pending} onClick={save} className={`${actionClass} disabled:opacity-50`}>{pending ? "Saving…" : `Save as version ${video.version + 1}`}</button>
            {dirty && <button type="button" disabled={pending} onClick={() => change(saved)} className={quietClass}>Discard changes</button>}
            <button type="button" disabled={pending} onClick={revert} className={quietClass}>Back to the original</button>
          </div>
          {message && <p role="status" className={`mt-2 text-[12.5px] ${message.tone === "ok" ? "text-live" : "text-warn"}`}>{message.text}</p>}
        </div>

        <details>
          <summary className="cursor-pointer text-[12.5px] text-muted hover:text-white">Every version ({video.history.length})</summary>
          <ol className="mt-2 space-y-1">
            {video.history.map((h) => (
              <li key={h.version} className="text-[12.5px] text-white/80">Version {h.version}: {h.note ?? "—"} <span className="text-faint">· {new Date(h.createdAt).toLocaleString()}</span></li>
            ))}
          </ol>
        </details>
      </div>
    </div>
  );
}

function TimeField({ label, value, max, onChange, onNow }: { label: string; value: number; max: number; onChange: (ms: number) => void; onNow: () => void }) {
  return (
    <div>
      <label className="block text-[12px] text-muted">
        {label} (seconds)
        <input type="number" min={0} max={secs(max)} step={0.1} value={secs(value)} onChange={(e) => onChange(Math.round(Number(e.target.value) * 1000))}
          className="mt-1 w-full rounded-lg border border-[color:var(--mairo-line)] bg-transparent px-2.5 py-1.5 text-[13px] tabular-nums text-white" />
      </label>
      <button type="button" onClick={onNow} className="mt-1 text-[12px] text-violet-bright underline-offset-4 hover:underline">Use the current moment</button>
    </div>
  );
}

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
