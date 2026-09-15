import type { LeadField } from "@/lib/leads/fields";

// The questions MAIRO asks on a business's behalf, written per trade.
//
// The whole promise here is that nobody builds a form. A business owner asked
// to design one produces either three fields that tell them nothing or fifteen
// that nobody finishes, and asked to do it inside Facebook's form builder they
// mostly do not do it at all. So MAIRO writes them, from the one thing it
// already knows: the niche it classified them into at signup.
//
// Two rules held throughout, because they are what separates a form that gets
// filled in from one that gets abandoned:
//
// Ask for the least that lets the business act. Every question after the third
// costs completions, and a lead you can phone is worth more than a detailed
// answer you never receive. Anything the business could find out on the call
// itself is not on these lists.
//
// And ask questions that change what happens next. "How did you hear about
// us?" is a question for a survey. "When do you need this done?" decides who
// gets called first, so it earns its place.

export type LeadFormTemplate = {
  headline: string;
  /** One line under the headline. What they get for filling it in. */
  description: string;
  fields: LeadField[];
  /** What is shown once it is sent. */
  thankYou: string;
};

const NAME: LeadField = { key: "name", type: "FULL_NAME", label: "Your name", required: true };
const EMAIL: LeadField = { key: "email", type: "EMAIL", label: "Email", required: true };
const PHONE: LeadField = { key: "phone", type: "PHONE", label: "Phone", required: true };

const URGENCY = (label: string, options: string[]): LeadField => ({
  key: "timing",
  type: "CHOICE",
  label,
  required: true,
  options,
});

/**
 * The form for a business in this niche.
 *
 * Falls back to a general enquiry form, which is three questions and a note —
 * the shape that works for any business MAIRO could not place.
 */
export function templateFor(nicheId: string, businessName: string): LeadFormTemplate {
  const template = TEMPLATES[nicheId] ?? TEMPLATES.general;
  return template(businessName);
}

type Builder = (businessName: string) => LeadFormTemplate;

