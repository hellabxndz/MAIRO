// Which conversion events a business should send Meta, and when each one
// should fire. Pure; pinned by scripts/check-tracking-setup.ts.
//
// The rule underneath every line: fire on the outcome, not the click. A
// booking-link tap is not a booking; a "Submit" click is not a lead until the
// form has actually been accepted.

export type RecommendedEvent = {
  name: "ViewContent" | "AddToCart" | "InitiateCheckout" | "Purchase" | "Lead" | "Contact" | "Schedule";
  /** Needed to judge the campaign (vs. useful extra signal). */
  required: boolean;
  when: string;
  notWhen: string;
  /** What the event should carry. */
  carries: string;
};

export function recommendedEvents(kind: "shop" | "service" | "unknown", opts: { booking?: boolean; phone?: boolean } = {}): RecommendedEvent[] {
  if (kind === "shop") {
    return [
      { name: "Purchase", required: true, when: "On the order confirmation (thank-you) page, once per order.", notWhen: "Not on the checkout button or the payment page.", carries: "Order value, currency and an event ID shared with any server-side event, so Meta counts the sale once." },
      { name: "InitiateCheckout", required: false, when: "When checkout starts.", notWhen: "Not on the cart button.", carries: "Value and currency if available." },
      { name: "AddToCart", required: false, when: "When an item is actually added to the cart.", notWhen: "Not on hovering or viewing.", carries: "Product ID, value, currency." },
      { name: "ViewContent", required: false, when: "On product pages.", notWhen: "Not on the home page or collections.", carries: "Product ID." },
    ];
  }
  const out: RecommendedEvent[] = [
    { name: "Lead", required: true, when: "After an enquiry form has been accepted — on the thank-you page or the form's success message.", notWhen: "Not when the Submit button is clicked; a click that fails validation isn't a lead.", carries: "No form contents: never names, emails, messages or anything personal in the event or the page address." },
  ];
  if (opts.booking || kind === "service") {
    out.push({ name: "Schedule", required: Boolean(opts.booking), when: "When a booking is confirmed — the booking tool's confirmation page, or its own Meta integration.", notWhen: "Not when someone taps your booking link; opening a calendar isn't booking.", carries: "No personal details." });
  }
  if (opts.phone || kind === "service") {
    out.push({ name: "Contact", required: false, when: "When someone taps your phone number or email link.", notWhen: "It isn't a lead — Meta can't tell whether the call happened.", carries: "Nothing personal." });
  }
  return out;
}
