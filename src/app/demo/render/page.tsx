import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RenderFrame } from "@/components/hero-story/render-frame";
import { RenderClip } from "@/components/clips/render-clip";
import { exampleFrom } from "@/lib/demo/examples";
import { isClipId } from "@/lib/demo/clip";

// A bare frame of a product clip, the landing story or the walkthrough for the video renderer. Off unless the
// server was started with MAIRO_RENDER_ROUTE=1 — it's a build tool, not a page.

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function RenderPage({ searchParams }: PageProps<"/demo/render">) {
  // Read the request first: it keeps this page out of the build's prerender, so the switch is checked when it's asked for.
  const { type, layout, clip, captions } = await searchParams;
  if (process.env.MAIRO_RENDER_ROUTE !== "1") notFound();
  // The homepage's product clips and film (components/clips/).
  if (isClipId(clip)) {
    return (
      <div style={{ margin: 0, background: "#05070d" }}>
        <RenderClip id={clip} layout={layout === "narrow" ? "narrow" : "wide"} captions={captions === "1"} />
      </div>
    );
  }
  const walk = clip === "walkthrough";
  return (
    <div style={{ margin: 0, background: "#05060d" }}>
      <RenderFrame
        clip={walk ? "walkthrough" : "story"}
        type={walk ? "service" : exampleFrom(typeof type === "string" ? type : null)}
        layout={layout === "narrow" ? "narrow" : "wide"}
        label="Product demo — sample data"
      />
    </div>
  );
}
