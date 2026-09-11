import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/site";

// The picture that shows up when somebody pastes a MAIRO link anywhere.
//
// Worth having rather than skipping: a link with no card is rendered by every
// messaging app and social network as a bare grey rectangle with a URL under
// it, which reads as broken. This is the first impression on every share, and
// it costs one file.
//
// Generated rather than designed as a PNG so it cannot drift from the product.
// It also keeps the repository free of a large binary that somebody has to
// remember to re-export whenever the name or the palette changes.

export const alt = "MAIRO — ads that run themselves";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          // The site's own near-black, with the faint warm lift the galaxy
          // gives it. A flat #000 card next to the real page looks like a
          // different product.
          background:
            "radial-gradient(120% 100% at 20% 0%, #1a1723 0%, #0d0c12 45%, #07070a 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 999,
              background: "#7dd3fc",
              // Standing in for the galaxy, which cannot be rendered here.
              boxShadow: "0 0 28px 8px rgba(125,211,252,0.55)",
            }}
          />
          <div style={{ fontSize: 30, letterSpacing: 14, color: "#e5e5e5" }}>
            {SITE_NAME}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <div
            style={{
              fontSize: 78,
              lineHeight: 1.05,
              letterSpacing: -2,
              maxWidth: 920,
              display: "flex",
            }}
          >
            Ads that run themselves.
          </div>
          <div
            style={{
              fontSize: 34,
              lineHeight: 1.35,
              color: "#a3a3a3",
              maxWidth: 900,
              display: "flex",
            }}
          >
            Tell MAIRO what you sell. It plans, writes and runs your Meta and TikTok
            campaigns — no ads manager, no jargon.
          </div>
        </div>

        <div style={{ display: "flex", gap: 36, fontSize: 25, color: "#737373" }}>
          <span>Meta</span>
          <span>TikTok</span>
          <span>From $49/mo</span>
        </div>
      </div>
    ),
    size
  );
}
