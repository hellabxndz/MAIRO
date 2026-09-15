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

/** What each question type is called where a person picks one. */
export const FIELD_TYPE_LABELS: Record<LeadFieldType, string> = {
  FULL_NAME: "Their name",
  EMAIL: "Email address",
  PHONE: "Phone number",
  CITY: "Town or city",
  ZIP: "Postcode",
  SHORT_TEXT: "Short answer",
  LONG_TEXT: "Long answer",
  NUMBER: "A number",
  CHOICE: "Pick one of my options",
  YES_NO: "Yes or no",
};

/** Ceilings, and the reasons for them rather than round numbers. */
export const MAX_FIELDS = 10;
export const MAX_LABEL = 120;
export const MAX_OPTIONS = 12;

/**
 * Turns a question's wording into a stable key.
 *
 * Answers are stored against the key, so it must not change when somebody
 * fixes a typo in the label. Generated once when a question is added and kept
 * from then on; this only runs for new ones.
 */
export function keyFor(label: string, taken: Set<string>): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 30) || "question";

  if (!taken.has(base)) return base;
  for (let n = 2; n < 100; n++) {
    const candidate = `${base}_${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}_${Date.now()}`;
}

export type FieldsCheck = { ok: true; fields: LeadField[] } | { ok: false; error: string };

/**
 * Checks a whole form somebody built themselves.
 *
 * The rules that are refusals rather than suggestions are the ones where the
 * form would otherwise be broken in a way nobody notices until the enquiries
 * do not arrive: a question with no wording, a "pick one" with nothing to pick,
 * two questions sharing a key so one silently overwrites the other — and, the
 * one that matters most, a form with no way to contact the person who filled it
 * in. That last one collects enquiries the business can never answer, and it
 * looks like it is working the entire time.
 */
export function validateFields(raw: LeadField[]): FieldsCheck {
  if (raw.length === 0) return { ok: false, error: "A form needs at least one question." };
  if (raw.length > MAX_FIELDS) {
    return {
      ok: false,
      error: `That's more than ${MAX_FIELDS} questions. Long forms get abandoned — cut it down and ask the rest when you reply.`,
    };
  }

  const seen = new Set<string>();
  const fields: LeadField[] = [];

  for (const field of raw) {
    const label = field.label?.trim() ?? "";
    if (label.length === 0) return { ok: false, error: "Every question needs wording." };
    if (label.length > MAX_LABEL) {
      return { ok: false, error: `"${label.slice(0, 30)}…" is too long for a question.` };
    }

    if (!(field.type in FIELD_KINDS)) {
      return { ok: false, error: `"${label}" has no answer type.` };
    }

    const key = field.key?.trim() || keyFor(label, seen);
    if (seen.has(key)) {
      return { ok: false, error: `Two questions are stored under the same name ("${label}").` };
    }
    seen.add(key);

    let options: string[] | undefined;
    if (field.type === "CHOICE") {
      options = (field.options ?? []).map((o) => o.trim()).filter(Boolean);
      if (options.length < 2) {
        return { ok: false, error: `"${label}" needs at least two options to pick between.` };
      }
      if (options.length > MAX_OPTIONS) {
        return { ok: false, error: `"${label}" has too many options to choose from.` };
      }
      if (new Set(options).size !== options.length) {
        return { ok: false, error: `"${label}" lists the same option twice.` };
      }
    }

    fields.push({
      key,
      type: field.type,
      label,
      required: Boolean(field.required),
      ...(options ? { options } : {}),
      ...(field.placeholder?.trim() ? { placeholder: field.placeholder.trim() } : {}),
    });
  }

  if (!fields.some((f) => f.type === "EMAIL" || f.type === "PHONE")) {
    return {
      ok: false,
      error:
        "Add an email address or a phone number. Without one you'll collect enquiries you can't reply to.",
    };
  }

  if (!fields.some((f) => f.required)) {
    return {
      ok: false,
      error: "Make at least one question required, or people can send you an empty form.",
    };
  }

  return { ok: true, fields };
}

/**
 * Whether a business is shown the Enquiries screen at all.
 *
 * Most businesses never collect an enquiry — a shop sending people to its
 * website has no form and no use for the page — so it is not a permanent
 * sidebar item. It appears when it starts being true, which for almost
 * everyone is the moment a campaign picks "fill in a form" and MAIRO writes
 * one.
 *
 * Deliberately any form, not Meta's instant form. A business on the page MAIRO
 * hosts collects exactly the same enquiries onto exactly this screen, and
 * narrowing this to the native form would hide real leads from the people they
 * belong to.
 *
 * Having a form is the whole condition, and the schema is why: Lead.leadFormId
 * is required and cascades, so a form cannot be deleted while leaving its
 * enquiries behind — they go with it. There is no state where a business has
 * enquiries and no form, so there is nothing else to check for.
 */
export function showsEnquiries(input: { hasForm: boolean }): boolean {
  return input.hasForm;
}
