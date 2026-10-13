// Browser only. Reads a video's size and length before a byte is uploaded, and
// grabs a frame a little way in for the thumbnail Meta needs on every video ad.
// Shared by the campaign builder's uploader and "Use my video" on suggested ads.

export type Measured = { width: number; height: number; durationSec: number; poster: Blob };

/** Reads the video's size and length, and grabs a frame for the thumbnail. */
export function measureVideo(file: File): Promise<Measured> {
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
