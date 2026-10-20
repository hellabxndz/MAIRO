import type { ExampleType } from "@/lib/demo/examples";

// The pictures for the three fictional example businesses — Fernleaf
// Ceramics (shop), Brightwater Plumbing (service) and Juniper Hair Studio
// (appointments, and the agency's brands) — wherever MAIRO shows them: plan
// mock-ups, the walkthrough and product clips, the hero's plan demo. Each is
// a 3D product render made for the website (scripts/showcase-renders/biz.py),
// not a photograph and not a customer's; every place that shows one says it's
// a sample for a fictional business. Each business has three framings: the
// product or service itself, the problem it solves (or how it works), and
// the offer; "site" reuses the first.

type Variant = "demo" | "problem" | "offer" | "site";

const FILE: Record<ExampleType, "shop" | "service" | "salon"> = { shop: "shop", service: "service", appointments: "salon", brands: "salon" };

const LABEL: Record<"shop" | "service" | "salon", Record<Exclude<Variant, "site">, string>> = {
  shop: {
    demo: "A sage stoneware mug of coffee on a walnut table",
    problem: "Sage and cream stoneware mugs and a rust jug on an oak shelf",
    offer: "Two stoneware mugs in an open kraft gift box",
  },
  service: {
    demo: "Chrome drain pipes and shut-off valves under a kitchen sink",
    problem: "A wrench closed on a drain pipe's slip nut under a sink",
    offer: "A free estimate on a clipboard, with a pen and a wrench",
  },
  salon: {
    demo: "A salon chair in front of a round brass mirror",
    problem: "A phone showing an online booking calendar",
    offer: "Salon scissors and a comb with a gift tag for a free fringe trim",
  },
};

export function BusinessArt({ type, variant, className = "h-full w-full" }: { type: ExampleType; variant: Variant; className?: string }) {
  const file = FILE[type];
  const v = variant === "site" ? "demo" : variant;
  return (
    // A plain <img>: these are small, fixed files, and the clip renderer and
    // the plan mock-ups need them in the first paint, sized by the caller.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/showcase/examples/${file}-${v}.jpg`} alt={LABEL[file][v]} className={`block object-cover ${className}`} decoding="async" draggable={false} />
  );
}
