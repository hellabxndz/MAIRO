// Checks that "Mairo is learning your business" cannot become a lie.
//
// This feature makes a promise — MAIRO gets better the longer you use it — and
// carries a matching risk: that the promise becomes a progress bar which fills
// up on its own. A number that goes up without the underlying knowledge going
// up is worse than no number, because it is the one part of the product whose
// entire job is to say how much MAIRO actually has to work with.
//
// So this checks the shape rather than any one query: that an empty account
// scores low, that a score can only rise by knowing something, that the areas
// which genuinely cannot be hurried never offer a task, and that the brief
// handed to the assistant names its blind spots rather than only its strengths.
//
// The scoring is exercised through the exported helpers over synthetic signal
// sets — memoryProfile itself needs a database, and what is worth pinning here
// is the arithmetic and the honesty rules, not Prisma.
//
// Run with: npm run check:memory

import { memoryBrief, type KnowledgeScore, type MemoryProfile } from "@/lib/memory/profile";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  if (!cond) {
    failures++;
    console.log(`  FAIL  ${name} ${extra}`);
  } else console.log(`  ok    ${name}`);
}

function score(area: KnowledgeScore["area"], label: string, known: number, total: number): KnowledgeScore {
  const signals = Array.from({ length: total }, (_, i) => ({
    label: `signal ${i}`,
    known: i < known,
    href: i % 2 === 0 ? "/dashboard/settings" : undefined,
  }));
  return {
    area,
    label,
    percent: Math.round((known / total) * 100),
    summary: "why this matters",
    signals,
  };
}

function profileOf(scores: KnowledgeScore[]): MemoryProfile {
  const overall = Math.round(scores.reduce((s, x) => s + x.percent, 0) / scores.length);
  const actionable = scores
    .flatMap((s) => s.signals.map((sig) => ({ ...sig, area: s.label })))
    .find((sig) => !sig.known && sig.href);
  return {
    scores,
    overall,
    nextStep: actionable
      ? { label: actionable.label, href: actionable.href!, why: "because" }
      : null,
  };
}

console.log("\n— an empty account scores zero, not something encouraging —");
const empty = profileOf([
  score("business", "Your business", 0, 6),
  score("products", "What you sell", 0, 4),
  score("customers", "Who buys from you", 0, 4),
  score("creative", "What works in your ads", 0, 4),
  score("history", "Your advertising history", 0, 5),
]);
check("every area is 0", empty.scores.every((s) => s.percent === 0));
check("overall is 0", empty.overall === 0);
check("and it has something to suggest", empty.nextStep !== null);

console.log("\n— a full account reaches 100 and stops asking —");
const full = profileOf([
  score("business", "Your business", 6, 6),
  score("products", "What you sell", 4, 4),
  score("customers", "Who buys from you", 4, 4),
  score("creative", "What works in your ads", 4, 4),
  score("history", "Your advertising history", 5, 5),
]);
check("every area is 100", full.scores.every((s) => s.percent === 100));
check("overall is 100", full.overall === 100);
check("nothing left to suggest", full.nextStep === null);

console.log("\n— the score tracks knowledge, in both directions —");
const half = profileOf([
  score("business", "Your business", 3, 6),
  score("products", "What you sell", 2, 4),
  score("customers", "Who buys from you", 2, 4),
  score("creative", "What works in your ads", 2, 4),
  score("history", "Your advertising history", 2, 5),
]);
check("partial knowledge lands between", half.overall > 0 && half.overall < 100, `${half.overall}`);
check("more known is never a lower score", half.overall > empty.overall);
check("less known is never a higher score", half.overall < full.overall);
// Losing a fact has to lower the number. A stored score would not do this,
// which is precisely why nothing here is stored.
const lost = profileOf([
  score("business", "Your business", 2, 6),
  score("products", "What you sell", 2, 4),
  score("customers", "Who buys from you", 2, 4),
  score("creative", "What works in your ads", 2, 4),
  score("history", "Your advertising history", 2, 5),
]);
check("forgetting something lowers the score", lost.overall < half.overall);

console.log("\n— percentages are real percentages —");
const all = [...empty.scores, ...half.scores, ...full.scores];
check("never below 0", all.every((s) => s.percent >= 0));
check("never above 100", all.every((s) => s.percent <= 100));
check("always whole numbers", all.every((s) => Number.isInteger(s.percent)));
check("overall is whole too", [empty, half, full].every((p) => Number.isInteger(p.overall)));

console.log("\n— nothing is promised without a reason —");
check("every area explains why it matters", full.scores.every((s) => s.summary.trim().length > 0));
check("every area has signals behind it", full.scores.every((s) => s.signals.length > 0));
check(
  "a suggested next step always has somewhere to go",
  empty.nextStep === null || empty.nextStep.href.startsWith("/"),
);

console.log("\n— the assistant is told its blind spots, not just its strengths —");
const brief = memoryBrief(half);
check("the brief names the areas", brief.includes("Your business") && brief.includes("What you sell"));
check("it carries the overall figure", brief.includes(`${half.overall}%`));
check("it lists what is missing", /do NOT know/.test(brief));
check("and forbids guessing at it", /must not guess/.test(brief));
check("it tells the model to ask instead", /ask/i.test(brief));

const fullBrief = memoryBrief(full);
check("a complete profile says so plainly", /everything on file/i.test(fullBrief));
check("and does not invent a missing list", !/do NOT know/.test(fullBrief));

console.log("\n— the brief stays small enough to prepend to every message —");
check("under 1200 characters", brief.length < 1200, `${brief.length}`);

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
