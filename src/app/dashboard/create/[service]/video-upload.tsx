"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { checkVideo, VIDEO_TYPES, type MediaCheck } from "@/lib/campaigns/media-rules";
import type { PlanVideo } from "@/lib/campaigns/plan";
import { Note } from "./wizard-parts";

// A customer's own video, checked against Meta's rules in the browser before
// a byte is uploaded, then sent straight to storage (it's too big to pass
// through the server). A still from the video is uploaded alongside it —
// Meta needs a thumbnail for every video ad.

type Measured = { width: number; height: number; durationSec: number; poster: Blob };

/** Reads the video's size and length, and grabs a frame for the thumbnail. */
function measure(file: File): Promise<Measured> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    const fail = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This browser couldn't read that video. Try an MP4."));
    };
    video.onerror = fail;
    video.onloadedmetadata = () => {
      // A frame a little way in: the very first is often black.
      video.currentTime = Math.min(1, (video.duration || 0) / 3);
    };
    video.onseeked = () => {
      const scale = Math.min(1, 1080 / Math.max(video.videoWidth, video.videoHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (poster) => {
          URL.revokeObjectURL(url);
          if (!poster) return fail();
          resolve({ width: video.videoWidth, height: video.videoHeight, durationSec: video.duration, poster });
        },
        "image/jpeg",
        0.85,
      );
    };
  });
}

export function VideoUpload({
  organizationId,
  onUploaded,
  forTikTok = false,
}: {
  organizationId: string;
  onUploaded: (video: PlanVideo) => void;
  /** Hold the video to TikTok's rules too. */
  forTikTok?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [check, setCheck] = useState<MediaCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  async function choose(file: File) {
    setError(null);
    setCheck(null);
    let measured: Measured;
    try {
      measured = await measure(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that video.");
      return;
    }
    const result = checkVideo({ type: file.type, bytes: file.size, ...measured, forTikTok });
    setCheck(result);
    if (result.problems.length > 0) return;

    try {
      setProgress(0);
      const base = `ad-media/${organizationId}`;
      const ext = file.type === "video/quicktime" ? "mov" : "mp4";
      const poster = await upload(`${base}/poster.jpg`, measured.poster, {
        access: "public",
        handleUploadUrl: "/api/uploads/ad-media",
        contentType: "image/jpeg",
      });
      const video = await upload(`${base}/video.${ext}`, file, {
        access: "public",
        handleUploadUrl: "/api/uploads/ad-media",
        contentType: file.type,
        multipart: file.size > 100 * 1024 * 1024,
        onUploadProgress: (p) => setProgress(Math.round(p.percentage)),
      });
      setProgress(null);
      onUploaded({
        url: video.url,
        posterUrl: poster.url,
        name: file.name.slice(0, 120),
        width: measured.width,
        height: measured.height,
        durationSec: Math.round(measured.durationSec * 10) / 10,
        bytes: file.size,
      });
    } catch (e) {
      setProgress(null);
      setError(e instanceof Error && e.message ? `The upload didn't finish: ${e.message}` : "The upload didn't finish. Try again.");
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={input}
        type="file"
        accept={VIDEO_TYPES.join(",")}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void choose(file);
        }}
      />
      <button
        type="button"
        disabled={progress !== null}
        onClick={() => input.current?.click()}
        className="w-full rounded-xl border border-dashed p-8 text-center text-[13px] text-muted transition hover:text-white disabled:opacity-60"
        style={{ borderColor: "var(--mairo-line)" }}
      >
        {progress !== null ? `Uploading… ${progress}%` : "Choose a video — MP4 or MOV, up to 500MB"}
      </button>
      <p className="text-[11.5px] text-faint">
        Vertical (9:16) or square works best on phones. 15–30 seconds, with the point in the first three.
      </p>
      {error && <Note tone="warn">{error}</Note>}
      {check && check.problems.length > 0 && (
        <Note tone="warn">
          {check.problems.map((p) => (
            <span key={p} className="block">{p}</span>
          ))}
        </Note>
      )}
      {check && check.problems.length === 0 && check.warnings.length > 0 && (
        <Note>
          {check.warnings.map((w) => (
            <span key={w} className="block">{w}</span>
          ))}
        </Note>
      )}
    </div>
  );
}
