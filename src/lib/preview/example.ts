import { EXAMPLES, ONBOARDING_TYPE, type ExampleType } from "@/lib/demo/examples";
import { emptyFacts, type FactKey, type PreviewFacts } from "./build";

// The facts behind "Try an example": one of the landing story's invented
// businesses, put through the same preview builder a real website goes
// through. Marked as an example everywhere it shows; no website is read.

const EXTRA: Record<ExampleType, Pick<PreviewFacts, "offer" | "proof" | "problem" | "destinations">> = {
  shop: { offer: "Free shipping over $60", proof: "Thrown and glazed in our own studio", problem: "", destinations: { booking: null, form: false, phone: false, checkout: true } },
  service: { offer: "Free estimate on every job", proof: "Family-run since 2009. Licensed and insured", problem: "Leak under the sink", destinations: { booking: null, form: false, phone: true, checkout: false } },
  appointments: { offer: "New clients get free fringe trims between cuts", proof: "", problem: "", destinations: { booking: null, form: false, phone: false, checkout: false } },
  brands: { offer: "New clients get free fringe trims between cuts", proof: "", problem: "", destinations: { booking: null, form: false, phone: false, checkout: false } },
};

export function exampleFacts(type: ExampleType): PreviewFacts {
  const ex = EXAMPLES[type];
  const f = emptyFacts(ex.url);
  const extra = EXTRA[type];
  Object.assign(f, {
    name: ex.name,
    offering: ex.profile.offer,
    customer: ex.profile.audience,
    location: ex.profile.location,
    ...extra,
    businessType: ONBOARDING_TYPE[type],
    typeFrom: "example",
    goal: type === "shop" ? "sales" : type === "appointments" || type === "brands" ? "bookings" : "leads",
    pixelSeen: type === "shop" ? true : null,
  });
  for (const k of ["name", "offering", "customer", "location", "offer", "proof", "problem"] as FactKey[]) if (f[k]) f.sources[k] = { from: "example" };
  return f;
}
