import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/site";
import { PLANS } from "@/lib/plans";

// The picture that shows up when somebody pastes a MAIRO link anywhere.
//
// Worth having rather than skipping: a link with no card is rendered by every
// messaging app and social network as a bare grey rectangle with a URL under
// it, which reads as broken. This is the first impression on every share, and
// it costs one file.
//
// Generated rather than designed as a PNG so it cannot drift from the product.
// It also keeps the repository free of a large binary that somebody has to
// remember to re-export whenever the name or the palette changes. The headline
// and the colours are the hero's (components/landing/console-hero.tsx and the
// tokens in globals.css); change them together.

export const alt = "MAIRO — Your next ad strategy, built by AI. Build your free Meta ad plan.";
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
          // The site's midnight, lit from above by the same blue bloom as the
          // hero. A flat #000 card next to the real page looks like a
          // different product.
          background:
            "radial-gradient(70% 60% at 28% 0%, rgba(47,107,255,0.34) 0%, rgba(47,107,255,0) 70%), radial-gradient(45% 40% at 88% 22%, rgba(56,189,248,0.12) 0%, rgba(56,189,248,0) 70%), #05070d",
          color: "#f8f9ff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 999,
              background: "#7c9dff",
              boxShadow: "0 0 28px 8px rgba(53,108,255,0.6)",
            }}
          />
          <div style={{ fontSize: 30, letterSpacing: 14, color: "#e9ebf5" }}>
            {SITE_NAME}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <div
            style={{
              fontSize: 84,
              lineHeight: 1.02,
              letterSpacing: -3,
              maxWidth: 980,
              display: "flex",
              flexWrap: "wrap",
            }}
          >
            <span>Your next ad strategy,&nbsp;</span>
            <span style={{ color: "#7fb0ff" }}>built by AI.</span>
          </div>
          <div
            style={{
              fontSize: 33,
              lineHeight: 1.35,
              color: "#a7b0c6",
              maxWidth: 940,
              display: "flex",
            }}
          >
            A personalized Meta advertising strategy, creative ideas, audiences and a
            budget plan for your business — free. Nothing launches without your approval.
          </div>
        </div>

        <div style={{ display: "flex", gap: 36, fontSize: 25, color: "#858da8" }}>
          <span>Facebook</span>
          <span>Instagram</span>
          <span>Free ad plan</span>
          <span>Paid plans from ${PLANS[0].priceMonthly}/mo</span>
        </div>
      </div>
    ),
    size
  );
}
