// The questions MAIRO asks on a business's behalf, and what it accepts as an answer.
//
//   npm run check:leads
//
// Everything here fails silently in production if it is wrong. A duplicate
// field key silently overwrites an answer. A template with ten questions looks
// fine on the dashboard and quietly halves completions. A CHOICE question with
// no options renders an empty dropdown nobody can get past. None of that
// throws, and none of it is visible until a business wonders why the ads
// produced nothing.

import {
  FIELD_KINDS,
  MAX_FIELDS,
  contactFrom,
  keyFor,
  toMetaQuestion,
  validateAnswer,
  validateFields,
} from "@/lib/leads/fields";
import type { LeadField } from "@/lib/leads/fields";
import { templateFor, templatedNiches } from "@/lib/leads/templates";
import { allNiches } from "@/lib/tracking/niches";

let bad = 0;
const ok = (n: string, c: boolean, x = "") => {
  if (!c) {
    bad++;
    console.log(`  FAIL ${n} ${x}`);
  } else console.log(`  ok   ${n}`);
};

console.log("\n— every template is a form somebody would actually finish —");
{
  // The ceiling is a judgement, not a law, but it is the judgement the whole
  // feature rests on: MAIRO asks the least that lets the business act.
  const MAX_QUESTIONS = 5;

  for (const niche of templatedNiches()) {
    const t = templateFor(niche, "Acme");

    ok(`${niche}: has questions`, t.fields.length > 0);
    ok(
      `${niche}: asks at most ${MAX_QUESTIONS}`,
      t.fields.length <= MAX_QUESTIONS,
      `${t.fields.length}`
    );

    const keys = t.fields.map((f) => f.key);
    ok(`${niche}: no duplicate keys`, new Set(keys).size === keys.length, keys.join(", "));

    ok(
      `${niche}: there is a way to contact them`,
      t.fields.some((f) => f.type === "EMAIL" || f.type === "PHONE")
    );

    ok(
      `${niche}: at least one answer is required`,
      t.fields.some((f) => f.required)
    );

    for (const f of t.fields) {
      if (f.type === "CHOICE") {
        ok(
          `${niche}: "${f.label}" offers choices`,
          Array.isArray(f.options) && f.options.length >= 2,
          `${f.options?.length ?? 0}`
        );
      }
      ok(`${niche}: "${f.key}" has a label`, f.label.trim().length > 0);
    }

    ok(`${niche}: the business is named in the headline`, t.headline.includes("Acme"));
    ok(`${niche}: says something after sending`, t.thankYou.trim().length > 0);
  }
}

console.log("\n— every niche the product can classify has a form —");
{
  // A niche with no template falls back to general, which works but is a worse
  // form than one written for the trade. Worth knowing when a niche is added.
  const templated = new Set(templatedNiches());
  for (const niche of allNiches()) {
    ok(`${niche.id} has its own questions`, templated.has(niche.id));
  }
}

console.log("\n— an answer is checked against the question that asked it —");
{
  const required = (type: LeadField["type"], extra: Partial<LeadField> = {}): LeadField => ({
    key: "k",
    type,
    label: "It",
    required: true,
    ...extra,
  });

  ok("a required answer cannot be blank", validateAnswer(required("SHORT_TEXT"), "  ").ok === false);
  ok(
    "an optional one can",
    validateAnswer({ ...required("SHORT_TEXT"), required: false }, "").ok === true
  );

  ok("a real email passes", validateAnswer(required("EMAIL"), "sam@example.com").ok === true);
  ok("a bare word does not", validateAnswer(required("EMAIL"), "sam").ok === false);
  ok("nor does a missing domain", validateAnswer(required("EMAIL"), "sam@example").ok === false);

  ok("a phone number passes", validateAnswer(required("PHONE"), "(555) 123-4567").ok === true);
  ok("four digits do not", validateAnswer(required("PHONE"), "1234").ok === false);

  ok("a number passes", validateAnswer(required("NUMBER"), "12").ok === true);
  ok("and a word does not", validateAnswer(required("NUMBER"), "twelve").ok === false);

  const choice = required("CHOICE", { options: ["A", "B"] });
  ok("a listed choice passes", validateAnswer(choice, "A").ok === true);
  ok(
    "anything else is refused even though the browser sent it",
    validateAnswer(choice, "C").ok === false
  );

  ok("yes passes", validateAnswer(required("YES_NO"), "Yes").ok === true);
  ok("maybe does not", validateAnswer(required("YES_NO"), "Maybe").ok === false);

  ok(
    "a novel is refused",
    validateAnswer(required("LONG_TEXT"), "x".repeat(5000)).ok === false
  );

  const err = validateAnswer(required("EMAIL"), "sam");
  ok(
    "the message is written for the person filling it in",
    !err.ok && !/invalid|error/i.test(err.error),
    !err.ok ? err.error : ""
  );
}

