import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RenderFrame } from "@/components/hero-story/render-frame";
import { exampleFrom } from "@/lib/demo/examples";

// A bare frame of the landing story for the video renderer. Off unless the
// server was started with MAIRO_RENDER_ROUTE=1 — it's a build tool, not a page.

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function RenderPage({ searchParams }: PageProps<"/demo/render">) {
  // Read the request first: it keeps this page out of the build's prerender, so the switch is checked when it's asked for.
  const { type, layout, clip } = await searchParams;
  if (process.env.MAIRO_RENDER_ROUTE !== "1") notFound();
  const walk = clip === "walkthrough";
  return (
    <div style={{ margin: 0, background: "#05060d" }}>
      <RenderFrame
        clip={walk ? "walkthrough" : "story"}
        type={walk ? "service" : exampleFrom(typeof type === "string" ? type : null)}
        layout={layout === "narrow" ? "narrow" : "wide"}
        label={walk ? "Product demo — sample data" : "Example campaign — sample data"}
      />
    </div>
  );
}