const TEMPLATES: Record<string, Builder> = {
  home_services: (name) => ({
    headline: `Get a quote from ${name}`,
    description: "Tell us what needs doing and we'll come back with a price.",
    thankYou: "Thanks — we've got it. Expect a call shortly.",
    fields: [
      NAME,
      PHONE,
      { key: "job", type: "SHORT_TEXT", label: "What needs doing?", required: true, placeholder: "e.g. leaking tap in the kitchen" },
      URGENCY("How soon?", ["It's an emergency", "This week", "Next few weeks", "Just getting prices"]),
      { key: "postcode", type: "ZIP", label: "Postcode", required: true },
    ],
  }),

  health_clinic: (name) => ({
    headline: `Book with ${name}`,
    description: "Leave your details and we'll call to find a time that suits you.",
    thankYou: "Thanks — we'll be in touch to confirm your appointment.",
    fields: [
      NAME,
      PHONE,
      URGENCY("What do you need?", ["A check-up", "Something is hurting", "A treatment I've been quoted for", "Not sure yet"]),
      { key: "insurance", type: "YES_NO", label: "Are you using insurance?", required: false },
    ],
  }),

  beauty: (name) => ({
    headline: `Book an appointment at ${name}`,
    description: "Tell us what you're after and we'll find you a slot.",
    thankYou: "Thanks — we'll message you with times.",
    fields: [
      NAME,
      PHONE,
      { key: "service", type: "SHORT_TEXT", label: "What are you booking?", required: true, placeholder: "e.g. balayage, gel nails" },
      URGENCY("When suits you?", ["This week", "Next week", "Later this month", "I'm flexible"]),
    ],
  }),

  fitness: (name) => ({
    headline: `Start at ${name}`,
    description: "Leave your details and we'll set up your first session.",
    thankYou: "Thanks — we'll be in touch about your first session.",
    fields: [
      NAME,
      PHONE,
      URGENCY("What are you after?", ["Losing weight", "Getting stronger", "Training for something", "Just getting moving"]),
      { key: "experience", type: "CHOICE", label: "Trained before?", required: false, options: ["Complete beginner", "On and off", "Regularly"] },
    ],
  }),

  professional: (name) => ({
    headline: `Talk to ${name}`,
    description: "Tell us what you need and we'll come back to you.",
    thankYou: "Thanks — we'll reply shortly.",
    fields: [
      NAME,
      EMAIL,
      PHONE,
      { key: "need", type: "LONG_TEXT", label: "What do you need help with?", required: true },
      { key: "company", type: "SHORT_TEXT", label: "Company", required: false },
    ],
  }),

  real_estate: (name) => ({
    headline: `Speak to ${name}`,
    description: "Tell us what you're looking for and we'll get straight back.",
    thankYou: "Thanks — we'll be in touch today.",
    fields: [
      NAME,
      PHONE,
      { key: "intent", type: "CHOICE", label: "Are you buying or selling?", required: true, options: ["Buying", "Selling", "Renting out", "Looking to rent"] },
      { key: "area", type: "SHORT_TEXT", label: "Which area?", required: true },
      URGENCY("When are you looking to move?", ["Within a month", "Two to three months", "Six months or so", "Just looking"]),
    ],
  }),

  education: (name) => ({
    headline: `Enquire about ${name}`,
    description: "Tell us what you'd like to study and we'll send the details.",
    thankYou: "Thanks — the details are on their way.",
    fields: [
      NAME,
      EMAIL,
      PHONE,
      { key: "course", type: "SHORT_TEXT", label: "What are you interested in?", required: true },
      URGENCY("When would you start?", ["As soon as possible", "Next term", "Next year", "Just researching"]),
    ],
  }),

  automotive: (name) => ({
    headline: `Enquire at ${name}`,
    description: "Tell us what you're after and we'll come back with options.",
    thankYou: "Thanks — we'll be in touch shortly.",
    fields: [
      NAME,
      PHONE,
      { key: "vehicle", type: "SHORT_TEXT", label: "Which vehicle or service?", required: true },
      { key: "partex", type: "YES_NO", label: "Part exchange?", required: false },
      URGENCY("When do you need it?", ["This week", "This month", "In a few months", "Just pricing up"]),
    ],
  }),

  events: (name) => ({
    headline: `Enquire with ${name}`,
    description: "Tell us about your event and we'll check availability.",
    thankYou: "Thanks — we'll come back with availability and a price.",
    fields: [
      NAME,
      EMAIL,
      PHONE,
      { key: "occasion", type: "SHORT_TEXT", label: "What's the occasion?", required: true },
      { key: "guests", type: "NUMBER", label: "Roughly how many people?", required: false },
    ],
  }),

  restaurant: (name) => ({
    headline: `Book a table at ${name}`,
    description: "Leave your details and we'll confirm your table.",
    thankYou: "Thanks — we'll confirm your table shortly.",
    fields: [
      NAME,
      PHONE,
      { key: "guests", type: "NUMBER", label: "How many people?", required: true },
      { key: "when", type: "SHORT_TEXT", label: "Which day and time?", required: true, placeholder: "e.g. Friday evening" },
    ],
  }),

  saas: (name) => ({
    headline: `See ${name} in action`,
    description: "Leave your details and we'll set up a walkthrough.",
    thankYou: "Thanks — we'll email you to arrange a time.",
    fields: [
      NAME,
      { key: "email", type: "EMAIL", label: "Work email", required: true },
      { key: "company", type: "SHORT_TEXT", label: "Company", required: true },
      { key: "size", type: "CHOICE", label: "How big is your team?", required: false, options: ["Just me", "2–10", "11–50", "51–200", "200+"] },
    ],
  }),

  ecommerce: (name) => ({
    headline: `Hear from ${name} first`,
    description: "Leave your email for early access and offers.",
    thankYou: "You're on the list.",
    fields: [NAME, EMAIL],
  }),

  general: (name) => ({
    headline: `Get in touch with ${name}`,
    description: "Leave your details and we'll come straight back to you.",
    thankYou: "Thanks — we'll be in touch shortly.",
    fields: [
      NAME,
      EMAIL,
      PHONE,
      { key: "message", type: "LONG_TEXT", label: "How can we help?", required: false },
    ],
  }),
};

/** Every niche a template was written for. Used by the check script. */
export function templatedNiches(): string[] {
  return Object.keys(TEMPLATES);
}
