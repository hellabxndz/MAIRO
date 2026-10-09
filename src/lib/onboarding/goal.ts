// The goal and budget MAIRO suggests on the setup screen — always with the
// reason, always changeable. A suggestion names what it's based on (the
// website's main button, the industry the owner typed) so the owner can see
// whether it applies to them.
//
// Pure: the screen and the tests share it.

export type SetupGoal = "LEADS" | "SALES" | "TRAFFIC" | "AWARENESS" | "APP_PROMOTION";

export const SETUP_GOALS: { value: SetupGoal; label: string; sub: string }[] = [
  { value: "LEADS", label: "More leads or booked appointments", sub: "Calls, enquiries, forms and bookings" },
  { value: "SALES", label: "More online sales", sub: "People buying from your website" },
  { value: "TRAFFIC", label: "More website visits", sub: "People reading your site" },
  { value: "AWARENESS", label: "More people knowing your brand", sub: "Reach as many local people as possible" },
  { value: "APP_PROMOTION", label: "More app installs", sub: "People downloading your app" },
];

export function recommendGoal(input: { industry?: string | null; primaryCta?: string | null; offering?: string | null; presence?: string | null }): { goal: SetupGoal; why: string } {
  const cta = (input.primaryCta ?? "").trim();
  if (cta) {
    if (/shop|buy|add to (cart|bag)|order|checkout|store/i.test(cta)) return { goal: "SALES", why: `Your website's main button says “${cta}”, so it sells online.` };
    if (/book|appointment|schedule|reserve|consult|quote|estimate|call|contact|enquir|inquir/i.test(cta)) return { goal: "LEADS", why: `Your website's main button says “${cta}”, so people get in touch or book.` };
    if (/download|install|app store|google play/i.test(cta)) return { goal: "APP_PROMOTION", why: `Your website's main button says “${cta}”.` };
  }
  const about = `${input.industry ?? ""} ${input.offering ?? ""}`;
  if (/\bapp\b|mobile app|ios|android/i.test(about)) return { goal: "APP_PROMOTION", why: "You described an app." };
  if (/shop|store|boutique|apparel|clothing|fashion|e-?commerce|retail|jewel|cosmetic|skincare|merch|candle|gift/i.test(about) || input.presence === "online") {
    return { goal: "SALES", why: "You sell products, so most businesses like yours start with online sales." };
  }
  if (/dent|clinic|salon|spa|barber|law|attorney|plumb|roof|clean|repair|contractor|hvac|electric|landscap|real estate|realtor|insurance|consult|coach|therap|fitness|gym|tutor|vet|chiro|med|wedding|photograph/i.test(about)) {
    return { goal: "LEADS", why: "Businesses like yours usually grow from enquiries and bookings." };
  }
  return { goal: "LEADS", why: "Most businesses start with leads — people getting in touch — because each one can be followed up." };
}

/** The monthly budget suggested, with what it means per day. */
export const RECOMMENDED_MONTHLY = 1000;

export function budgetMeaning(monthly: number): { perDay: number; text: string } {
  const perDay = Math.round(monthly / 30.4);
  const text =
    monthly < 300
      ? `About $${perDay} a day. That works, but Meta learns slowly at this level — expect the first two to three weeks to be mostly learning.`
      : monthly <= 3000
        ? `About $${perDay} a day — enough for Meta to learn who responds within the first couple of weeks.`
        : `About $${perDay} a day. MAIRO starts carefully and only suggests spending more once results justify it.`;
  return { perDay, text };
}
