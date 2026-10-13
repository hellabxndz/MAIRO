// Video files rendered from the landing story and the walkthrough. Written by
// video/render.mjs after each render — it lists only files that exist, so a
// page can offer a video only when there is one. Edit by re-rendering, not by
// hand.

export type RenderedClip = { mp4: string; poster: string; width: number; height: number; ms: number; bytes: number };
export type RenderedMedia = {
  renderedAt: string | null;
  story: Partial<Record<"shop" | "service" | "appointments", Partial<Record<"wide" | "narrow", RenderedClip>>>>;
  walkthrough: Partial<Record<"wide" | "narrow", RenderedClip>>;
  captions: { story?: string; walkthrough?: string };
};

export const RENDERED_MEDIA: RenderedMedia = {
  "renderedAt": "2026-10-13T05:17:57.619Z",
  "story": {
    "shop": {
      "wide": {
        "mp4": "/walkthrough/story-shop-wide.mp4",
        "poster": "/walkthrough/story-shop-wide-poster.webp",
        "width": 1140,
        "height": 840,
        "ms": 20000,
        "bytes": 982840
      },
      "narrow": {
        "mp4": "/walkthrough/story-shop-narrow.mp4",
        "poster": "/walkthrough/story-shop-narrow-poster.webp",
        "width": 540,
        "height": 900,
        "ms": 20000,
        "bytes": 694616
      }
    },
    "service": {
      "wide": {
        "mp4": "/walkthrough/story-service-wide.mp4",
        "poster": "/walkthrough/story-service-wide-poster.webp",
        "width": 1140,
        "height": 840,
        "ms": 20000,
        "bytes": 976621
      },
      "narrow": {
        "mp4": "/walkthrough/story-service-narrow.mp4",
        "poster": "/walkthrough/story-service-narrow-poster.webp",
        "width": 540,
        "height": 900,
        "ms": 20000,
        "bytes": 676237
      }
    },
    "appointments": {
      "wide": {
        "mp4": "/walkthrough/story-appointments-wide.mp4",
        "poster": "/walkthrough/story-appointments-wide-poster.webp",
        "width": 1140,
        "height": 840,
        "ms": 20000,
        "bytes": 987628
      },
      "narrow": {
        "mp4": "/walkthrough/story-appointments-narrow.mp4",
        "poster": "/walkthrough/story-appointments-narrow-poster.webp",
        "width": 540,
        "height": 900,
        "ms": 20000,
        "bytes": 690897
      }
    }
  },
  "walkthrough": {
    "wide": {
      "mp4": "/walkthrough/walkthrough-wide.mp4",
      "poster": "/walkthrough/walkthrough-wide-poster.webp",
      "width": 1140,
      "height": 840,
      "ms": 60000,
      "bytes": 1799615
    },
    "narrow": {
      "mp4": "/walkthrough/walkthrough-narrow.mp4",
      "poster": "/walkthrough/walkthrough-narrow-poster.webp",
      "width": 540,
      "height": 900,
      "ms": 60000,
      "bytes": 1377894
    }
  },
  "captions": {
    "story": "/walkthrough/story.vtt",
    "walkthrough": "/walkthrough/walkthrough.vtt"
  }
};
