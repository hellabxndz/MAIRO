// Video files rendered from the landing story and the walkthrough. Written by
// video/render.mjs after each render — it lists only files that exist, so a
// page can offer a video only when there is one. Edit by re-rendering, not by
// hand.

export type RenderedClip = { mp4: string; poster: string; width: number; height: number; ms: number; bytes: number; /** The file carries the recorded narration. */ audio?: boolean };
export type RenderedMedia = {
  renderedAt: string | null;
  story: Partial<Record<"shop" | "service" | "appointments" | "brands", Partial<Record<"wide" | "narrow", RenderedClip>>>>;
  walkthrough: Partial<Record<"wide" | "narrow", RenderedClip>>;
  captions: { story?: string; walkthrough?: string };
};

export const RENDERED_MEDIA: RenderedMedia = {
  "renderedAt": "2026-10-14T01:11:57.579Z",
  "story": {
    "shop": {
      "wide": {
        "mp4": "/walkthrough/story-shop-wide.mp4",
        "poster": "/walkthrough/story-shop-wide-poster.webp",
        "width": 1140,
        "height": 840,
        "ms": 24000,
        "bytes": 1211394
      },
      "narrow": {
        "mp4": "/walkthrough/story-shop-narrow.mp4",
        "poster": "/walkthrough/story-shop-narrow-poster.webp",
        "width": 540,
        "height": 900,
        "ms": 24000,
        "bytes": 879634
      }
    },
    "service": {
      "wide": {
        "mp4": "/walkthrough/story-service-wide.mp4",
        "poster": "/walkthrough/story-service-wide-poster.webp",
        "width": 1140,
        "height": 840,
        "ms": 24000,
        "bytes": 1203127
      },
      "narrow": {
        "mp4": "/walkthrough/story-service-narrow.mp4",
        "poster": "/walkthrough/story-service-narrow-poster.webp",
        "width": 540,
        "height": 900,
        "ms": 24000,
        "bytes": 873702
      }
    },
    "brands": {
      "wide": {
        "mp4": "/walkthrough/story-brands-wide.mp4",
        "poster": "/walkthrough/story-brands-wide-poster.webp",
        "width": 1140,
        "height": 840,
        "ms": 24000,
        "bytes": 1220502
      },
      "narrow": {
        "mp4": "/walkthrough/story-brands-narrow.mp4",
        "poster": "/walkthrough/story-brands-narrow-poster.webp",
        "width": 540,
        "height": 900,
        "ms": 24000,
        "bytes": 877295
      }
    }
  },
  "walkthrough": {
    "wide": {
      "mp4": "/walkthrough/walkthrough-wide.mp4",
      "poster": "/walkthrough/walkthrough-wide-poster.webp",
      "width": 1140,
      "height": 840,
      "ms": 73000,
      "bytes": 3147101
    },
    "narrow": {
      "mp4": "/walkthrough/walkthrough-narrow.mp4",
      "poster": "/walkthrough/walkthrough-narrow-poster.webp",
      "width": 540,
      "height": 900,
      "ms": 73000,
      "bytes": 2268832
    }
  },
  "captions": {
    "story": "/walkthrough/story.vtt",
    "walkthrough": "/walkthrough/walkthrough.vtt"
  }
};
