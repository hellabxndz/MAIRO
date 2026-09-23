"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { checkImage, IMAGE_TYPES } from "@/lib/campaigns/media-rules";
import { MAX_OWN_IMAGES, type PlanImage } from "@/lib/campaigns/plan";
import { Note } from "./wizard-parts";

// The customer's own ad pictures, as many as five. Each is checked against
// Meta's rules in the browser, uploaded straight to storage and attached at
// once — no credits (those are only for pictures MAIRO's AI makes) and no
// extra step before Continue works. Each picture becomes its own ad.

function dimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This browser couldn't read that picture."));
    };
    img.src = url;
  });
}

export function ImageUpload({
  organizationId,
  images,
  onChange,
}: {
  organizationId: string;
  images: PlanImage[];
  onChange: (images: PlanImage[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<{ tone: "warn" | "neutral"; text: string }[]>([]);
  const room = MAX_OWN_IMAGES - images.length;

  async function add(files: File[]) {
    setBusy(true);
    const notes: { tone: "warn" | "neutral"; text: string }[] = [];
    const added: PlanImage[] = [];
    if (files.length > room) notes.push({ tone: "warn", text: `Up to ${MAX_OWN_IMAGES} pictures per campaign — the first ${room} were used.` });

    for (const file of files.slice(0, room)) {
      try {
        const size = await dimensions(file);
        const check = checkImage({ type: file.type, bytes: file.size, ...size });
        if (check.problems.length) {
          notes.push({ tone: "warn", text: `${file.name}: ${check.problems.join(" ")}` });
          continue;
        }
        for (const w of check.warnings) notes.push({ tone: "neutral", text: `${file.name}: ${w}` });
        const ext = file.type === "image/png" ? "png" : "jpg";
        const stored = await upload(`ad-media/${organizationId}/image.${ext}`, file, {
          access: "public",
          handleUploadUrl: "/api/uploads/ad-media",
          contentType: file.type,
        });
        added.push({ url: stored.url, name: file.name.slice(0, 120), ...size });
      } catch (e) {
        notes.push({ tone: "warn", text: `${file.name}: ${e instanceof Error && e.message ? e.message : "the upload didn't finish."}` });
      }
    }
    setMessages(notes);
    setBusy(false);
    if (added.length) onChange([...images, ...added]);
  }

  return (
    <div className="space-y-3">
      <input
        ref={input}
        type="file"
        multiple
        accept={IMAGE_TYPES.join(",")}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) void add(files);
        }}
      />

      {images.length > 0 && (
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {images.map((img, i) => (
            <li key={img.url} className="relative overflow-hidden rounded-xl border" style={{ borderColor: "var(--mairo-line)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- remote blob URL */}
              <img src={img.url} alt={`Your picture ${i + 1}`} className="aspect-square w-full object-cover" />
              <button
                type="button"
                onClick={() => onChange(images.filter((x) => x.url !== img.url))}
                className="absolute right-1.5 top-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[11px] text-white hover:bg-black"
                aria-label={`Remove picture ${i + 1}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {room > 0 && (
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="w-full rounded-xl border border-dashed p-6 text-center text-[13px] text-muted transition hover:text-white disabled:opacity-60"
          style={{ borderColor: "var(--mairo-line)" }}
        >
          {busy ? "Uploading…" : images.length ? `Add more pictures (${room} more)` : `Choose pictures — JPG or PNG, up to ${MAX_OWN_IMAGES}`}
        </button>
      )}
      <p className="text-[11.5px] text-faint">
        No credits used — they&rsquo;re only for pictures MAIRO&rsquo;s AI makes. Each picture runs as its own ad, and Meta shows more of
        whichever people respond to.
      </p>
      {messages.map((m) => (
        <Note key={m.text} tone={m.tone}>{m.text}</Note>
      ))}
    </div>
  );
}
