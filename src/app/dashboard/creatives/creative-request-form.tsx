/* eslint-disable @next/next/no-img-element -- the preview is a client-side
   data URL with no remote origin, so next/image has nothing to optimise. */
"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { requestCreativeAction, suggestIdeaAction } from "@/lib/actions/creative-actions";
import { inputClass, primaryButtonClass } from "@/components/ui";

// Two ways in, because there are two kinds of customer.
//
// One has a photo. They have the jacket, the plate of food, the van with the
// logo on it, and what they want to know is what to do with it. Asking that
// person "what do you want the ad to say?" is asking the wrong question: they
// already showed you the answer.
//
// The other has nothing but the business in their head. For them the picture
// upload is noise, and the only useful prompt is describe what you sell.
//
// The old form put both of those people in front of one required text box with
// an optional file picker underneath it, which served neither. This asks which
// one they are first and then only shows what that path needs.

type Path = "photo" | "describe";

const TYPES = [
  { value: "IMAGE", label: "Image" },
  { value: "VIDEO", label: "Video" },
  { value: "COPY", label: "Ad copy" },
  { value: "CAROUSEL", label: "Carousel" },
] as const;

type CreativeTypeValue = (typeof TYPES)[number]["value"];

// Phone cameras produce 4-8MB files. Downscaling in the browser keeps the
// upload fast on a phone signal and the stored data URL small — the model sees
// everything it needs at this size, and nothing is gained by sending more.
const MAX_EDGE = 1400;
const JPEG_QUALITY = 0.82;

const PICTURE_QUESTION = "How can I advertise this picture?";

function downscaleToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file isn't an image we can read."));
      img.onload = () => {
        const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Couldn't process that image."));

        // Flatten onto white: a transparent PNG would otherwise turn black
        // once encoded as JPEG.
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function CreativeRequestForm() {
  const [state, formAction, pending] = useActionState(requestCreativeAction, undefined);

  const [path, setPath] = useState<Path | null>(null);
  const [type, setType] = useState<CreativeTypeValue>("IMAGE");
  const [note, setNote] = useState("");

  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const [idea, setIdea] = useState<string | null>(null);
  const [ideaError, setIdeaError] = useState<string | null>(null);
  const [ideaUsed, setIdeaUsed] = useState(false);
  const [thinking, startThinking] = useTransition();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setFileError(null);
    if (!file) {
      setPreview(null);
      setFileName(null);
      return;
    }

    if (!file.type.startsWith("image/")) {
      setFileError("Pick an image — PNG, JPEG, or WebP.");
      return;
    }

    setReading(true);
    try {
      const dataUrl = await downscaleToDataUrl(file);
      setPreview(dataUrl);
      setFileName(file.name);
      // A different picture deserves a different idea, and an idea about the
      // last one is worse than none at all.
      setIdea(null);
      setIdeaUsed(false);
      setIdeaError(null);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Couldn't read that image.");
      setPreview(null);
      setFileName(null);
    } finally {
      setReading(false);
    }
  }

  function clearFile() {
    setPreview(null);
    setFileName(null);
    setFileError(null);
    setIdea(null);
    setIdeaUsed(false);
    if (fileInput.current) fileInput.current.value = "";
  }

  function choosePath(next: Path) {
    setPath(next);
    setIdea(null);
    setIdeaError(null);
    setIdeaUsed(false);
    if (next === "describe") clearFile();
  }

  function askForIdea() {
    setIdeaError(null);
    startThinking(async () => {
      const result = await suggestIdeaAction({
        type,
        referenceImage: path === "photo" ? preview : null,
      });
      if (result.ok) {
        setIdea(result.idea);
        setIdeaUsed(false);
      } else {
        setIdeaError(result.error);
      }
    });
  }

  function useIdea() {
    if (!idea) return;
    setNote(idea);
    setIdeaUsed(true);
  }

  // What actually gets stored as the brief.
  //
  // On the photo path the question is the point, so it is always what MAIRO is
  // being asked — anything they typed is extra detail about the picture rather
  // than a replacement for it. That also means the photo path can be submitted
  // with nothing typed at all and still clear the server's minimum length,
  // which is the whole promise of "put the picture in and I'll take it from
  // here".
  const trimmed = note.trim();
  const brief =
    path === "photo"
      ? trimmed
        ? `${PICTURE_QUESTION}\n\n${trimmed}`
        : PICTURE_QUESTION
      : trimmed;

  const ready =
    path === "photo" ? Boolean(preview) : path === "describe" ? trimmed.length >= 5 : false;
  const canSuggest = path === "photo" ? Boolean(preview) : path === "describe";

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="brief" value={brief} />
      {/* The downscaled image travels as a hidden field rather than the raw
          File, so the server stores exactly what was previewed here. */}
      {path === "photo" && preview && (
        <input type="hidden" name="referenceImage" value={preview} />
      )}

      <div>
        <p className="text-sm text-neutral-300">What are we starting from?</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <PathCard
            selected={path === "photo"}
            onSelect={() => choosePath("photo")}
            title="I have a picture"
            body="Put it in and I’ll tell you how to advertise it."
            icon={
              <>
                <rect x="2.5" y="4" width="15" height="12" rx="2" />
                <circle cx="7" cy="8.5" r="1.4" />
                <path d="m3.5 14 4-4 3.5 3.5 2.5-2 3 2.5" />
              </>
            }
          />
          <PathCard
            selected={path === "describe"}
            onSelect={() => choosePath("describe")}
            title="I don’t have one"
            body="Tell me what you sell and I’ll make the ad from scratch."
            icon={
              <>
                <path d="M3 5h14M3 10h14M3 15h8" />
              </>
            }
          />
        </div>
      </div>

      {path && (
        <>
          {path === "photo" && (
            <div className="space-y-3 rounded-xl border border-dashed border-white/15 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <label className="cursor-pointer rounded-lg border border-white/20 px-4 py-2 text-xs uppercase tracking-[0.1em] text-neutral-300 transition hover:border-white hover:bg-white hover:text-black">
                  {preview ? "Change picture" : "Choose a picture"}
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/*"
                    onChange={handleFile}
                    className="hidden"
                  />
                </label>
                {reading && <span className="text-xs text-neutral-500">Reading image…</span>}
                {fileName && !reading && (
                  <span className="truncate text-xs text-neutral-400">{fileName}</span>
                )}
                {preview && !reading && (
                  <button
                    type="button"
                    onClick={clearFile}
                    className="text-xs text-neutral-500 underline underline-offset-4 transition hover:text-white"
                  >
                    Remove
                  </button>
                )}
              </div>

              <p className="text-xs leading-relaxed text-neutral-500">
                A product, a plate of food, a piece of clothing, your storefront — whatever
                you want the ad to be about. MAIRO looks at it and builds the ad around what
                is actually in the picture.
              </p>

              {fileError && <p className="text-xs text-red-400">{fileError}</p>}

              {preview && (
                <img
                  src={preview}
                  alt="Your picture"
                  className="mt-1 max-h-56 rounded-lg border border-white/10 object-contain"
                />
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
            <div className="space-y-1">
              <label className="text-xs font-medium text-neutral-400" htmlFor="creative-type">
                Format
              </label>
              <select
                id="creative-type"
                value={type}
                onChange={(e) => setType(e.target.value as CreativeTypeValue)}
                className={inputClass}
              >
                {TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-neutral-400" htmlFor="creative-note">
                {path === "photo"
                  ? "Anything I should know about it? (optional)"
                  : "What are you advertising?"}
              </label>
              <input
                id="creative-note"
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                  if (ideaUsed) setIdeaUsed(false);
                }}
                className={inputClass}
                placeholder={
                  path === "photo"
                    ? "e.g. it’s waterproof, and it’s 20% off until Sunday"
                    : "e.g. handmade candles, £18, mostly bought as gifts"
                }
              />
              {path === "photo" && !trimmed && (
                <p className="text-xs text-neutral-600">
                  Leave it blank and I&rsquo;ll work it out from the picture.
                </p>
              )}
            </div>
          </div>

          <SuggestionPanel
            path={path}
            canSuggest={canSuggest}
            thinking={thinking}
            idea={idea}
            ideaUsed={ideaUsed}
            error={ideaError}
            onAsk={askForIdea}
            onUse={useIdea}
          />

          {state?.error && <p className="text-sm text-red-400">{state.error}</p>}

          <div>
            <button
              type="submit"
              disabled={pending || reading || thinking || !ready}
              className={primaryButtonClass}
            >
              {pending
                ? "Writing your ad…"
                : path === "photo"
                  ? "Advertise this picture"
                  : "Make my ad"}
            </button>
            {!ready && !pending && (
              <p className="mt-2 text-xs text-neutral-600">
                {path === "photo"
                  ? "Add a picture and I’ll take it from there."
                  : "Tell me what you’re advertising, in a sentence."}
              </p>
            )}
            {pending && (
              <p className="mt-2 text-xs text-neutral-500">
                I&rsquo;m looking at {path === "photo" ? "your picture" : "what you told me"} —
                this takes a few seconds.
              </p>
            )}
          </div>
        </>
      )}
    </form>
  );
}

function PathCard({
  selected,
  onSelect,
  title,
  body,
  icon,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  body: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex items-start gap-3 rounded-xl border p-4 text-left transition ${
        selected
          ? "border-white/40 bg-white/[0.07]"
          : "border-white/10 bg-white/[0.02] hover:border-white/25"
      }`}
    >
      <svg
        viewBox="0 0 20 20"
        className={`mt-0.5 h-5 w-5 flex-none ${selected ? "text-white" : "text-neutral-500"}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {icon}
      </svg>
      <span>
        <span className="block text-sm text-white">{title}</span>
        <span className="mt-1 block text-xs leading-relaxed text-neutral-400">{body}</span>
      </span>
    </button>
  );
}

// MAIRO offering, rather than waiting to be asked.
//
// It is written as a question in the first person on purpose. "Want my
// suggestion?" is something a person says, and the answer is allowed to be no
// — which is the difference between a suggestion and a form that has already
// been filled in for you. Nothing here is applied until they press the button,
// and the idea lands in the same field they were going to type in, so it can
// be edited into their own words rather than accepted whole.
function SuggestionPanel({
  path,
  canSuggest,
  thinking,
  idea,
  ideaUsed,
  error,
  onAsk,
  onUse,
}: {
  path: Path;
  canSuggest: boolean;
  thinking: boolean;
  idea: string | null;
  ideaUsed: boolean;
  error: string | null;
  onAsk: () => void;
  onUse: () => void;
}) {
  const ask =
    path === "photo"
      ? "Want my suggestion? I’ll look at your picture and tell you what I’d advertise about it."
      : "Not sure what to say? Want my suggestion? I’ll come up with something from what I know about your business.";

  return (
    <div className="rounded-xl border border-sky-400/20 bg-sky-400/[0.04] p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full border border-sky-400/30 bg-sky-400/10 text-[10px] font-medium tracking-[0.08em] text-sky-200">
            M
          </span>
          <p className="max-w-xl text-sm leading-relaxed text-neutral-300">
            {idea ? "Here’s what I’d do." : ask}
          </p>
        </div>
        <button
          type="button"
          onClick={onAsk}
          disabled={thinking || !canSuggest}
          className="rounded-full border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-xs text-sky-200 transition hover:bg-sky-400/20 disabled:opacity-50"
        >
          {thinking ? "Thinking…" : idea ? "Suggest another" : "Yes, suggest something"}
        </button>
      </div>

      {!canSuggest && path === "photo" && (
        <p className="mt-3 pl-10 text-xs text-neutral-500">
          Add your picture first — I want to see it before I say anything.
        </p>
      )}

      {error && <p className="mt-3 pl-10 text-xs text-red-400">{error}</p>}

      {idea && (
        <div className="mt-3 pl-10">
          <p className="text-sm leading-relaxed text-white">{idea}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onUse}
              disabled={ideaUsed}
              className="rounded-full bg-white px-4 py-1.5 text-xs font-medium text-black transition hover:bg-neutral-200 disabled:opacity-50"
            >
              {ideaUsed ? "Added above" : "Use this idea"}
            </button>
            <span className="text-xs text-neutral-500">
              {ideaUsed
                ? "It’s in the box above — change any of it before you send it."
                : "It goes in the box above, where you can edit it."}
            </span>
          </div>
        </div>
      )}

      <p className="mt-3 pl-10 text-xs text-neutral-600">
        Asking me is free — it doesn&rsquo;t use one of your monthly creatives.
      </p>
    </div>
  );
}
