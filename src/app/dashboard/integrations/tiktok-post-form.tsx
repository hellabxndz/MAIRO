"use client";

import { useState, useTransition } from "react";
import { postToTikTokAction } from "@/lib/actions/tiktok-actions";
import { inputClass, primaryButtonClass } from "@/components/ui";

// Sending a video to the customer's TikTok.
//
// It asks for a link rather than a file, and that is worth explaining rather
// than hiding: MAIRO writes ad concepts and generates images, and does not yet
// produce finished video. So the video being posted is one the customer or
// their editor made, living somewhere MAIRO can fetch it. When MAIRO does
// produce video, this is the same call with the URL filled in for them.
//
// The button's wording changes with what TikTok has actually granted. If the
// posting permission is missing, or TikTok hasn't finished reviewing MAIRO for
// direct posting, this says "Send to my TikTok drafts" — because that is what
// happens, and calling it posting would be a lie the customer discovers by
// opening TikTok and finding nothing there.

export function TikTokPostForm({ postsDirectly }: { postsDirectly: boolean }) {
  const [videoUrl, setVideoUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [sending, startSending] = useTransition();

  const ready = videoUrl.trim().length > 0 && caption.trim().length > 0;

  function send() {
    setResult(null);
    startSending(async () => {
      const res = await postToTikTokAction({ videoUrl: videoUrl.trim(), caption: caption.trim() });
      setResult(res.ok ? { ok: true, message: res.message } : { ok: false, message: res.error });
      if (res.ok) {
        setVideoUrl("");
        setCaption("");
      }
    });
  }

  return (
    <div className="mt-6 border-t border-white/10 pt-6">
      <h4 className="text-sm text-white">
        {postsDirectly ? "Post a video" : "Send a video to your drafts"}
      </h4>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-neutral-400" htmlFor="tt-video">
            Link to the video
          </label>
          <input
            id="tt-video"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            className={inputClass}
            placeholder="https://…/your-video.mp4"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-neutral-400" htmlFor="tt-caption">
            Caption
          </label>
          <input
            id="tt-caption"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            className={inputClass}
            placeholder="What people read under the video"
          />
        </div>
      </div>

      {result && (
        <p className={`mt-3 text-sm ${result.ok ? "text-emerald-300" : "text-red-400"}`}>
          {result.message}
        </p>
      )}

      <button
        type="button"
        onClick={send}
        disabled={!ready || sending}
        className={`${primaryButtonClass} mt-4`}
      >
        {sending
          ? "Sending to TikTok…"
          : postsDirectly
            ? "Post to my TikTok"
            : "Send to my TikTok drafts"}
      </button>

      <p className="mt-3 text-xs leading-relaxed text-neutral-500">
        MAIRO doesn&rsquo;t make finished video yet, so this posts one you already have.
        MP4 or MOV, vertical, and TikTok checks it before it goes anywhere.
      </p>
    </div>
  );
}
