import { metaGraphRequest } from "@/lib/meta/client";

// Getting a customer's video into their ad account.
//
// Meta fetches the file itself from a public URL (file_url), which is where
// the upload already lives, so the bytes never pass through a serverless
// function. Then Meta processes it — usually seconds, sometimes minutes — and
// an ad built on a video that isn't ready is refused. So the launch waits a
// little, and if it's still processing, says so; the half-built campaign is
// finished on a later pass, reusing the same video id rather than uploading
// again.

export async function uploadAdVideo(
  adAccountId: string,
  accessToken: string,
  fileUrl: string,
  name: string
): Promise<string> {
  const res = await metaGraphRequest<{ id?: string }>(`/${adAccountId}/advideos`, {
    method: "POST",
    accessToken,
    body: { file_url: fileUrl, name: name.slice(0, 100) },
  });
  if (!res.id) throw new Error("Meta accepted the video but returned no id.");
  return res.id;
}

export type VideoState = "ready" | "processing" | "error";

export async function videoState(videoId: string, accessToken: string): Promise<VideoState> {
  const res = await metaGraphRequest<{ status?: { video_status?: string } }>(`/${videoId}`, {
    accessToken,
    params: { fields: "status" },
  });
  const status = res.status?.video_status;
  if (status === "ready") return "ready";
  if (status === "error") return "error";
  return "processing";
}

/** Waits up to `maxMs` for Meta to finish processing. */
export async function waitForVideo(videoId: string, accessToken: string, maxMs = 40_000): Promise<VideoState> {
  const started = Date.now();
  let delay = 2_000;
  for (;;) {
    const state = await videoState(videoId, accessToken);
    if (state !== "processing" || Date.now() - started + delay > maxMs) return state;
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.5, 8_000);
  }
}
