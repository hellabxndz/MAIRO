// The questions a lead form can ask, and what a valid answer looks like.
//
// Written once, here, because the same list has to satisfy three things that
// would otherwise drift apart: the form MAIRO hosts and renders, the check
// that a submitted answer is usable, and — later — the question objects Meta
// wants when the same form is pushed to a Facebook Page.
//
// The split that matters is PREFILLED vs asked. Meta knows a person's name,
// email and phone already and fills those in for them, which is the entire
// reason its native form converts better than a landing page. A field MAIRO
// invents cannot be prefilled by anybody, so every question here declares
// which it is, and the Meta mapping is then a lookup rather than a guess.

export type LeadFieldType =
  // Meta can fill these from the person's profile.
  | "FULL_NAME"
  | "EMAIL"
  | "PHONE"
  | "CITY"
  | "ZIP"
  // Anything the business wants to know that Meta has no idea about.
  | "SHORT_TEXT"
  | "LONG_TEXT"
  | "NUMBER"
  | "CHOICE"
  | "YES_NO";

export type LeadField = {
  /** Stable across edits — answers are stored against it. */
  key: string;
  type: LeadFieldType;
  label: string;
  required: boolean;
  /** CHOICE only. Ignored otherwise. */
  options?: string[];
  /** Greyed-out example text. Not a default value. */
  placeholder?: string;
};

type Kind = {
  /** What Meta calls it. CUSTOM means "a question Meta cannot prefill". */
  metaType: string;
  /** Meta fills this from the person's profile. */
  prefilled: boolean;
  /** The HTML input type for the page MAIRO hosts. */
  input: "text" | "email" | "tel" | "number" | "textarea" | "select" | "radio";
  autoComplete?: string;
};

export const FIELD_KINDS: Record<LeadFieldType, Kind> = {
  FULL_NAME: { metaType: "FULL_NAME", prefilled: true, input: "text", autoComplete: "name" },
  EMAIL: { metaType: "EMAIL", prefilled: true, input: "email", autoComplete: "email" },
  PHONE: { metaType: "PHONE", prefilled: true, input: "tel", autoComplete: "tel" },
  CITY: { metaType: "CITY", prefilled: true, input: "text", autoComplete: "address-level2" },
  ZIP: { metaType: "ZIP", prefilled: true, input: "text", autoComplete: "postal-code" },
  SHORT_TEXT: { metaType: "CUSTOM", prefilled: false, input: "text" },
  LONG_TEXT: { metaType: "CUSTOM", prefilled: false, input: "textarea" },
  NUMBER: { metaType: "CUSTOM", prefilled: false, input: "number" },
  CHOICE: { metaType: "CUSTOM", prefilled: false, input: "select" },
  YES_NO: { metaType: "CUSTOM", prefilled: false, input: "radio" },
};

/** Sensible ceiling per answer, so one submission cannot carry a novel. */
const MAX_ANSWER = 2000;

export type AnswerCheck = { ok: true; value: string } | { ok: false; error: string };

/**
 * Checks one answer and returns the value to store.
 *
 * Errors are written for the person filling the form in, not for a developer —
 * this runs on a page a stranger reached from an advertisement, and "invalid
 * input" on a form you did not want to fill in is where people leave.
 */
export function validateAnswer(field: LeadField, raw: string | null): AnswerCheck {
  const value = (raw ?? "").trim();

  if (value.length === 0) {
    return field.required
      ? { ok: false, error: `${field.label} is needed.` }
      : { ok: true, value: "" };
  }

  if (value.length > MAX_ANSWER) {
    return { ok: false, error: `${field.label} is too long.` };
  }

  switch (field.type) {
    case "EMAIL":
      // Deliberately loose. Anything stricter rejects real addresses, and the
      // business finds out an address is wrong by writing to it, not here.
      return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(value)
        ? { ok: true, value }
        : { ok: false, error: "That email address looks incomplete." };

    case "PHONE": {
      const digits = value.replace(/\D/g, "");
      return digits.length >= 7 && digits.length <= 15
        ? { ok: true, value }
        : { ok: false, error: "That phone number looks incomplete." };
    }

    case "NUMBER":
      return /^-?\d+(\.\d+)?$/.test(value)
        ? { ok: true, value }
        : { ok: false, error: `${field.label} should be a number.` };

    case "CHOICE":
      // Trusting the select would let anybody post anything; the options are
      // the whole point of the question.
      return field.options?.includes(value)
        ? { ok: true, value }
        : { ok: false, error: `Pick one of the options for ${field.label}.` };

    case "YES_NO":
      return value === "Yes" || value === "No"
        ? { ok: true, value }
        : { ok: false, error: `Answer yes or no for ${field.label}.` };

    default:
      return { ok: true, value };
  }
}

/**
 * The same question in the shape Meta's leadgen_forms endpoint wants.
 *
 * Unused until the native instant form ships, and written now because the
 * point of designing the fields around Meta's own list is that pushing them
 * later is a mapping rather than a redesign. A prefilled question carries only
 * its type — Meta supplies the label and fills the answer. Everything else is
 * CUSTOM and has to say what it is asking.
 */
export function toMetaQuestion(field: LeadField): Record<string, unknown> {
  const kind = FIELD_KINDS[field.type];
  if (kind.prefilled) return { type: kind.metaType };

  const question: Record<string, unknown> = {
    type: "CUSTOM",
    key: field.key,
    label: field.label,
  };
  if (field.type === "CHOICE" && field.options?.length) {
    question.options = field.options.map((o) => ({ key: o, value: o }));
  }
  if (field.type === "YES_NO") {
    question.options = [
      { key: "Yes", value: "Yes" },
      { key: "No", value: "No" },
    ];
  }
  return question;
}

/**
 * Which stored answer is the person's email, and which the phone.
 *
 * Needed because a lead is only worth anything to the ad networks if it can be
 * matched back to the person who saw the ad, and that matching is done on a
 * hashed email or phone. Found by field type rather than by label, so a
 * business that renames "Email" to "Where should we reply?" does not silently
 * stop its conversions being attributed.
 */
export function contactFrom(
  fields: LeadField[],
  answers: Record<string, string>
): { email: string | null; phone: string | null } {
  const find = (type: LeadFieldType) => {
    const field = fields.find((f) => f.type === type);
    const value = field ? answers[field.key]?.trim() : "";
    return value && value.length > 0 ? value : null;
  };
  return { email: find("EMAIL"), phone: find("PHONE") };
}