console.log("\n— the contact details can be found whatever they were renamed to —");
{
  const fields: LeadField[] = [
    { key: "name", type: "FULL_NAME", label: "Your name", required: true },
    { key: "reply_to", type: "EMAIL", label: "Where should we reply?", required: true },
    { key: "ring", type: "PHONE", label: "Best number", required: false },
  ];
  const found = contactFrom(fields, { name: "Sam", reply_to: "sam@example.com", ring: "5551234567" });
  ok("email found by type, not label", found.email === "sam@example.com");
  ok("phone found by type, not label", found.phone === "5551234567");

  const partial = contactFrom(fields, { name: "Sam" });
  ok("nothing there is null rather than empty string", partial.email === null && partial.phone === null);
}

console.log("\n— the same questions can be handed to Meta later —");
{
  // The reason the field list was modelled on Meta's own: pushing a form to a
  // Facebook Page should be a mapping, not a redesign.
  const prefilled = toMetaQuestion({
    key: "email",
    type: "EMAIL",
    label: "Email",
    required: true,
  });
  ok("a detail Meta knows carries only its type", prefilled.type === "EMAIL");
  ok("and no label, because Meta writes it", prefilled.label === undefined);

  const custom = toMetaQuestion({
    key: "timing",
    type: "CHOICE",
    label: "How soon?",
    required: true,
    options: ["Now", "Later"],
  });
  ok("a question of MAIRO's own is CUSTOM", custom.type === "CUSTOM");
  ok("it carries its label", custom.label === "How soon?");
  ok("and its options", Array.isArray(custom.options) && custom.options.length === 2);

  const yesNo = toMetaQuestion({ key: "x", type: "YES_NO", label: "Insured?", required: false });
  ok("yes/no becomes two options", Array.isArray(yesNo.options) && yesNo.options.length === 2);

  // Every type has to map to something, or a form built here cannot be pushed.
  for (const [type, kind] of Object.entries(FIELD_KINDS)) {
    ok(`${type} maps to a Meta question type`, kind.metaType.length > 0);
  }
}

console.log("\n— a form somebody built themselves still has to work —");
{
  const name: LeadField = { key: "name", type: "FULL_NAME", label: "Name", required: true };
  const phone: LeadField = { key: "phone", type: "PHONE", label: "Phone", required: true };

  const good = validateFields([name, phone]);
  ok("a name and a phone number is a working form", good.ok);

  ok("an empty form is refused", validateFields([]).ok === false);
  ok(
    "so is one with no wording",
    validateFields([{ ...name, label: "  " }, phone]).ok === false
  );

  // The two failures that are invisible until the enquiries do not arrive.
  const noContact = validateFields([
    name,
    { key: "q", type: "SHORT_TEXT", label: "What do you need?", required: true },
  ]);
  ok("a form with no way to reply is refused", noContact.ok === false);
  ok(
    "and says why in words a business owner would use",
    !noContact.ok && /reply/i.test(noContact.error),
    !noContact.ok ? noContact.error : ""
  );

  const nothingRequired = validateFields([
    { ...name, required: false },
    { ...phone, required: false },
  ]);
  ok("a form where nothing is required is refused", nothingRequired.ok === false);

  ok(
    "a pick-one with a single option is refused",
    validateFields([name, phone, { key: "c", type: "CHOICE", label: "When?", required: false, options: ["Now"] }])
      .ok === false
  );
  ok(
    "a pick-one with two is fine",
    validateFields([
      name,
      phone,
      { key: "c", type: "CHOICE", label: "When?", required: false, options: ["Now", "Later"] },
    ]).ok
  );
  ok(
    "duplicate options are refused",
    validateFields([
      name,
      phone,
      { key: "c", type: "CHOICE", label: "When?", required: false, options: ["Now", "Now"] },
    ]).ok === false
  );

  ok(
    "two questions cannot share a key",
    validateFields([name, { ...phone, key: "name" }]).ok === false
  );

  const tooMany = Array.from({ length: MAX_FIELDS + 1 }, (_, i) => ({
    key: `k${i}`,
    type: "SHORT_TEXT" as const,
    label: `Q${i}`,
    required: true,
  }));
  ok("more than the ceiling is refused", validateFields([...tooMany, phone]).ok === false);

  // A new question arrives with no key and gets one from its wording.
  const keyed = validateFields([
    { key: "", type: "FULL_NAME", label: "Your full name", required: true },
    phone,
  ]);
  ok("a new question is given a key from its wording", keyed.ok && keyed.fields[0].key === "your_full_name");

  // And an existing one keeps the key its answers are stored against.
  const renamed = validateFields([{ ...name, label: "What should we call you?" }, phone]);
  ok(
    "renaming a question does not orphan its answers",
    renamed.ok && renamed.fields[0].key === "name"
  );

  ok(
    "keyFor does not collide with one already taken",
    keyFor("Phone", new Set(["phone"])) === "phone_2"
  );
}

console.log(bad === 0 ? "\nAll checks passed.\n" : `\n${bad} FAILED\n`);
process.exit(bad === 0 ? 0 : 1);
